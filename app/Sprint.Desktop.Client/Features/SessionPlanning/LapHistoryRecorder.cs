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
    private readonly Func<DateTimeOffset> _clock;
    private readonly Func<string> _idFactory;
    private readonly Action<Action> _dispatch;
    private readonly ILog _log;

    private LapHistorySession? _session;
    private int _lastSeenLap;
    private double? _fuelAtLastCrossing;
    private double? _energyAtLastCrossing;

    public LapHistoryRecorder(
        ILapHistoryStore store,
        Func<DateTimeOffset>? clock = null,
        Func<string>? idFactory = null,
        Action<Action>? dispatch = null,
        ILog? log = null)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
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

        if (CompletedLap(frame) is not { } lap)
        {
            return;
        }

        _session.Laps.Add(lap);
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
