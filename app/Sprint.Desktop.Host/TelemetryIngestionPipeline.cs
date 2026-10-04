using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Host;

/// <summary>
/// Feeds every genuinely new telemetry frame to the background consumers the deleted Avalonia
/// <c>MainWindow.IngestTelemetryFrame</c> used to drive: the last-seen game/car/track context
/// (<see cref="PlanContextCapture"/>), the active session plan (<see cref="SessionPlannerService"/>),
/// the always-on lap-history recorder (<see cref="LapHistoryRecorder"/>), and the plan's lap-time
/// target latch (<see cref="PlanTargetDelivery"/>) — in that order, which the deleted window's own
/// comment called deliberate: the plan and the corpus must consume a lap's last frame before the
/// target latch fires for the lap that is starting.
/// <para>
/// <b>Exactly-once ingestion.</b> The host's publish loop polls <c>TelemetryEngine.Snapshot</c>
/// on a fixed timer, independently of how often the engine's reader thread actually reads a new
/// frame. <see cref="TelemetryEngine"/> re-publishes the very same <see cref="TelemetryFrame"/>
/// instance on every tick that found nothing new (see its <c>Step</c>/<c>Publish</c>) and only
/// swaps in a new instance when a frame was actually read — so comparing the frame by reference
/// is an exact, cheap "is this new" test regardless of the poll cadence. <see cref="Poll"/> is the
/// only entry point and is safe to call every tick.
/// </para>
/// <para>
/// <b>Single-threaded by design.</b> Like the deleted window (single UI thread), this pipeline is
/// driven from one caller at a time — the host's telemetry publish loop — and
/// <see cref="LapHistoryRecorder"/>/<see cref="PlanTargetDelivery"/> are documented not thread-safe
/// on that basis. <see cref="SessionPlannerService"/> is the one consumer also reached from HTTP
/// <c>plan.*</c> command handlers on other threads, so it locks internally; nothing here needs to
/// duplicate that.
/// </para>
/// <para>
/// A consumer that throws is logged and skipped rather than allowed to take the others (or the
/// publish loop itself) down with it: telemetry keeps arriving every tick whether or not one
/// consumer is currently healthy, so one bad frame in the planner, say, must not also stop laps
/// from being recorded.
/// </para>
/// </summary>
public sealed class TelemetryIngestionPipeline
{
    private readonly IDesktopRuntime _runtime;
    private readonly SessionPlannerService _planner;
    private readonly LapHistoryRecorder _lapHistory;
    private readonly PlanTargetDelivery _planTargets;
    private readonly Action<DeltaReference?> _requestPlanReference;
    private readonly ILog _log;
    private TelemetryFrame? _lastPolled;

    public TelemetryIngestionPipeline(
        IDesktopRuntime runtime,
        SessionPlannerService planner,
        LapHistoryRecorder lapHistory,
        PlanTargetDelivery planTargets,
        Action<DeltaReference?> requestPlanReference,
        ILog? log = null)
    {
        this._runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
        this._planner = planner ?? throw new ArgumentNullException(nameof(planner));
        this._lapHistory = lapHistory ?? throw new ArgumentNullException(nameof(lapHistory));
        this._planTargets = planTargets ?? throw new ArgumentNullException(nameof(planTargets));
        this._requestPlanReference = requestPlanReference ?? throw new ArgumentNullException(nameof(requestPlanReference));
        this._log = log ?? NullLog.Instance;
    }

    /// <summary>How many times <see cref="Ingest"/> actually ran. A test seam for the
    /// exactly-once-per-new-frame contract: several consumers happen to be idempotent against
    /// a repeated identical frame on their own, so asserting on their output alone could not
    /// tell "Poll deduplicated" apart from "the consumer no-opped anyway". Counting fan-outs
    /// directly can.</summary>
    internal int IngestCount { get; private set; }

    /// <summary>
    /// Call on every publish-loop tick with the engine's current frame. Ingests it once, the
    /// first tick it is observed, and is a no-op on every tick that re-observes the same
    /// instance (no new frame since the last poll).
    /// </summary>
    public void Poll(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (ReferenceEquals(frame, this._lastPolled))
        {
            return;
        }

        this._lastPolled = frame;
        this.Ingest(frame);
    }

    /// <summary>The actual per-frame fan-out. Internal so a test can drive it directly without
    /// needing two distinct frame instances to prove the "once" half of exactly-once.</summary>
    internal void Ingest(TelemetryFrame frame)
    {
        this.IngestCount++;
        this.SafeRun("last-seen context", () => this.CaptureLastSeenContext(frame));
        this.SafeRun("session planner", () => this._planner.Ingest(frame));
        this.SafeRun("lap history", () => this._lapHistory.Ingest(frame));
        this.SafeRun("plan target delivery", () =>
        {
            if (this._planTargets.Observe(frame))
            {
                this._requestPlanReference(this._planTargets.Reference);
            }
        });
    }

    /// <summary>Ends the open lap-history session cleanly. Call once, on host shutdown, so an
    /// in-progress lap is stamped finished rather than left looking live.</summary>
    public void Close() => this.SafeRun("lap history close", this._lapHistory.Close);

    // Remembers the game/car/track telemetry last reported so a new plan can be prefilled
    // before the driver is in a car. Saves only on a change.
    private void CaptureLastSeenContext(TelemetryFrame frame)
    {
        // Held for the whole mutate-then-save sequence: a settings.update HTTP command mutates
        // the same Settings object on a Kestrel thread, and takes the same gate (see
        // DesktopRuntime.SettingsGate's remarks) around its own mutate-then-save block.
        lock (this._runtime.SettingsGate)
        {
            if (PlanContextCapture.Remember(this._runtime.Settings.LastSeenContext, frame.Session))
            {
                this._runtime.SaveSettings();
            }
        }
    }

    private void SafeRun(string consumer, Action action)
    {
        try
        {
            action();
        }
        catch (Exception ex)
        {
            this._log.Warn($"Telemetry ingestion consumer '{consumer}' failed; skipping this frame for it", ex);
        }
    }
}
