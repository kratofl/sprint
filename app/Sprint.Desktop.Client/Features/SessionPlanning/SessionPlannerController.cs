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

    private string? _selectedPlanId;
    private PlannerSegmentTab? _selectedTab;

    public SessionPlannerController(
        SessionPlannerService service,
        IFuelHistorySource fuelHistory,
        Func<PlanContext> lastSeenContext)
    {
        _service = service ?? throw new ArgumentNullException(nameof(service));
        _fuelHistory = fuelHistory ?? throw new ArgumentNullException(nameof(fuelHistory));
        _lastSeenContext = lastSeenContext ?? throw new ArgumentNullException(nameof(lastSeenContext));
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

    private void RaiseChanged() => Changed?.Invoke(this, EventArgs.Empty);
}
