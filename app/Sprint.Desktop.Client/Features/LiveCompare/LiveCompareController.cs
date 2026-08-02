using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// What the HUD needs to draw one moment: the stack, the lap it is chasing, and the delta.
/// </summary>
public sealed record LiveCompareFrame(
    ChartStack Stack,
    string TargetName,
    double? DeltaSeconds,
    bool HasLiveLine);

/// <summary>
/// The Live Compare rolling window (#195), free of Avalonia so every rule here is a unit test.
/// <para>
/// It keeps its own live sample buffer rather than reading the lap recorder's. The recorder
/// exists to write the corpus and its buffer is an implementation detail of that job; a second
/// consumer would tie the HUD's lifetime to the recorder's and make "the driver is comparing"
/// and "the driver is being recorded" the same state, which they are not.
/// </para>
/// </summary>
public sealed class LiveCompareController
{
    // Strictly-forward guard, matching the recorder's: the trace must stay a function of
    // position, and a non-finite reading compares false against everything.
    private const double PositionEpsilon = 1e-6;

    private readonly List<LapTraceSample> _samples = [];

    private LiveCompareTarget? _target;
    private LapChannelTrace? _targetTrace;
    private LapChannelTrace? _liveTrace;
    private bool _liveDirty;
    private int _sampledLap = -1;
    private double _position;
    private double _currentLapTime;
    private double? _trackLengthMeters;

    /// <summary>Metres of already-driven track kept behind the car. Spec §2.3 proposes 200.</summary>
    public double MetersBehind { get; set; } = 200;

    /// <summary>Metres ahead of the car, where the braking zone slides into view. Spec §2.3 proposes 600.</summary>
    public double MetersAhead { get; set; } = 600;

    public IReadOnlyList<LapChartPanelSpec> Panels { get; set; } = LapChartPanels.HudDefaults;

    public LiveCompareTarget? Target => _target;

    /// <summary>Whether a target with usable channels is loaded.</summary>
    public bool HasTarget => _target is not null && _targetTrace is { IsUsable: true };

    public event EventHandler? Changed;

    /// <summary>
    /// Points the HUD at a lap. A target whose trace is missing or unusable is refused rather
    /// than half-accepted: the HUD would otherwise name a lap it cannot draw.
    /// </summary>
    public void SetTarget(LiveCompareTarget? target, LapChannelTrace? trace)
    {
        _target = trace is { IsUsable: true } ? target : null;
        _targetTrace = _target is null ? null : trace;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Folds a live frame in. Cheap by design — this runs on the telemetry path.</summary>
    public void Ingest(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        if (frame.Session.TrackLengthMeters is { } length && length > 0)
        {
            _trackLengthMeters = length;
        }

        // Out of the car the driver is in the monitor or the box. Keeping the line would splice
        // two stints into one trace, which is the same reason the recorder starts over here.
        if (!frame.Session.InCar)
        {
            Reset();
            return;
        }

        if (frame.Lap.CurrentLap != _sampledLap)
        {
            _sampledLap = frame.Lap.CurrentLap;
            _samples.Clear();
            _liveTrace = null;
        }

        if (!float.IsFinite(frame.Lap.TrackPosition))
        {
            return;
        }

        _position = Math.Clamp((double)frame.Lap.TrackPosition, 0, 1);
        _currentLapTime = Math.Max(frame.Lap.CurrentLapTime, 0);

        if (_samples.Count == 0 || _position > _samples[^1].Position + PositionEpsilon)
        {
            _samples.Add(new LapTraceSample(
                _position,
                frame.Car.SpeedMetersPerSecond * 3.6f,
                frame.Car.Throttle,
                frame.Car.Brake,
                frame.Car.Steering,
                frame.Car.Gear,
                _currentLapTime));
            _liveDirty = true;
        }
    }

    /// <summary>Clears the live line but keeps the target — leaving the car ends a lap, not a session.</summary>
    public void Reset()
    {
        _samples.Clear();
        _liveTrace = null;
        _liveDirty = false;
        _sampledLap = -1;
    }

    /// <summary>
    /// One frame for the HUD to draw, or null when there is no target to chase. Called from the
    /// render timer rather than from <see cref="Ingest"/>: resampling the window costs real
    /// work, and doing it per telemetry poll would be six repaints' worth per frame drawn.
    /// </summary>
    public LiveCompareFrame? Snapshot()
    {
        if (_target is null || _targetTrace is not { IsUsable: true })
        {
            return null;
        }

        var length = TrackLength();
        var distance = _position * length;
        var domain = ChartDomain.TrackDistance(distance - MetersBehind, distance + MetersAhead);

        var sources = new List<LapTraceSeriesSource>();
        if (LiveTrace() is { } live)
        {
            sources.Add(new LapTraceSeriesSource(
                live,
                length,
                "You",
                ChartSeriesRole.Current,
                // Your line stops at the car. Spec §3: you cannot draw a future you have not
                // driven, and holding the last value would paint a flat line into the corner
                // you are about to take.
                UpTo: distance));
        }

        sources.Add(new LapTraceSeriesSource(
            _targetTrace,
            length,
            "Target",
            ChartSeriesRole.Comparison));

        return new LiveCompareFrame(
            LapTraceCharts.Build(Panels, domain, sources),
            _target.Label,
            Delta(),
            sources.Count > 1);
    }

    /// <summary>
    /// How far ahead of the target the driver is at this point on track, in seconds. Negative
    /// is ahead. Read off the target's own elapsed-time channel, which is why that channel is
    /// stored — a trace can regenerate its delta without a second source (spec §2.1).
    /// </summary>
    public double? Delta()
    {
        if (_targetTrace?.ValueAt(LapTraceChannels.ElapsedSeconds, _position) is not { } targetTime
            || _samples.Count == 0)
        {
            return null;
        }

        return _currentLapTime - targetTime;
    }

    private double TrackLength() =>
        _trackLengthMeters
        ?? _targetTrace?.TrackLengthMeters
        ?? _target?.Context.TrackLengthMeters
        ?? LapChannelTrace.FallbackTrackLengthMeters;

    private LapChannelTrace? LiveTrace()
    {
        if (_liveDirty)
        {
            _liveTrace = LapChannelTrace.Live(_samples, TrackLength());
            _liveDirty = false;
        }

        return _liveTrace;
    }
}
