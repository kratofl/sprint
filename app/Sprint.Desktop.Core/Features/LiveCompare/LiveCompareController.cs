using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// What the HUD needs to draw one moment: the stack, the lap it is chasing, and the delta.
/// </summary>
/// <param name="PanelIds">The catalogue id of each chart in <paramref name="Stack"/>, in order — which HUD window draws it.</param>
/// <param name="CarMeters">Where the car is on the stack's distance axis — the HUD's "you are here" line.</param>
public sealed record LiveCompareFrame(
    ChartStack Stack,
    IReadOnlyList<string> PanelIds,
    string TargetName,
    double? DeltaSeconds,
    bool HasLiveLine,
    double CarMeters);

/// <summary>
/// The Live Compare rolling window (#195), free of any UI so every rule here is a unit test.
/// <para>
/// It keeps its own live sample buffer rather than reading the lap recorder's. The recorder
/// exists to write the corpus and its buffer is an implementation detail of that job; a second
/// consumer would tie the HUD's lifetime to the recorder's and make "the driver is comparing"
/// and "the driver is being recorded" the same state, which they are not.
/// </para>
/// <para>
/// Thread-safe: the host's telemetry loop ingests, a command thread sets the target and the
/// HUD poll takes snapshots, all at once. One lock, held briefly by each.
/// </para>
/// </summary>
public sealed class LiveCompareController
{
    // Strictly-forward guard, matching the recorder's: the trace must stay a function of
    // position, and a non-finite reading compares false against everything.
    private const double PositionEpsilon = 1e-6;

    private readonly object _gate = new();
    private readonly List<LapTraceSample> _samples = [];

    private LiveCompareTarget? _target;
    private LapChannelTrace? _targetTrace;
    private LapChannelTrace? _liveTrace;
    private bool _liveDirty;
    private int _sampledLap = -1;
    private double _position;
    private double _currentLapTime;
    private double? _trackLengthMeters;
    private double _metersBehind = 200;
    private double _metersAhead = 600;
    private IReadOnlyList<LapChartPanelSpec> _panels = LapChartPanels.HudDefaults;

    /// <summary>Metres of already-driven track kept behind the car. Spec §2.3 proposes 200.</summary>
    public double MetersBehind
    {
        get { lock (this._gate) { return this._metersBehind; } }
        set { lock (this._gate) { this._metersBehind = value; } }
    }

    /// <summary>Metres ahead of the car, where the braking zone slides into view. Spec §2.3 proposes 600.</summary>
    public double MetersAhead
    {
        get { lock (this._gate) { return this._metersAhead; } }
        set { lock (this._gate) { this._metersAhead = value; } }
    }

    /// <summary>The charts a snapshot carries, in this order — one per HUD chart window.</summary>
    public IReadOnlyList<LapChartPanelSpec> Panels
    {
        get { lock (this._gate) { return this._panels; } }
        set { lock (this._gate) { this._panels = value; } }
    }

    public LiveCompareTarget? Target
    {
        get { lock (this._gate) { return this._target; } }
    }

    /// <summary>Whether a target with usable channels is loaded.</summary>
    public bool HasTarget
    {
        get { lock (this._gate) { return this._target is not null && this._targetTrace is { IsUsable: true }; } }
    }

    /// <summary>
    /// Points the HUD at a lap. A target whose trace is missing or unusable is refused rather
    /// than half-accepted: the HUD would otherwise name a lap it cannot draw.
    /// </summary>
    public void SetTarget(LiveCompareTarget? target, LapChannelTrace? trace)
    {
        lock (this._gate)
        {
            this._target = trace is { IsUsable: true } ? target : null;
            this._targetTrace = this._target is null ? null : trace;
        }
    }

