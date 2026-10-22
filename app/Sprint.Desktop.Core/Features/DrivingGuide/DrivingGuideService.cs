using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.DrivingGuide;

/// <summary>The lap the guide draws, for naming it in the UI.</summary>
/// <param name="SameCar">False when no lap with this car had positions and another car's lap stands in.</param>
public sealed record DrivingGuideLap(
    string SessionId,
    int LapNumber,
    double LapTimeSeconds,
    string Car,
    DateTimeOffset RecordedAt,
    bool SameCar);

public enum DrivingGuideStatus
{
    /// <summary>Nothing to choose for yet: the guide is off, or no car is on track.</summary>
    Idle,
    Searching,
    Ready,

    /// <summary>No valid lap on this track carries world positions yet.</summary>
    NoLap,
}

/// <summary>What the guide is drawing. Replaced whole, so a reader never sees a lap with another lap's line.</summary>
/// <param name="GeometryId">Changes with every new geometry, so a consumer can skip rewriting an unchanged one.</param>
public sealed record DrivingGuideState(
    DrivingGuideStatus Status,
    DrivingGuideLap? Lap,
    DrivingGuideGeometry? Geometry,
    int GeometryId)
{
    public static DrivingGuideState Idle { get; } = new(DrivingGuideStatus.Idle, null, null, 0);
}

/// <summary>
/// Chooses the guide's lap: the fastest valid lap with world positions on this game, track and
/// car, else on this track with any car. Reads the corpus, so it runs off the telemetry thread.
/// </summary>
public sealed class DrivingGuideLapPicker
{
    /// <summary>
    /// Traces are read fastest first until one has positions. Bounded, because a driver with
    /// hundreds of laps recorded before the channels existed would otherwise read them all.
    /// </summary>
    private const int MaxTracesRead = 25;

    private readonly ILapHistoryStore _history;
    private readonly ILapTraceStore _traces;

    public DrivingGuideLapPicker(ILapHistoryStore history, ILapTraceStore traces)
    {
        this._history = history ?? throw new ArgumentNullException(nameof(history));
        this._traces = traces ?? throw new ArgumentNullException(nameof(traces));
    }

    public (DrivingGuideLap Lap, DrivingGuideGeometry Geometry)? Pick(string game, string track, string car)
    {
        IEnumerable<(LapHistorySession Session, LapHistoryRecord Lap)> candidates = this._history.LoadAll()
            .Where(session => session.Context.Game == game && session.Context.TrackCourse == track)
            .SelectMany(session => session.Laps.Select(lap => (Session: session, Lap: lap)))
            .Where(entry => entry.Lap.IsValid && entry.Lap.LapTimeSeconds > 0 && entry.Lap.TraceId is not null)
            .OrderBy(entry => entry.Session.Context.CarModel == car ? 0 : 1)
            .ThenBy(entry => entry.Lap.LapTimeSeconds)
            .Take(MaxTracesRead);

        foreach ((LapHistorySession session, LapHistoryRecord lap) in candidates)
        {
            if (lap.TraceId is not { } traceId
                || this._traces.Load(traceId) is not { } trace
                || DrivingGuideBuilder.Build(trace) is not { } geometry)
            {
                continue;
            }

            DrivingGuideLap chosen = new(
                session.Id,
                lap.LapNumber,
                lap.LapTimeSeconds,
                session.Context.CarModel,
                session.StartedAt,
                session.Context.CarModel == car);
            return (chosen, geometry);
        }

        return null;
    }
}

/// <summary>
/// Keeps <see cref="State"/> pointed at the right lap as the driver changes track or car and
/// sets new laps. Fed from the ingestion loop; the corpus read is handed to
/// <paramref name="dispatch"/> so the loop never waits on disk.
/// </summary>
public sealed class DrivingGuideService
{
    private readonly DrivingGuideLapPicker _picker;
    private readonly Func<bool> _wanted;
    private readonly Action<Action> _dispatch;
    private readonly ILog _log;
    private readonly object _gate = new();

