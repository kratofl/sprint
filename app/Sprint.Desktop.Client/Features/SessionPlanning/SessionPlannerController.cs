using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>Which segment of the plan the page is showing. Local page state only —
/// this is a state choice inside one destination, never shell navigation.</summary>
public enum PlannerSegmentTab
{
    Qualifying,
    Race,
}

/// <summary>A game/car/track triple, used for prefill and history lookups.</summary>
public sealed record PlanContext(string Game, string Car, string Track)
{
    public static PlanContext Empty { get; } = new("", "", "");

    public bool IsEmpty =>
        string.IsNullOrWhiteSpace(Game)
        && string.IsNullOrWhiteSpace(Car)
        && string.IsNullOrWhiteSpace(Track);
}

/// <summary>Something Quick mode could not detect and therefore has to ask for.</summary>
public enum QuickPlanField
{
    /// <summary>Game, car or track is still unknown.</summary>
    Context,

    /// <summary>The sim has not said how long the race is.</summary>
    RaceLength,

    /// <summary>No lap history for this context, so average lap time and fuel per lap are needed.</summary>
    Fuel,
}

/// <summary>
/// What Sprint already knows about the session the driver is about to run, and what it does
/// not. Quick mode renders the known parts read-only and asks only for
/// <see cref="MissingFields"/>, so the form shrinks by itself as detection improves.
/// </summary>
public sealed record PlanDetection(
    PlanContext Context,
    RaceLengthFormat RaceLengthFormat,
    double RaceLengthValue,
    bool HasFuelHistory)
{
    /// <summary>Every part of the context is known, so none of it needs typing.</summary>
    public bool ContextComplete =>
        !string.IsNullOrWhiteSpace(Context.Game)
        && !string.IsNullOrWhiteSpace(Context.Car)
        && !string.IsNullOrWhiteSpace(Context.Track);

    public bool RaceLengthKnown => RaceLengthFormat != RaceLengthFormat.Unknown && RaceLengthValue > 0;

    /// <summary>
    /// The gaps, in the order the modal shows them. Empty means Quick mode is a read-only
    /// summary plus <c>Create</c>.
    /// </summary>
    public IReadOnlyList<QuickPlanField> MissingFields
    {
        get
        {
            var missing = new List<QuickPlanField>(capacity: 3);
            if (!ContextComplete)
            {
                missing.Add(QuickPlanField.Context);
            }

            if (!RaceLengthKnown)
            {
                missing.Add(QuickPlanField.RaceLength);
            }

            if (!HasFuelHistory)
            {
                missing.Add(QuickPlanField.Fuel);
            }

            return missing;
        }
    }
}

/// <summary>Whether a plan may claim the single active slot, and an honest reason when it
/// may not — shown inline next to the disabled action rather than hidden in a tooltip.</summary>
public sealed record PlanActivation(bool CanActivate, string Reason)
{
    public static PlanActivation Allowed { get; } = new(true, "");
}

/// <summary>
/// The Session Planner page's interaction seam (#100). It owns page state — the plan in
/// view and the selected segment tab — and turns user intent into
/// <see cref="SessionPlannerService"/> calls. Deliberately free of Avalonia so every
/// acceptance criterion is a unit test; <see cref="SessionPlannerView"/> is the thin
/// renderer above it.
/// </summary>
public sealed class SessionPlannerController
{
    private readonly SessionPlannerService _service;
    private readonly IFuelHistorySource _fuelHistory;
    private readonly Func<PlanContext> _lastSeenContext;
    private readonly ILapHistoryStore _lapHistory;
    private readonly Func<DateTimeOffset> _clock;

    private string? _selectedPlanId;
    private PlannerSegmentTab? _selectedTab;
    private (PlanTargetScope Scope, string? ProgramType)? _selectedTargetScope;