    /// <summary>Folds a live frame in. Cheap by design — this runs on the telemetry path.</summary>
    public void Ingest(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        lock (this._gate)
        {
            if (frame.Session.TrackLengthMeters is { } length && length > 0)
            {
                this._trackLengthMeters = length;
            }

            // Out of the car the driver is in the monitor or the box. Keeping the line would splice
            // two stints into one trace, which is the same reason the recorder starts over here.
            if (!frame.Session.InCar)
            {
                this.ResetLocked();
                return;
            }

            if (frame.Lap.CurrentLap != this._sampledLap)
            {
                this._sampledLap = frame.Lap.CurrentLap;
                this._samples.Clear();
                this._liveTrace = null;
            }

            if (!float.IsFinite(frame.Lap.TrackPosition))
            {
                return;
            }

            this._position = Math.Clamp((double)frame.Lap.TrackPosition, 0, 1);
            this._currentLapTime = Math.Max(frame.Lap.CurrentLapTime, 0);

            if (this._samples.Count == 0 || this._position > this._samples[^1].Position + PositionEpsilon)
            {
                this._samples.Add(new LapTraceSample(
                    this._position,
                    frame.Car.SpeedMetersPerSecond * 3.6f,
                    frame.Car.Throttle,
                    frame.Car.Brake,
                    frame.Car.Steering,
                    frame.Car.Gear,
                    this._currentLapTime));
                this._liveDirty = true;
            }
        }
    }

    /// <summary>Clears the live line but keeps the target — leaving the car ends a lap, not a session.</summary>
    public void Reset()
    {
        lock (this._gate)
        {
            this.ResetLocked();
        }
    }

    /// <summary>
    /// One frame for the HUD to draw, or null when there is no target to chase. Called from the
    /// HUD's poll rather than from <see cref="Ingest"/>: resampling the window costs real
    /// work, and doing it per telemetry frame would be wasted on frames nobody draws.
    /// </summary>
    public LiveCompareFrame? Snapshot()
    {
        lock (this._gate)
        {
            if (this._target is null || this._targetTrace is not { IsUsable: true })
            {
                return null;
            }

            double length = this.TrackLength();
            double distance = this._position * length;
            ChartDomain domain = ChartDomain.TrackDistance(distance - this._metersBehind, distance + this._metersAhead);

            List<LapTraceSeriesSource> sources = [];
            if (this.LiveTrace() is { } live)
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
                this._targetTrace,
                length,
                "Target",
                ChartSeriesRole.Comparison));

            return new LiveCompareFrame(
                LapTraceCharts.Build(this._panels, domain, sources),
                [.. this._panels.Select(panel => panel.Id)],
                this._target.Label,
                this.DeltaLocked(),
                sources.Count > 1,
                distance);
        }
    }

    /// <summary>
    /// How far ahead of the target the driver is at this point on track, in seconds. Negative
    /// is ahead. Read off the target's own elapsed-time channel, which is why that channel is
    /// stored — a trace can regenerate its delta without a second source (spec §2.1).
    /// </summary>
    public double? Delta()
    {
        lock (this._gate)
        {
            return this.DeltaLocked();
        }
    }

    private double? DeltaLocked()
    {
        if (this._targetTrace?.ValueAt(LapTraceChannels.ElapsedSeconds, this._position) is not { } targetTime
            || this._samples.Count == 0)
        {
            return null;
        }

        return this._currentLapTime - targetTime;
    }

    private void ResetLocked()
    {
        this._samples.Clear();
        this._liveTrace = null;
        this._liveDirty = false;
        this._sampledLap = -1;
    }

    private double TrackLength() =>
        this._trackLengthMeters
        ?? this._targetTrace?.TrackLengthMeters
        ?? this._target?.Context.TrackLengthMeters
        ?? LapChannelTrace.FallbackTrackLengthMeters;

    private LapChannelTrace? LiveTrace()
    {
        if (this._liveDirty)
        {
            this._liveTrace = LapChannelTrace.Live(this._samples, this.TrackLength());
            this._liveDirty = false;
        }

        return this._liveTrace;
    }
}
