using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// The always-on lap recorder (#179). It watches live telemetry and appends every completed
/// lap to the lap-history corpus for <em>every</em> session type — practice included —
/// whether or not a plan is armed. Nothing here consults
/// <see cref="SessionPlannerService"/>: a practice grind with no plan running is precisely
/// the case that used to produce nothing, and every lap not recorded is lost to every later
/// feature.
/// <para>
/// Persistence is handed to <c>dispatch</c> rather than performed inline, so a slow or
/// locked disk cannot stall the telemetry read that delivered the frame.
/// </para>
/// </summary>
public sealed class LapHistoryRecorder
{
    private readonly ILapHistoryStore _store;

    // Nullable rather than defaulted to a no-op store. A no-op would still let this recorder
    // set a TraceId for a trace it then threw away, and the lap would advertise a tier nothing
    // can deliver — the exact lie the tier note exists to prevent.
    private readonly ILapTraceStore? _traces;

    private readonly Func<DateTimeOffset> _clock;
    private readonly Func<string> _idFactory;
    private readonly Action<Action> _dispatch;
    private readonly ILog _log;

    // Strictly-forward guard for the trace, so it stays a function of position.
    private const double PositionEpsilon = 1e-6;

    // The in-progress lap's observed samples. Held in memory and resampled once, at the
    // crossing, so a lap's shape costs one list append per frame and nothing on the disk path
    // mid-lap. Both stored tiers come out of this one buffer: the position→time reference
    // curve (#181) and the named-channel trace (#194).
    private readonly List<LapTraceSample> _samples = [];

    private LapHistorySession? _session;
    private int _lastSeenLap;
    private int _sampledLap;
    private double? _fuelAtLastCrossing;
    private double? _energyAtLastCrossing;