    /// <param name="lapHistory">
    /// The corpus target selection resolves against (#186). Omitted means an empty corpus, so
    /// the page offers no preset and asks the driver for the value instead.
    /// </param>
    public SessionPlannerController(
        SessionPlannerService service,
        IFuelHistorySource fuelHistory,
        Func<PlanContext> lastSeenContext,
        ILapHistoryStore? lapHistory = null,
        Func<DateTimeOffset>? clock = null)
    {
        _service = service ?? throw new ArgumentNullException(nameof(service));
        _fuelHistory = fuelHistory ?? throw new ArgumentNullException(nameof(fuelHistory));
        _lastSeenContext = lastSeenContext ?? throw new ArgumentNullException(nameof(lastSeenContext));
        _lapHistory = lapHistory ?? EmptyLapHistoryStore.Instance;
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    /// <summary>Raised after any state change, so the shell can repaint the page.</summary>
    public event EventHandler? Changed;

    /// <summary>Every plan, newest first, including completed history.</summary>
    public IReadOnlyList<SessionPlan> History => _service.Plans;

    public bool HasPlans => _service.Plans.Count > 0;

    /// <summary>
    /// The plan the page is showing: an explicit selection, else the active plan, else the
    /// most recent one. Null only when no plans exist at all.
    /// </summary>
    public SessionPlan? PlanInView
    {
        get
        {
            if (_selectedPlanId is not null && _service.Find(_selectedPlanId) is { } selected)
            {
                return selected;
            }

            return _service.ActivePlan ?? _service.Plans.FirstOrDefault();
        }
    }

    public SessionPlan? ActivePlan => _service.ActivePlan;

    /// <summary>Hidden in exactly one case: no plans exist, so there is nothing to switch.</summary>
    public bool SegmentedControlVisible => HasPlans;

    /// <summary>Qualifying stays present but unselectable when the plan skips it — segments
    /// are not removed dynamically.</summary>
    public bool QualifyingTabEnabled => PlanInView?.QualifyingIncluded ?? false;

    public string QualifyingTabLabel => QualifyingTabEnabled ? "Qualifying" : "Skipped";

    /// <summary>Defaults to Qualifying when the plan includes it, Race otherwise.</summary>
    public PlannerSegmentTab SelectedTab
    {
        get
        {
            var fallback = QualifyingTabEnabled ? PlannerSegmentTab.Qualifying : PlannerSegmentTab.Race;
            if (_selectedTab is not { } tab)
            {
                return fallback;
            }

            return tab == PlannerSegmentTab.Qualifying && !QualifyingTabEnabled ? fallback : tab;
        }
    }

    /// <summary>The race-format mismatch message for the plan in view, or null. The service
    /// raises the warning during ingestion; the page only surfaces it.</summary>
    public string? RaceFormatWarning => PlanInView?
        .Warnings
        .FirstOrDefault(warning => warning.Kind == "race-format-mismatch")?
        .Message;

    public void SelectTab(PlannerSegmentTab tab)
    {
        if (tab == PlannerSegmentTab.Qualifying && !QualifyingTabEnabled)
        {
            return;
        }

        _selectedTab = tab;
        RaiseChanged();
    }

    public void SelectPlan(string planId)
    {
        if (_service.Find(planId) is null)
        {
            return;
        }

        _selectedPlanId = planId;
        _selectedTab = null;
        RaiseChanged();
    }

    public SessionPlan CreatePlan(CreatePlanRequest request)
    {
        var plan = _service.CreatePlan(request);
        _selectedPlanId = null;
        _selectedTab = null;
        RaiseChanged();
        return plan;
    }

    public void Arm(string planId)
    {
        _service.Arm(planId);
        RaiseChanged();
    }

    public void StartNow(string planId, SegmentKind kind)
    {
        _service.StartTracking(planId, kind);
        RaiseChanged();
    }

    public void Stop(string planId)
    {
        _service.StopTracking(planId);
        RaiseChanged();
    }

    public void Disarm(string planId)
    {
        _service.Disarm(planId);
        RaiseChanged();
    }

    /// <summary>
    /// Values a new plan starts from: the persisted last-seen telemetry context, else the
    /// most recent plan's context, else empty. Persisted context comes first because a plan
    /// is created before entering a car, when the live frame has nothing to report.
    /// </summary>
    public PlanContext Prefill()
    {
        var lastSeen = _lastSeenContext();
        if (!lastSeen.IsEmpty)
        {
            return lastSeen;
        }

        var recent = _service.Plans.FirstOrDefault();
        return recent is null
            ? PlanContext.Empty
            : new PlanContext(recent.Game, recent.Car, recent.Track);
    }

    /// <summary>
    /// What Quick mode can fill in for itself from <paramref name="session"/>, falling back to
    /// the remembered context for anything the sim has not reported yet (the car is commonly
    /// unknown until the driver has a vehicle).
    /// <para>
    /// Race length is taken from the lap count when there is one, else from a plausible total
    /// session time converted to minutes. An implausible or absent length is reported as
    /// <see cref="RaceLengthFormat.Unknown"/> so the modal asks: committing a garbage number
    /// here would quietly become a garbage fuel estimate.
    /// </para>
    /// </summary>
    public PlanDetection Detect(SessionInfo session)
    {
        ArgumentNullException.ThrowIfNull(session);

        var remembered = _lastSeenContext();
        var context = new PlanContext(
            Coalesce(session.Game, remembered.Game),
            Coalesce(session.Car, remembered.Car),
            Coalesce(session.Track, remembered.Track));

        var (format, value) = session switch
        {
            { MaxLaps: > 0 } => (RaceLengthFormat.LapBased, (double)session.MaxLaps),
            { TotalSessionTime: > 0 } => (RaceLengthFormat.TimeBased, session.TotalSessionTime.Value / 60),
            _ => (RaceLengthFormat.Unknown, 0d),
        };

        return new PlanDetection(context, format, value, HasFuelHistory(context));
    }

    private static string Coalesce(string reported, string remembered) =>
        string.IsNullOrWhiteSpace(reported) ? remembered : reported;

    /// <summary>
    /// The game/car/track values the creation sheet offers, from the corpus plus the live
    /// context. Exposed here rather than built in the view so the sheet cannot drift from the
    /// spellings the lap-history bucket is actually keyed on.
    /// </summary>
    public PlanContextOptions ContextOptions() =>
        PlanContextOptions.From(_lapHistory, _lastSeenContext());

    /// <summary>Whether the creation flow can skip asking for manual average lap time and
    /// fuel per lap. False until #50 supplies a real history source.</summary>
    public bool HasFuelHistory(PlanContext context) =>
        _fuelHistory.HasHistory(context.Game, context.Car, context.Track);

    /// <summary>
    /// Whether <paramref name="planId"/> may claim the active slot. The UI disables the
    /// action and shows <see cref="PlanActivation.Reason"/> instead of letting the service's
    /// double-claim exception surface.
    /// </summary>
    public PlanActivation CanActivate(string planId)
    {
        var active = _service.ActivePlan;
        if (active is null || active.Id == planId)
        {
            return PlanActivation.Allowed;
        }

        var name = string.IsNullOrWhiteSpace(active.Name) ? "Another plan" : active.Name;
        return new PlanActivation(false, $"{name} is active");
    }

    /// <summary>
    /// Explicit takeover: frees whatever holds the slot — disarming an armed plan, stopping a
    /// tracking one — then arms <paramref name="planId"/>. The UI gates this behind a confirm.
    /// </summary>
    public void TakeOver(string planId)
    {
        if (_service.Find(planId) is null)
        {
            return;
        }

        if (_service.ActivePlan is { } active && active.Id != planId)
        {
            _service.ReleaseActiveSlot();
        }

        _service.Arm(planId);
        _selectedPlanId = planId;
        _selectedTab = null;
        RaiseChanged();
    }

    /// <summary>
    /// The (scope, statistic) pairs the corpus can offer for the plan in view (#186). Empty
    /// when there is no history for the plan's context, in which case the driver sets the
    /// value directly — see <see cref="PlanTargetChoices.NoHistoryMessage"/>.
    /// </summary>
    public PlanTargetChoices TargetChoices()
    {
        if (PlanInView is not { } plan)
        {
            return PlanTargetChoices.None;
        }

        return PlanTargetResolver.Choices(_lapHistory, HistoryContext(plan), plan.Mode);
    }

    /// <summary>
    /// The scope the selector is showing: an explicit pick, else the first one offered. A pick
    /// the corpus no longer offers falls back rather than leaving the selector on nothing —
    /// the same rule the segment tabs use for a skipped qualifying.
    /// </summary>
    public PlanTargetScopeGroup? SelectedTargetScope(PlanTargetChoices choices)
    {
        ArgumentNullException.ThrowIfNull(choices);
        if (_selectedTargetScope is { } selected
            && choices.Scope(selected.Scope, selected.ProgramType) is { } group)
        {
            return group;
        }

        return choices.Scopes.FirstOrDefault();
    }

    public void SelectTargetScope(PlanTargetScope scope, string? programType = null)
    {
        _selectedTargetScope = (scope, programType);
        RaiseChanged();
    }

    /// <summary>The stored target for <paramref name="kind"/> on the plan in view, or null.</summary>
    public PlanTarget? TargetFor(SegmentKind kind) => PlanInView?.TargetsFor(kind)?.LapTime;

    /// <summary>
    /// Whether an edit made now would only take effect at the next start/finish line (#189).
    /// True exactly while a session is live: targets latch at the line, so the lap in progress
    /// keeps the one it was started with, and the page has to say so rather than let a driver
    /// read the current lap's delta against a target it was never driven against.
    /// </summary>
    public bool TargetsApplyFromNextLap => PlanInView?.Status == PlanStatus.Tracking;

    /// <summary>Stores <paramref name="option"/> as the lap-time target for <paramref name="kind"/>.</summary>
    public void SetTarget(SegmentKind kind, PlanTargetOption option)
    {
        ArgumentNullException.ThrowIfNull(option);
        StoreTarget(kind, option.ToTarget(_clock()));
    }

    /// <summary>
    /// Stores a lap time the driver typed (<c>m:ss.f</c> or seconds) as the target for
    /// <paramref name="kind"/>. False when the entry is not a lap time, in which case nothing
    /// is written — this is the path that keeps an empty corpus from dead-ending the plan.
    /// </summary>
    public bool SetManualTarget(SegmentKind kind, string text)
    {
        if (!PlanTargetResolver.TryParseLapTime(text, out var seconds))
        {
            return false;
        }

        StoreTarget(kind, new PlanTarget
        {
            Scope = PlanTargetScope.Manual,
            LapTimeSeconds = seconds,
            UpdatedAt = _clock(),
        });
        return true;
    }

    /// <summary>Removes the lap-time target for <paramref name="kind"/>, leaving none set.</summary>
    public void ClearTarget(SegmentKind kind)
    {
        if (PlanInView is not { } plan || plan.TargetsFor(kind) is not { } targets)
        {
            return;
        }

        targets.LapTime = null;
        _service.UpdatePlan(plan);
        RaiseChanged();
    }

    private void StoreTarget(SegmentKind kind, PlanTarget target)
    {
        if (PlanInView is not { } plan)
        {
            return;
        }

        var targets = plan.TargetsFor(kind);
        if (targets is null)
        {
            targets = new PlanTargets { Kind = kind };
            plan.Targets.Add(targets);
        }

        targets.LapTime = target;
        _service.UpdatePlan(plan);
        RaiseChanged();
    }

    // The corpus keys on the layout actually driven and the car model; the plan's Track and
    // Car are those same two fields, captured from the same telemetry the recorder writes.
    private static LapHistoryContext HistoryContext(SessionPlan plan) => new()
    {
        Game = plan.Game,
        TrackCourse = plan.Track,
        CarModel = plan.Car,
    };

    private void RaiseChanged() => Changed?.Invoke(this, EventArgs.Empty);
}
