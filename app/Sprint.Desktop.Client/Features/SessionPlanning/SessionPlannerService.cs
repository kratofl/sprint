using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>Fields needed to create a new plan. Defaults mirror the intended global defaults (#103).</summary>
public sealed record CreatePlanRequest
{
    public string Name { get; init; } = "";
    public string Game { get; init; } = "";
    public string Car { get; init; } = "";
    public string Track { get; init; } = "";
    public bool QualifyingIncluded { get; init; } = true;
    public RaceLengthFormat RaceLengthFormat { get; init; } = RaceLengthFormat.Unknown;
    public double RaceLengthValue { get; init; }
    public int FuelReserveLaps { get; init; } = 1;
    public string Notes { get; init; } = "";
    public IReadOnlyList<string> SetupReferences { get; init; } = [];
}

/// <summary>
/// The Session Planner's frontend-facing service (#99): plan lifecycle
/// (create/list/update/delete), the single active-tracking slot, and live-telemetry
/// ingestion — all above a storage-agnostic <see cref="ISessionPlanStore"/> so the UI
/// never touches persistence details. It is game-agnostic: it consumes only the unified
/// <see cref="TelemetryFrame"/> contract, never a <c>Sprint.Games</c> structure.
/// </summary>
public sealed class SessionPlannerService
{
    private const string RaceFormatMismatchWarning = "race-format-mismatch";

    private readonly ISessionPlanStore _store;
    private readonly ILog _log;
    private readonly Func<DateTimeOffset> _clock;
    private readonly Func<string> _idFactory;
    private readonly List<SessionPlan> _plans;

    private string? _activePlanId;
    private int _lastSeenLap;

    public SessionPlannerService(
        ISessionPlanStore store,
        ILog? log = null,
        Func<DateTimeOffset>? clock = null,
        Func<string>? idFactory = null)
    {
        _store = store;
        _log = log ?? NullLog.Instance;
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _idFactory = idFactory ?? (() => Guid.NewGuid().ToString("N"));

        _plans = _store.LoadAll()
            .OrderByDescending(plan => plan.CreatedAt)
            .ToList();

        _activePlanId = _store.LoadActivePlanId();
        ReconcileActiveSlot();
    }

    /// <summary>All plans, newest first, including completed history.</summary>
    public IReadOnlyList<SessionPlan> Plans => _plans;

    /// <summary>The single active (armed or tracking) plan, or <c>null</c>.</summary>
    public SessionPlan? ActivePlan =>
        _activePlanId is null ? null : _plans.FirstOrDefault(plan => plan.Id == _activePlanId);

    public SessionPlan? Find(string planId) => _plans.FirstOrDefault(plan => plan.Id == planId);

    /// <summary>Creates a new draft plan and persists it. Does not claim the active slot.</summary>
    public SessionPlan CreatePlan(CreatePlanRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var plan = new SessionPlan
        {
            Id = _idFactory(),
            Name = string.IsNullOrWhiteSpace(request.Name) ? "New Session Plan" : request.Name.Trim(),
            Game = request.Game,
            Car = request.Car,
            Track = request.Track,
            Status = PlanStatus.Draft,
            QualifyingIncluded = request.QualifyingIncluded,
            RaceLengthFormat = request.RaceLengthFormat,
            RaceLengthValue = request.RaceLengthValue,
            FuelReserveLaps = Math.Max(0, request.FuelReserveLaps),
            Notes = request.Notes,
            SetupReferences = [.. request.SetupReferences],
            CreatedAt = _clock(),
        };

        _plans.Insert(0, plan);
        _store.Save(plan);
        _log.Info($"Created session plan '{plan.Id}' ({plan.Game}/{plan.Track})");
        return plan;
    }

    /// <summary>Persists edits to an existing plan (metadata, notes, setup references, etc.).</summary>
    public void UpdatePlan(SessionPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);
        var index = _plans.FindIndex(existing => existing.Id == plan.Id);
        if (index < 0)
        {
            throw new InvalidOperationException($"No session plan with id '{plan.Id}' exists.");
        }

        _plans[index] = plan;
        _store.Save(plan);
    }

    /// <summary>Deletes a plan. If it held the active slot, the slot is cleared.</summary>
    public void DeletePlan(string planId)
    {
        var index = _plans.FindIndex(plan => plan.Id == planId);
        if (index < 0)
        {
            return;
        }

        _plans.RemoveAt(index);
        _store.Delete(planId);
        if (_activePlanId == planId)
        {
            ClearActiveSlot();
        }
    }

    /// <summary>
    /// Claims the single active slot for <paramref name="planId"/> and marks it armed,
    /// waiting for a manual or telemetry-driven start. Throws if a different plan already
    /// holds the slot.
    /// </summary>
    public void Arm(string planId)
    {
        var plan = Require(planId);
        ClaimActiveSlot(plan);
        plan.Status = PlanStatus.Armed;
        _store.Save(plan);
        _log.Info($"Armed session plan '{plan.Id}'");
    }

    /// <summary>
    /// Starts tracking a <paramref name="kind"/> segment for the plan, opening a segment
    /// and claiming the active slot. Enforces exactly one actively tracked plan. Reuses an
    /// already-open segment of the same kind rather than opening a duplicate.
    /// </summary>
    public PlanSegment StartTracking(string planId, SegmentKind kind, SegmentSource source = SegmentSource.Manual)
    {
        var plan = Require(planId);
        ClaimActiveSlot(plan);

        var now = _clock();
        plan.StartedAt ??= now;
        plan.Status = PlanStatus.Tracking;

        var segment = OpenSegment(plan)
            ?? AppendSegment(plan, kind, source, now);

        // If a different-kind segment was open (e.g. moving Q -> R), close it first.
        if (segment.Kind != kind)
        {
            segment.ActualEnd = now;
            segment = AppendSegment(plan, kind, source, now);
        }

        _lastSeenLap = 0;
        _store.Save(plan);
        _log.Info($"Started tracking {kind} for session plan '{plan.Id}'");
        return segment;
    }

    /// <summary>
    /// Stops tracking: closes the open segment, completes the plan, and releases the active
    /// slot. Always available while a plan is active.
    /// </summary>
    public void StopTracking(string planId)
    {
        var plan = Require(planId);
        var now = _clock();

        var segment = OpenSegment(plan);
        if (segment is not null)
        {
            segment.ActualEnd = now;
        }

        plan.Status = PlanStatus.Completed;
        plan.EndedAt = now;
        _store.Save(plan);

        if (_activePlanId == plan.Id)
        {
            ClearActiveSlot();
        }

        _log.Info($"Stopped tracking session plan '{plan.Id}'");
    }

    /// <summary>
    /// Feeds one unified telemetry frame to the active plan. No-op unless a plan is actively
    /// tracking an open segment. Records live session type, appends a <see cref="LapSummary"/>
    /// as each lap completes, and raises a race-format-mismatch warning when telemetry
    /// disagrees with the plan. Detailed high-rate trace capture is out of scope here (#101).
    /// </summary>
    public void Ingest(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        var plan = ActivePlan;
        if (plan is null || plan.Status != PlanStatus.Tracking)
        {
            return;
        }

        var segment = OpenSegment(plan);
        if (segment is null)
        {
            return;
        }

        var dirty = RecordLiveContext(segment, frame);
        dirty |= RecordCompletedLap(segment, frame);
        dirty |= DetectRaceFormatMismatch(plan, segment, frame);

        if (dirty)
        {
            _store.Save(plan);
        }
    }

    private bool RecordLiveContext(PlanSegment segment, TelemetryFrame frame)
    {
        var sessionType = frame.Session.SessionType.ToString();
        if (segment.LiveSessionType == sessionType)
        {
            return false;
        }

        segment.LiveSessionType = sessionType;
        return true;
    }

    private bool RecordCompletedLap(PlanSegment segment, TelemetryFrame frame)
    {
        var currentLap = frame.Lap.CurrentLap;
        if (_lastSeenLap == 0)
        {
            _lastSeenLap = currentLap;
            return false;
        }

        // A lap crossing: the just-finished lap is the one we were on. Only record it
        // when telemetry gives a completed lap time, so we never log a phantom lap 0.
        if (currentLap <= _lastSeenLap || frame.Lap.LastLapTime <= 0)
        {
            _lastSeenLap = Math.Max(_lastSeenLap, currentLap);
            return false;
        }

        segment.Laps.Add(new LapSummary
        {
            LapNumber = _lastSeenLap,
            IsValid = frame.Lap.IsValid,
            LapTimeSeconds = frame.Lap.LastLapTime,
            FuelRemainingLiters = frame.Car.FuelLiters,
        });

        _lastSeenLap = currentLap;
        return true;
    }

    private bool DetectRaceFormatMismatch(SessionPlan plan, PlanSegment segment, TelemetryFrame frame)
    {
        if (segment.Kind != SegmentKind.Race || plan.RaceLengthFormat == RaceLengthFormat.Unknown)
        {
            return false;
        }

        var detected = frame.Session.MaxLaps > 0 ? RaceLengthFormat.LapBased : RaceLengthFormat.TimeBased;
        var changed = segment.DetectedRaceFormat != detected;
        segment.DetectedRaceFormat = detected;

        if (detected == plan.RaceLengthFormat)
        {
            return changed;
        }

        var alreadyWarned = plan.Warnings.Any(warning => warning.Kind == RaceFormatMismatchWarning);
        if (alreadyWarned)
        {
            return changed;
        }

        plan.Warnings.Add(new PlanWarning
        {
            Kind = RaceFormatMismatchWarning,
            Message = $"Live telemetry reports a {detected} race, but the plan is {plan.RaceLengthFormat}.",
            CreatedAt = _clock(),
        });
        _log.Warn($"Race format mismatch on plan '{plan.Id}': planned {plan.RaceLengthFormat}, detected {detected}");
        return true;
    }

    private static PlanSegment? OpenSegment(SessionPlan plan) =>
        plan.Segments.FirstOrDefault(segment => segment.ActualStart is not null && segment.ActualEnd is null);

    private PlanSegment AppendSegment(SessionPlan plan, SegmentKind kind, SegmentSource source, DateTimeOffset start)
    {
        var segment = new PlanSegment
        {
            Id = _idFactory(),
            Kind = kind,
            Source = source,
            ActualStart = start,
        };
        plan.Segments.Add(segment);
        return segment;
    }

    private SessionPlan Require(string planId) =>
        Find(planId) ?? throw new InvalidOperationException($"No session plan with id '{planId}' exists.");

    private void ClaimActiveSlot(SessionPlan plan)
    {
        if (_activePlanId is not null && _activePlanId != plan.Id)
        {
            throw new InvalidOperationException(
                $"Session plan '{_activePlanId}' is already active; only one plan can be active at a time.");
        }

        if (_activePlanId != plan.Id)
        {
            _activePlanId = plan.Id;
            _store.SaveActivePlanId(plan.Id);
        }
    }

    private void ClearActiveSlot()
    {
        _activePlanId = null;
        _lastSeenLap = 0;
        _store.SaveActivePlanId(null);
    }

    // On startup, drop a dangling active pointer (deleted plan) and demote a plan left
    // "tracking" by a crash to Abandoned so the single active slot is never wedged.
    private void ReconcileActiveSlot()
    {
        if (_activePlanId is null)
        {
            return;
        }

        var active = _plans.FirstOrDefault(plan => plan.Id == _activePlanId);
        if (active is null)
        {
            ClearActiveSlot();
            return;
        }

        if (active.Status == PlanStatus.Tracking)
        {
            active.Status = PlanStatus.Abandoned;
            active.EndedAt ??= _clock();
            foreach (var open in active.Segments.Where(segment => segment.ActualStart is not null && segment.ActualEnd is null))
            {
                open.ActualEnd = active.EndedAt;
            }

            _store.Save(active);
            _log.Warn($"Session plan '{active.Id}' was left tracking; marked Abandoned on startup.");
            ClearActiveSlot();
        }
    }
}