    private DrivingGuideState _state = DrivingGuideState.Idle;
    private int _geometryId;

    // The context and lap the last pick was asked for. A change in either asks again.
    private string? _requestedKey;
    private int _requestedLap = -1;

    // At most one pick runs; a request that arrives meanwhile is kept and run after it.
    private bool _running;
    private (string Game, string Track, string Car)? _queued;

    /// <param name="wanted">Whether anything would draw the guide. Nothing is read from disk while it is false.</param>
    /// <param name="dispatch">Runs a pick off the caller's thread. Tests pass an inline runner.</param>
    public DrivingGuideService(
        DrivingGuideLapPicker picker,
        Func<bool> wanted,
        Action<Action>? dispatch = null,
        ILog? log = null)
    {
        this._picker = picker ?? throw new ArgumentNullException(nameof(picker));
        this._wanted = wanted ?? throw new ArgumentNullException(nameof(wanted));
        this._dispatch = dispatch ?? (work => ThreadPool.QueueUserWorkItem(_ => work()));
        this._log = log ?? NullLog.Instance;
    }

    public DrivingGuideState State => Volatile.Read(ref this._state);

    /// <summary>
    /// Folds a frame in. Asks for a pick when the guide is wanted and the context or lap number
    /// changed. A lap crossing is the trigger for "a new best exists"; the recorder files that
    /// lap once its time arrives, so the new best is picked up on the crossing after.
    /// </summary>
    public void Observe(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        SessionInfo session = frame.Session;
        if (!this._wanted() || !session.InCar
            || string.IsNullOrWhiteSpace(session.Game)
            || string.IsNullOrWhiteSpace(session.Track)
            || string.IsNullOrWhiteSpace(session.Car))
        {
            return;
        }

        string key = $"{session.Game}\n{session.Track}\n{session.Car}";
        if (key == this._requestedKey && frame.Lap.CurrentLap == this._requestedLap)
        {
            return;
        }

        bool contextChanged = key != this._requestedKey;
        this._requestedKey = key;
        this._requestedLap = frame.Lap.CurrentLap;
        if (contextChanged)
        {
            // The old track's line must not linger over the new one while the corpus is read.
            this.Publish(new DrivingGuideState(DrivingGuideStatus.Searching, null, null, this.NextGeometryId()));
        }

        this.Request((session.Game, session.Track, session.Car));
    }

    private void Request((string Game, string Track, string Car) context)
    {
        lock (this._gate)
        {
            if (this._running)
            {
                this._queued = context;
                return;
            }

            this._running = true;
        }

        this._dispatch(() => this.Run(context));
    }

    private void Run((string Game, string Track, string Car) context)
    {
        while (true)
        {
            this.PickNow(context);
            lock (this._gate)
            {
                if (this._queued is not { } next)
                {
                    this._running = false;
                    return;
                }

                this._queued = null;
                context = next;
            }
        }
    }

    private void PickNow((string Game, string Track, string Car) context)
    {
        try
        {
            if (this._picker.Pick(context.Game, context.Track, context.Car) is not { } picked)
            {
                this.Publish(new DrivingGuideState(DrivingGuideStatus.NoLap, null, null, this.NextGeometryId()));
                return;
            }

            DrivingGuideState current = this.State;
            if (current.Lap is { } shown && shown.SessionId == picked.Lap.SessionId && shown.LapNumber == picked.Lap.LapNumber)
            {
                return;
            }

            this.Publish(new DrivingGuideState(DrivingGuideStatus.Ready, picked.Lap, picked.Geometry, this.NextGeometryId()));
            this._log.Info($"Driving guide: lap {picked.Lap.LapNumber} of {picked.Lap.SessionId} ({picked.Lap.LapTimeSeconds:F3}s, {picked.Geometry.Boards.Count} boards)");
        }
        catch (Exception ex)
        {
            this._log.Warn("Driving guide could not choose a lap", ex);
        }
    }

    private int NextGeometryId() => Interlocked.Increment(ref this._geometryId);

    private void Publish(DrivingGuideState state) => Volatile.Write(ref this._state, state);
}