    public LapHistoryRecorder(
        ILapHistoryStore store,
        ILapTraceStore? traces = null,
        Func<DateTimeOffset>? clock = null,
        Func<string>? idFactory = null,
        Action<Action>? dispatch = null,
        ILog? log = null)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        // Optional: a caller with nowhere to put traces still records laps and reference
        // curves, and those laps report the thinner tier honestly rather than not being
        // recorded at all.
        _traces = traces;
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _idFactory = idFactory ?? (() => Guid.NewGuid().ToString("N"));
        // Laps complete about once a minute, so the default hand-off is a plain thread-pool
        // queue: the caller returns immediately and ordering per session is preserved by
        // the lock around the session itself.
        _dispatch = dispatch ?? (work => ThreadPool.QueueUserWorkItem(_ => work()));
        _log = log ?? NullLog.Instance;
    }

    /// <summary>The session currently being recorded into, or null when none is open.</summary>
    public LapHistorySession? OpenSession => _session;

    /// <summary>
    /// Folds a live frame into the corpus. Opens a session the first time a usable context
    /// appears, appends a record on each lap crossing, and starts a new session when the
    /// context or session kind changes.
    /// </summary>
    public void Ingest(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        var context = ContextOf(frame.Session);
        if (context is null)
        {
            return;
        }

        var kind = MapKind(frame.Session.SessionType);
        if (_session is not null && !SameRun(_session, context, kind))
        {
            Close();
        }

        _session ??= OpenNew(context, kind);
        // Conditions can change while a session runs (a track dries, grip builds), and the
        // reading that matters is the one in force as laps are being filed.
        _session.Conditions = MapConditions(frame.Conditions);

        LapChannelTrace? trace = null;
        var completed = CompletedLap(frame);
        if (completed is not null)
        {
            // The finished lap is resampled before this frame is sampled: at the line the
            // position has already wrapped and the lap timer has reseeded, so this frame's
            // sample belongs to the lap that is starting, not the one that just ended.
            completed.ReferenceCurve = LapReferenceCurve.FromSamples(
                [.. _samples.Select(sample => (sample.Position, sample.ElapsedSeconds))],
                completed.LapTimeSeconds);

            if (_traces is not null)
            {
                trace = LapChannelTrace.FromSamples(
                    _samples,
                    completed.LapTimeSeconds,
                    _session.Context.TrackLengthMeters);
                if (trace is not null)
                {
                    completed.TraceId = LapTraceId.For(_session.Id, completed.LapNumber);
                }
            }
        }

        Sample(frame);

        if (completed is null)
        {
            return;
        }

        _session.Laps.Add(completed);
        if (trace is not null && completed.TraceId is { } traceId)
        {
            PersistTrace(traceId, trace);
        }

        Persist(_session);
    }

    /// <summary>Ends the open session, stamping when it finished. Safe to call repeatedly.</summary>
    public void Close()
    {
        if (_session is null)
        {
            return;
        }

        var finished = _session;
        finished.EndedAt = _clock();
        _session = null;
        _lastSeenLap = 0;
        _sampledLap = 0;
        _samples.Clear();

        // A session with no completed laps carries nothing a reader could use.
        if (finished.Laps.Count > 0)
        {
            Persist(finished);
        }
    }

    /// <summary>
    /// The bucket this frame belongs to, or null when the game has not told us enough to
    /// file a lap. Guessing here would be worse than not recording: a lap filed under the
    /// wrong context silently corrupts every statistic drawn from it.
    /// </summary>
    private static LapHistoryContext? ContextOf(SessionInfo session)
    {
        if (string.IsNullOrWhiteSpace(session.Game)
            || string.IsNullOrWhiteSpace(session.Track)
            || string.IsNullOrWhiteSpace(session.Car))
        {
            return null;
        }

        return new LapHistoryContext
        {
            Game = session.Game,
            TrackCourse = session.Track,
            CarModel = session.Car,
            TrackLengthMeters = session.TrackLengthMeters,
            CarClass = string.IsNullOrWhiteSpace(session.CarClass) ? null : session.CarClass,
        };
    }

    /// <summary>
    /// Maps the live contract's session type onto the corpus's own on-disk kind. The two are
    /// intentionally separate types; this is the single place they meet.
    /// </summary>
    private static HistorySessionKind MapKind(SessionType sessionType) => sessionType switch
    {
        SessionType.Practice => HistorySessionKind.Practice,
        SessionType.Qualify => HistorySessionKind.Qualifying,
        SessionType.Race => HistorySessionKind.Race,
        SessionType.Warmup => HistorySessionKind.Warmup,
        _ => HistorySessionKind.Unknown,
    };

    /// <summary>
    /// Copies the live conditions onto the corpus's own shape. Nothing is defaulted: a value
    /// the game never reported stays null so a later filter can tell "dry" from "unknown".
    /// </summary>
    private static LapHistoryConditions MapConditions(SessionConditions conditions) => new()
    {
        PathWetness = conditions.PathWetness,
        TrackGripLevel = conditions.TrackGripLevel,
        FuelMultiplier = conditions.FuelMultiplier,
        TireMultiplier = conditions.TireMultiplier,
        FixedSetup = conditions.FixedSetup,
    };

    private static bool SameRun(LapHistorySession session, LapHistoryContext context, HistorySessionKind kind) =>
        session.Kind == kind
        && session.Context.Game == context.Game
        && session.Context.TrackCourse == context.TrackCourse
        && session.Context.CarModel == context.CarModel;

    private LapHistorySession OpenNew(LapHistoryContext context, HistorySessionKind kind) => new()
    {
        Id = _idFactory(),
        Context = context,
        Kind = kind,
        Origin = LapHistoryOrigin.Recorded,
        StartedAt = _clock(),
    };

    /// <summary>
    /// The lap that just finished, or null when this frame is not a crossing. A crossing
    /// needs both a lap-number increment and a completed lap time, so a phantom lap 0 is
    /// never recorded.
    /// </summary>
    private LapHistoryRecord? CompletedLap(TelemetryFrame frame)
    {
        var currentLap = frame.Lap.CurrentLap;
        if (_lastSeenLap == 0)
        {
            _lastSeenLap = currentLap;
            return null;
        }

        if (currentLap <= _lastSeenLap || frame.Lap.LastLapTime <= 0)
        {
            _lastSeenLap = Math.Max(_lastSeenLap, currentLap);
            return null;
        }

        var finished = _lastSeenLap;
        _lastSeenLap = currentLap;

        var fuel = Reported(frame.Car.FuelLiters);
        var energy = Reported(frame.Energy.VirtualEnergy);
        var record = new LapHistoryRecord
        {
            LapNumber = finished,
            IsValid = frame.Lap.IsValid,
            LapTimeSeconds = frame.Lap.LastLapTime,
            SectorsSeconds = [.. frame.Lap.LastLapSectorsSeconds],
            FuelRemainingLiters = fuel,
            FuelUsedLiters = Consumed(_fuelAtLastCrossing, fuel),
            VirtualEnergyRemaining = energy,
            VirtualEnergyUsed = Consumed(_energyAtLastCrossing, energy),
            // A frame always carries four corners; out of the car they are all zero. Filing
            // four all-null corners for every lap would be noise on disk, so only corners
            // that actually report anything are kept.
            Tires = [.. frame.Tires.Where(Reporting).Select(MapTire)],
        };

        _fuelAtLastCrossing = fuel;
        _energyAtLastCrossing = energy;
        return record;
    }

    /// <summary>
    /// Accumulates the in-progress lap's position→time trace, which the crossing resamples
    /// into the lap's reference curve.
    /// </summary>
    private void Sample(TelemetryFrame frame)
    {
        // Out of the car the driver is in the monitor or the box. Splicing the stints either
        // side of that onto one trace would describe a lap nobody drove, so the trace starts
        // over and the completeness guard decides whether what is left still spans the lap.
        if (!frame.Session.InCar)
        {
            _samples.Clear();
            return;
        }

        // Any lap change starts a new trace, including one whose predecessor was never filed
        // (no completed time): the position wrap would otherwise leave the whole next lap
        // behind the previous trace's high-water mark and silently unsampled.
        if (frame.Lap.CurrentLap != _sampledLap)
        {
            _samples.Clear();
            _sampledLap = frame.Lap.CurrentLap;
        }

        // A non-finite reading compares false against everything, so keeping it would make
        // every real sample after it look like backwards progress. Unlike the live delta, this
        // trace is written down, and nothing reading it back could tell it was never real.
        if (!float.IsFinite(frame.Lap.TrackPosition))
        {
            return;
        }

        var position = Math.Clamp((double)frame.Lap.TrackPosition, 0, 1);
        if (_samples.Count == 0 || position > _samples[^1].Position + PositionEpsilon)
        {
            _samples.Add(new LapTraceSample(
                position,
                // Stored in km/h: the unit the driver reads and the unit the HUD draws.
                frame.Car.SpeedMetersPerSecond * 3.6f,
                frame.Car.Throttle,
                frame.Car.Brake,
                frame.Car.Steering,
                frame.Car.Gear,
                Math.Max(frame.Lap.CurrentLapTime, 0)));
        }
    }

    /// <summary>A channel the game did not fill reads as zero; that is unknown, not empty.</summary>
    private static double? Reported(float value) =>
        float.IsFinite(value) && value > 0 ? value : null;

    /// <summary>
    /// What the lap consumed, measured between two crossings. Null when there is no earlier
    /// crossing to measure against, and null when the level went <em>up</em> — a pit stop
    /// refilled the tank, so this lap's usage simply was not observed. A negative number
    /// here would poison every average drawn from the corpus.
    /// </summary>
    private static double? Consumed(double? before, double? after) =>
        before is { } start && after is { } end && start >= end ? start - end : null;

    private static LapHistoryTire MapTire(TireState tire) => new()
    {
        Position = tire.Position.ToString(),
        // Wear is a fraction of maximum, so 0 legitimately means "new" and must not be read
        // as unknown — the corner only gets filed when it is reporting at all.
        WearPercent = tire.WearPercent,
        Compound = string.IsNullOrWhiteSpace(tire.Compound) ? null : tire.Compound,
        TempAverageCelsius = Reported(tire.TempSurfaceCelsius),
        PressureKPa = Reported(tire.PressureKPa),
    };

    private static bool Reporting(TireState tire) =>
        tire.PressureKPa > 0
        || tire.TempSurfaceCelsius > 0
        || !string.IsNullOrWhiteSpace(tire.Compound);

    /// <summary>
    /// Files the lap's channel trace. Dispatched like the session write: a trace is the largest
    /// thing Sprint stores, so it is the last thing that should meet the telemetry thread.
    /// </summary>
    private void PersistTrace(string traceId, LapChannelTrace trace) => _dispatch(() =>
    {
        try
        {
            _traces?.Save(traceId, trace);
        }
        catch (Exception ex)
        {
            // A lost trace costs the lap its richest tier, never the lap itself.
            _log.Warn($"Failed to persist lap trace '{traceId}'", ex);
        }
    });

    private void Persist(LapHistorySession session) => _dispatch(() =>
    {
        try
        {
            _store.Save(session);
        }
        catch (Exception ex)
        {
            // Losing a lap must never take the telemetry pipeline with it.
            _log.Warn($"Failed to persist lap-history session '{session.Id}'", ex);
        }
    });
}
