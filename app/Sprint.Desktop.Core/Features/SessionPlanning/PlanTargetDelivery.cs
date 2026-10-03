using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Live;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Carries the active plan's targets to the wheel (#189), split by what each target
/// physically needs: the chosen lap's reference curve as a <see cref="DeltaReference"/> for
/// <see cref="DeltaTracker"/>, and everything scalar as <see cref="DashTargets"/> for the
/// <c>target.*</c> dash bindings.
/// <para>
/// <b>Everything latches at the start/finish line.</b> A target that flipped mid-lap would
/// have the rest of that lap measured against something it was never driven with, so a change
/// is held until the lap-number increment — the same instant <see cref="DeltaTracker"/> keys
/// its own lap boundary off. The one exception is that there is no lap in progress to protect:
/// out of the car, or on the first frame of a stint, a pending target applies at once.
/// </para>
/// <para>
/// This is the only latch. <see cref="DeltaTracker.SetPlanReference"/> applies immediately and
/// is called from here, so "when does a target change take effect" is decided in one place
/// rather than once per delivery route.
/// </para>
/// </summary>
/// <remarks>
/// Not thread-safe and not required to be: it is driven from the frame-ingest path, the same
/// place the planner and the lap-history recorder are fed from. The resulting reference is
/// marshalled onto the telemetry reader thread by
/// <see cref="TelemetryEngine.RequestPlanReference"/>.
/// </remarks>
/// <param name="activePlan">
/// The plan holding the active slot, or null. A plan that is neither armed nor tracking is not
/// aiming at anything, so the caller — not this service — decides what "active" means.
/// </param>
/// <param name="history">The corpus the chosen lap's curve is read back from.</param>
public sealed class PlanTargetDelivery(Func<SessionPlan?> activePlan, ILapHistoryStore history)
{
    private readonly Func<SessionPlan?> _activePlan =
        activePlan ?? throw new ArgumentNullException(nameof(activePlan));

    private readonly ILapHistoryStore _history =
        history ?? throw new ArgumentNullException(nameof(history));

    // The lap the latch is waiting out. Absent means no lap is in progress, so the next
    // frame applies whatever is pending straight away.
    private int? _lap;
    private string _track = "";
    private SessionType _sessionType = SessionType.Unknown;

    /// <summary>
    /// The scalar targets in force, for <see cref="DashBindingContext"/>. Never null; an unset
    /// member means no target was planned, which is not the same claim as zero.
    /// </summary>
    public DashTargets Targets { get; private set; } = DashTargets.None;

    /// <summary>
    /// The reference lap in force, or null when the driver's target cannot honestly drive a
    /// position-relative delta — an imported lap, a manual time, or a lap whose curve is no
    /// longer in the corpus. Null leaves <see cref="DeltaTracker"/> on its own session best
    /// rather than inventing a pro-rata trace from a single number.
    /// </summary>
    public DeltaReference? Reference { get; private set; }

    /// <summary>
    /// Takes one telemetry frame and returns true when the latch fired, i.e. when
    /// <see cref="Targets"/> and <see cref="Reference"/> were (re)applied and the caller must
    /// push <see cref="Reference"/> into the tracker.
    /// <para>
    /// It fires on every lap boundary rather than only on a change, so a tracker that dropped
    /// its state (a session restart, a venue change) is back in step one lap later instead of
    /// silently comparing against the session best for the rest of the run.
    /// </para>
    /// </summary>
    public bool Observe(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        // A different venue or session type is a different set of targets and a different
        // lap in progress; nothing is being protected across that boundary.
        if (!string.Equals(frame.Session.Track, _track, StringComparison.Ordinal)
            || frame.Session.SessionType != _sessionType
            || !frame.Session.InCar)
        {
            _lap = null;
        }

        _track = frame.Session.Track;
        _sessionType = frame.Session.SessionType;

        if (!frame.Session.InCar)
        {
            // Out of the car there is no lap to spoil, so a pending change lands now and the
            // driver rejoins already on the new target.
            Apply(frame);
            return true;
        }

        // Still on the lap the latch is waiting out.
        if (_lap is { } previous && frame.Lap.CurrentLap == previous)
        {
            return false;
        }

        // Any other lap number is a new lap to measure: an increment at the line, or a
        // restart/teleport going backwards, which also ended the lap that was in progress.
        _lap = frame.Lap.CurrentLap;
        Apply(frame);
        return true;
    }

    private void Apply(TelemetryFrame frame)
    {
        var plan = _activePlan();
        var target = KindFor(frame.Session.SessionType) is { } kind
            ? plan?.TargetsFor(kind)?.LapTime
            : null;

        Targets = new DashTargets
        {
            LapTimeSeconds = target?.LapTimeSeconds,
            FuelPerLapLiters = plan?.FuelPerLapLiters,
        };
        Reference = ReferenceFor(target);
    }

    // The tier is read off the lap in the corpus, never off the flag stored on the target: the
    // target records what was true when it was chosen, and the lap is what is actually there
    // to be measured against now.
    private DeltaReference? ReferenceFor(PlanTarget? target)
    {
        if (target is not { LapSessionId: { } sessionId, LapNumber: { } lapNumber })
        {
            return null;
        }

        var lap = _history.LoadAll()
            .FirstOrDefault(session => string.Equals(session.Id, sessionId, StringComparison.Ordinal))
            ?.Laps.FirstOrDefault(record => record.LapNumber == lapNumber);

        if (lap is not { HasReferenceCurve: true, ReferenceCurve: { } curve })
        {
            return null;
        }

        return new DeltaReference
        {
            PositionStep = curve.PositionStep,
            TimesSeconds = curve.TimesSeconds,
            // The target's own time, not the lap record's: they are the same lap, and the
            // target is the number the driver was shown when they chose it.
            LapTimeSeconds = target.LapTimeSeconds,
        };
    }

    // The planner only ever holds a qualifying and a race set, so practice, warmup and an
    // unreported session type get no target rather than the nearest one.
    private static SegmentKind? KindFor(SessionType sessionType) => sessionType switch
    {
        SessionType.Qualify => SegmentKind.Qualifying,
        SessionType.Race => SegmentKind.Race,
        _ => null,
    };
}
