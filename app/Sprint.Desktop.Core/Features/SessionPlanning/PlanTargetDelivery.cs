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
/// <see cref="Observe"/> is not thread-safe and not required to be: it is driven from the
/// frame-ingest path, the same place the planner and the lap-history recorder are fed from. The
/// resulting reference is marshalled onto the telemetry reader thread by
/// <see cref="TelemetryEngine.RequestPlanReference"/>. <see cref="ResolveReferences"/> is the one
/// member for other threads.
/// </remarks>
/// <param name="activePlan">
/// What the plan holding the active slot aims at, or null. A plan that is neither armed nor
/// tracking is not aiming at anything, so the caller — not this service — decides what "active"
/// means. Called from the telemetry loop and the state poll alike, so the caller copies it out
/// under the planner's lock (<c>planner.ReadActive(PlanTargetDelivery.Aim.Of)</c>).
/// </param>
/// <param name="history">
/// The corpus the chosen lap's curve is read back from, by <see cref="ResolveReferences"/> only. A
/// target lap no resolve has found yet (the host just started, or the target was just chosen) has
/// no reference at the line: <see cref="DeltaTracker"/> stays on its own session best until the
/// first line after a resolve has found it.
/// </param>
/// <param name="fuelHistory">
/// Where a plan that leaves its fuel per lap to the driver's laps gets the figure from; without
/// it such a plan has no fuel target. Read through <see cref="IFuelHistorySource.Cached"/> only,
/// which the state poll keeps warm by asking for every plan's race fuel. A cold cache at the line
/// (the host just started, or a car or track no poll has asked about yet) means no fuel target yet: it fills in at the
/// next line after a poll has worked the figure out, as does a median a new lap moved.
/// </param>
public sealed class PlanTargetDelivery(Func<PlanTargetDelivery.Aim?> activePlan, ILapHistoryStore history, IFuelHistorySource? fuelHistory = null)
{
    private readonly IFuelHistorySource _fuelHistory = fuelHistory ?? NoFuelHistorySource.Instance;

    private readonly Func<Aim?> _activePlan =
        activePlan ?? throw new ArgumentNullException(nameof(activePlan));

    private readonly ILapHistoryStore _history =
        history ?? throw new ArgumentNullException(nameof(history));

    // The segment kinds a plan holds targets for (KindFor).
    private static readonly SegmentKind[] TargetedKinds = [SegmentKind.Qualifying, SegmentKind.Race];

    private static readonly IReadOnlyDictionary<(string SessionId, int LapNumber), LapReferenceCurve> NoCurves =
        new Dictionary<(string SessionId, int LapNumber), LapReferenceCurve>();

    // The reference curves of the active plan's target laps, as the last ResolveReferences found
    // them. Replaced whole and never changed after, so the telemetry loop reads it without a lock.
    private volatile IReadOnlyDictionary<(string SessionId, int LapNumber), LapReferenceCurve> _curves = NoCurves;

    // One resolve at a time, so an older corpus read can never replace a newer one's curves.
    private readonly Lock _resolveGate = new();

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
    /// longer in the corpus — or when <see cref="ResolveReferences"/> has not found the lap's
    /// curve yet. Null leaves <see cref="DeltaTracker"/> on its own session best rather than
    /// inventing a pro-rata trace from a single number.
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
        if (!string.Equals(frame.Session.Track, this._track, StringComparison.Ordinal)
            || frame.Session.SessionType != this._sessionType
            || !frame.Session.InCar)
        {
            this._lap = null;
        }

        this._track = frame.Session.Track;
        this._sessionType = frame.Session.SessionType;

        if (!frame.Session.InCar)
        {
            // Out of the car there is no lap to spoil, so a pending change lands now and the
            // driver rejoins already on the new target.
            this.Apply(frame);
            return true;
        }

        // Still on the lap the latch is waiting out.
        if (this._lap is { } previous && frame.Lap.CurrentLap == previous)
        {
            return false;
        }

        // Any other lap number is a new lap to measure: an increment at the line, or a
        // restart/teleport going backwards, which also ended the lap that was in progress.
        this._lap = frame.Lap.CurrentLap;
        this.Apply(frame);
        return true;
    }

    private void Apply(TelemetryFrame frame)
    {
        Aim? aim = this._activePlan();
        PlanTarget? target = KindFor(frame.Session.SessionType) is { } kind
            ? aim?.TargetFor(kind)
            : null;

        this.Targets = new DashTargets
        {
            LapTimeSeconds = target?.LapTimeSeconds,
            FuelPerLapLiters = aim is null ? null : this.FuelPerLapFor(aim),
        };
        this.Reference = this.ReferenceFor(target);
    }

    // A typed figure wins (RaceFuelEstimate.TypedValue: a legacy 0 is none); a plan that left it to
    // the driver's laps gets the median the planner's Race card shows. Only the cached figure: this
    // runs on the telemetry loop, which must never read the corpus or wait on the store's lock.
    private double? FuelPerLapFor(Aim aim) =>
        RaceFuelEstimate.TypedValue(aim.FuelPerLapLiters)
        ?? this._fuelHistory.Cached(aim.Context)?.FuelPerLapLiters;

    /// <summary>
    /// Finds the reference curve of each lap the active plan targets (qualifying and race) in the
    /// corpus, for the next line to use. Reads the whole corpus and may wait on the store's lock,
    /// so never from the telemetry loop: the host calls it on every state poll, beside asking for
    /// every plan's race fuel, which over the cached corpus costs a lookup. A changed target, or a
    /// target lap that left the corpus, is picked up by the next call.
    /// </summary>
    public void ResolveReferences()
    {
        lock (this._resolveGate)
        {
            Aim? aim = this._activePlan();
            List<(string SessionId, int LapNumber)> wanted = [];
            foreach (SegmentKind kind in TargetedKinds)
            {
                if (aim?.TargetFor(kind) is { LapSessionId: { } sessionId, LapNumber: { } lapNumber })
                {
                    wanted.Add((sessionId, lapNumber));
                }
            }

            if (wanted.Count == 0)
            {
                this._curves = NoCurves;
                return;
            }

            IReadOnlyList<LapHistorySession> corpus = this._history.LoadAll();
            Dictionary<(string SessionId, int LapNumber), LapReferenceCurve> curves = [];
            foreach ((string sessionId, int lapNumber) in wanted)
            {
                // The tier is read off the lap in the corpus, never off the flag stored on the
                // target: the target records what was true when it was chosen, and the lap is
                // what is actually there to be measured against now.
                LapHistoryRecord? lap = corpus
                    .FirstOrDefault(session => string.Equals(session.Id, sessionId, StringComparison.Ordinal))
                    ?.Laps.FirstOrDefault(record => record.LapNumber == lapNumber);

                if (lap is { HasReferenceCurve: true, ReferenceCurve: { } curve })
                {
                    curves[(sessionId, lapNumber)] = curve;
                }
            }

            this._curves = curves;
        }
    }

    // Only a curve ResolveReferences already found: this runs on the telemetry loop, which must
    // never read the corpus or wait on the store's lock.
    private DeltaReference? ReferenceFor(PlanTarget? target)
    {
        if (target is not { LapSessionId: { } sessionId, LapNumber: { } lapNumber }
            || !this._curves.TryGetValue((sessionId, lapNumber), out LapReferenceCurve? curve))
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

    /// <summary>
    /// What the delivery reads off the active plan, copied out so it is never read while a
    /// <c>plan.*</c> command changes the plan on another thread. The targets are kept by
    /// reference: a target is replaced whole when the driver picks another, never changed in place.
    /// </summary>
    public sealed record Aim(PlanContext Context, double? FuelPerLapLiters, PlanTarget? Qualifying, PlanTarget? Race)
    {
        /// <summary>Copies what the delivery needs off <paramref name="plan"/>; call it under the planner's lock.</summary>
        public static Aim Of(SessionPlan plan) => new(
            new PlanContext(plan.Game, plan.Car, plan.Track),
            plan.FuelPerLapLiters,
            plan.TargetsFor(SegmentKind.Qualifying)?.LapTime,
            plan.TargetsFor(SegmentKind.Race)?.LapTime);

        /// <summary>The lap-time target for <paramref name="kind"/>, or null when none was chosen.</summary>
        public PlanTarget? TargetFor(SegmentKind kind) => kind switch
        {
            SegmentKind.Qualifying => this.Qualifying,
            SegmentKind.Race => this.Race,
            _ => null,
        };
    }
}
