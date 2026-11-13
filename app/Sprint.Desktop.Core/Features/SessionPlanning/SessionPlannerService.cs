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

    /// <summary>Which creation flow this came from. Defaults to the full sheet.</summary>
    public PlanMode Mode { get; init; } = PlanMode.Planned;

    public bool QualifyingIncluded { get; init; } = true;
    public RaceLengthFormat RaceLengthFormat { get; init; } = RaceLengthFormat.Unknown;
    public double RaceLengthValue { get; init; }
    public int FuelReserveLaps { get; init; } = 1;
    public double? AvgLapTimeSeconds { get; init; }
    public double? FuelPerLapLiters { get; init; }
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
    private const double AutoStartHoldSeconds = 1.0;

    private readonly ISessionPlanStore _store;
    private readonly ILog _log;
    private readonly Func<DateTimeOffset> _clock;
    private readonly Func<string> _idFactory;
    private readonly Func<bool> _warnOnRaceFormatMismatch;
    private readonly List<SessionPlan> _plans;

    // The host drives this service from two independent threads: the telemetry ingest loop
    // (Ingest, and ActivePlan through PlanTargetDelivery) and HTTP plan.* command handlers,
    // which Kestrel can dispatch concurrently. Every public entry point locks on this, so the
    // plan list and the single active slot are never read or mutated half-updated. A plain
    // Monitor lock is fine here (laps complete roughly once a minute; plan.* commands are rarer
    // still), and it is reentrant, so one locked method calling another on the same thread
    // (e.g. Ingest -> StartTracking, ReleaseActiveSlot -> Disarm) just re-enters it.
    private readonly object _gate = new();

    private string? _activePlanId;
    private int _lastSeenLap;
    private bool _lastSeenLapIsValid = true;
    private SessionType _autoStartCandidate = SessionType.Unknown;
    private DateTimeOffset? _autoStartSince;

    /// <param name="warnOnRaceFormatMismatch">
    /// Read on every race-format check, so turning the setting off stops new warnings at once
    /// (<see cref="Runtime.SessionPlannerSettings.WarnOnRaceFormatMismatch"/>). Omitted means on.
    /// </param>
    public SessionPlannerService(
        ISessionPlanStore store,
        ILog? log = null,
        Func<DateTimeOffset>? clock = null,
        Func<string>? idFactory = null,
        Func<bool>? warnOnRaceFormatMismatch = null)
    {
        this._store = store;
        this._log = log ?? NullLog.Instance;
        this._clock = clock ?? (() => DateTimeOffset.UtcNow);
        this._idFactory = idFactory ?? (() => Guid.NewGuid().ToString("N"));
        this._warnOnRaceFormatMismatch = warnOnRaceFormatMismatch ?? (() => true);

        this._plans = this._store.LoadAll()
            .OrderByDescending(plan => plan.CreatedAt)
            .ToList();

        this._activePlanId = this._store.LoadActivePlanId();
        this.ReconcileActiveSlot();
    }

    /// <summary>All plans, newest first, including completed history. A snapshot copy, so a
    /// caller enumerating it never races the ingest loop's or another request's mutation.</summary>
    public IReadOnlyList<SessionPlan> Plans
    {
        get { lock (this._gate) { return this._plans.ToList(); } }
    }

    /// <summary>The single active (armed or tracking) plan, or <c>null</c>.</summary>
    public SessionPlan? ActivePlan
    {
        get
        {
            lock (this._gate)
            {
                return this._activePlanId is null ? null : this._plans.FirstOrDefault(plan => plan.Id == this._activePlanId);
            }
        }
    }

    /// <summary>
    /// Reads the active plan under the planner's lock, so a reader on another thread (the live
    /// link sharing it) never sees it half-updated by the ingest loop. Null without an active plan.
    /// </summary>
    public T? ReadActive<T>(Func<SessionPlan, T> read)
        where T : class
    {
        lock (this._gate)
        {
            return this.ActivePlan is { } plan ? read(plan) : null;
        }
    }

    public SessionPlan? Find(string planId)
    {
        lock (this._gate)
        {
            return this._plans.FirstOrDefault(plan => plan.Id == planId);
        }
    }

    /// <summary>Creates a new draft plan and persists it. Does not claim the active slot.</summary>
    public SessionPlan CreatePlan(CreatePlanRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        SessionPlan plan = new SessionPlan
        {
            Id = this._idFactory(),
            Name = string.IsNullOrWhiteSpace(request.Name) ? DerivedName(request.Track, request.Car) : request.Name.Trim(),
            Game = request.Game,
            Car = request.Car,
            Track = request.Track,
            Status = PlanStatus.Draft,
            Mode = request.Mode,
            QualifyingIncluded = request.QualifyingIncluded,
            RaceLengthFormat = request.RaceLengthFormat,
            RaceLengthValue = request.RaceLengthValue,
            FuelReserveLaps = Math.Max(0, request.FuelReserveLaps),
            AvgLapTimeSeconds = request.AvgLapTimeSeconds,
            FuelPerLapLiters = request.FuelPerLapLiters,
            Notes = request.Notes,
            SetupReferences = [.. request.SetupReferences],
            CreatedAt = this._clock(),
        };

        lock (this._gate)
        {
            this._plans.Insert(0, plan);
            this._store.Save(plan);
        }

        this._log.Info($"Created session plan '{plan.Id}' ({plan.Game}/{plan.Track})");
        return plan;
    }

    /// <summary>
    /// What an unnamed plan is called: where and what it is for (<c>Track – Car</c>), so the plan
    /// list stays readable. The one rule: the creation sheet previews it as the name field's
    /// placeholder (mirrored in <c>SessionPlannerDomain.ts</c>), and this is the name the plan gets.
    /// </summary>
    public static string DerivedName(string track, string car)
    {
        string[] parts = new[] { track.Trim(), car.Trim() }
            .Where(part => part.Length > 0)
            .ToArray();
        return parts.Length == 0 ? "New Session Plan" : string.Join(" – ", parts);
    }

    /// <summary>Persists edits to an existing plan (metadata, notes, setup references, etc.).</summary>
    public void UpdatePlan(SessionPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);
        lock (this._gate)
        {
            int index = this._plans.FindIndex(existing => existing.Id == plan.Id);
            if (index < 0)
            {
                throw new InvalidOperationException($"No session plan with id '{plan.Id}' exists.");
            }

            this._plans[index] = plan;
            this._store.Save(plan);
        }
    }

    /// <summary>
    /// Moves plans filed under a car's former name to its current one (<see cref="StoredCarNames.FormerNames"/>),
    /// so they keep matching the history they plan against. Returns how many plans it rewrote.
    /// </summary>
    public int RenameCars(IReadOnlyDictionary<string, string> currentNames)
    {
        ArgumentNullException.ThrowIfNull(currentNames);
        int renamed = 0;
        lock (this._gate)
        {
            foreach (SessionPlan plan in this._plans)
            {
                if (currentNames.TryGetValue(plan.Car, out string? current) && !string.Equals(current, plan.Car, StringComparison.Ordinal))
                {
                    plan.Car = current;
                    this._store.Save(plan);
                    renamed++;
                }
            }
        }

        return renamed;
    }

    /// <summary>Deletes a plan. If it held the active slot, the slot is cleared.</summary>
    public void DeletePlan(string planId)
    {
        lock (this._gate)
        {
            int index = this._plans.FindIndex(plan => plan.Id == planId);
            if (index < 0)
            {
                return;
            }

            this._plans.RemoveAt(index);
            this._store.Delete(planId);
            if (this._activePlanId == planId)
            {
                this.ClearActiveSlot();
            }
        }
    }

    /// <summary>
    /// Claims the single active slot for <paramref name="planId"/> and marks it armed,
    /// waiting for a manual or telemetry-driven start. Throws if a different plan already
    /// holds the slot.
    /// </summary>
    public void Arm(string planId)
    {
        lock (this._gate)
        {
            SessionPlan plan = this.Require(planId);
            this.ClaimActiveSlot(plan);
            plan.Status = PlanStatus.Armed;
            this._store.Save(plan);
            this._log.Info($"Armed session plan '{plan.Id}'");
        }
    }

    /// <summary>
    /// Backs out of an arm: releases the active slot and returns the plan to
    /// <see cref="PlanStatus.Draft"/>. Draft rather than Abandoned, because nothing was
    /// recorded — a mis-click must not permanently retire an untouched plan, and history
    /// must not list sessions that never happened. A no-op unless the plan is armed.
    /// </summary>
    public void Disarm(string planId)
    {
        lock (this._gate)
        {
            SessionPlan plan = this.Require(planId);
            if (plan.Status != PlanStatus.Armed)
            {
                return;
            }

            plan.Status = PlanStatus.Draft;
            this._store.Save(plan);
            if (this._activePlanId == plan.Id)
            {
                this.ClearActiveSlot();
            }

            this._log.Info($"Disarmed session plan '{plan.Id}'");
        }
    }

    /// <summary>
    /// Frees the single active slot whatever state holds it — disarming an armed plan,
    /// stopping a tracking one. Used by the UI's explicit takeover, so activating a
    /// different plan never has to trigger the double-claim exception.
    /// </summary>
    public void ReleaseActiveSlot()
    {
        lock (this._gate)
        {
            SessionPlan? plan = this.ActivePlan;
            if (plan is null)
            {
                return;
            }

            if (plan.Status == PlanStatus.Armed)
            {
                this.Disarm(plan.Id);
                return;
            }

            this.StopTracking(plan.Id);
        }
    }

    /// <summary>
    /// Starts tracking a <paramref name="kind"/> segment for the plan, opening a segment
    /// and claiming the active slot. Enforces exactly one actively tracked plan. Reuses an
    /// already-open segment of the same kind rather than opening a duplicate.
    /// </summary>
    public PlanSegment StartTracking(string planId, SegmentKind kind, SegmentSource source = SegmentSource.Manual)
    {
        lock (this._gate)
        {
            SessionPlan plan = this.Require(planId);
            this.ClaimActiveSlot(plan);

            DateTimeOffset now = this._clock();
            plan.StartedAt ??= now;
            plan.Status = PlanStatus.Tracking;

            PlanSegment segment = OpenSegment(plan)
                ?? this.AppendSegment(plan, kind, source, now);

            // If a different-kind segment was open (e.g. moving Q -> R), close it first.
            if (segment.Kind != kind)
            {
                segment.ActualEnd = now;
                segment = this.AppendSegment(plan, kind, source, now);
            }

            this._lastSeenLap = 0;
            this._lastSeenLapIsValid = true;
            this._store.Save(plan);
            this._log.Info($"Started tracking {kind} for session plan '{plan.Id}'");
            return segment;
        }
    }

    /// <summary>
    /// Stops tracking: closes the open segment, completes the plan, and releases the active
    /// slot. Always available while a plan is active.
    /// </summary>
    public void StopTracking(string planId)
    {
        lock (this._gate)
        {
            SessionPlan plan = this.Require(planId);
            DateTimeOffset now = this._clock();

            PlanSegment? segment = OpenSegment(plan);
            if (segment is not null)
            {
                segment.ActualEnd = now;
            }

            plan.Status = PlanStatus.Completed;
            plan.EndedAt = now;
            this._store.Save(plan);

            if (this._activePlanId == plan.Id)
            {
                this.ClearActiveSlot();
            }

            this._log.Info($"Stopped tracking session plan '{plan.Id}'");
        }
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
        lock (this._gate)
        {
            SessionPlan? plan = this.ActivePlan;
            if (plan is null)
            {
                return;
            }

            // An armed plan is waiting for the sim to reach its segment. Auto-start opens the
            // segment; the frame after this one begins ingesting into it.
            if (plan.Status == PlanStatus.Armed)
            {
                this.TryAutoStart(plan, frame);
                return;
            }

            if (plan.Status != PlanStatus.Tracking)
            {
                return;
            }

            PlanSegment? segment = OpenSegment(plan);
            if (segment is null)
            {
                return;
            }

            // Qualifying is over once the game holds the race: follow it, as arming did.
            if (segment.Kind == SegmentKind.Qualifying && this.TryAutoStart(plan, frame, segment.Kind))
            {
                return;
            }

            bool dirty = this.RecordLiveContext(segment, frame);
            dirty |= this.RecordCompletedLap(segment, frame);
            dirty |= this.DetectRaceFormatMismatch(plan, segment, frame);

            if (dirty)
            {
                this._store.Save(plan);
            }
        }
    }

    // #102 owns the full online-detection ruleset. This is the minimum #100 needs: the
    // reported session type must hold continuously for AutoStartHoldSeconds before a
    // segment opens, so one spurious frame cannot start a session. Confidence stays
    // Medium — High is reserved for #102's corroborated detection. With a segment
    // already open (`current`), only a later session counts: qualifying moves on to the
    // race, never back.
    private bool TryAutoStart(SessionPlan plan, TelemetryFrame frame, SegmentKind? current = null)
    {
        SessionType reported = frame.Session.SessionType;
        SegmentKind? kind = reported switch
        {
            SessionType.Qualify when plan.QualifyingIncluded && current is null => SegmentKind.Qualifying,
            SessionType.Race when current != SegmentKind.Race => SegmentKind.Race,
            _ => (SegmentKind?)null,
        };

        if (kind is null)
        {
            this._autoStartCandidate = SessionType.Unknown;
            this._autoStartSince = null;
            return false;
        }

        DateTimeOffset now = this._clock();
        if (this._autoStartCandidate != reported || this._autoStartSince is null)
        {
            this._autoStartCandidate = reported;
            this._autoStartSince = now;
            return false;
        }

        if ((now - this._autoStartSince.Value).TotalSeconds < AutoStartHoldSeconds)
        {
            return false;
        }

        PlanSegment segment = this.StartTracking(plan.Id, kind.Value, SegmentSource.Detected);
        segment.SourceConfidence = DetectionConfidence.Medium;
        this._autoStartCandidate = SessionType.Unknown;
        this._autoStartSince = null;
        this._store.Save(plan);
        this._log.Info($"Auto-started {kind.Value} for session plan '{plan.Id}' from detected {reported}");
        return true;
    }

    private bool RecordLiveContext(PlanSegment segment, TelemetryFrame frame)
    {
        string sessionType = frame.Session.SessionType.ToString();
        if (segment.LiveSessionType == sessionType)
        {
            return false;
        }

        segment.LiveSessionType = sessionType;
        return true;
    }

    private bool RecordCompletedLap(PlanSegment segment, TelemetryFrame frame)
    {
        int currentLap = frame.Lap.CurrentLap;
        if (this._lastSeenLap == 0)
        {
            this._lastSeenLap = currentLap;
            this._lastSeenLapIsValid = frame.Lap.IsValid;
            return false;
        }

        // A lap crossing: the just-finished lap is the one we were on. Only record it
        // when telemetry gives a completed lap time, so we never log a phantom lap 0.
        if (currentLap <= this._lastSeenLap || frame.Lap.LastLapTime <= 0)
        {
            this._lastSeenLap = Math.Max(this._lastSeenLap, currentLap);
            this._lastSeenLapIsValid = frame.Lap.IsValid;
            return false;
        }

        segment.Laps.Add(new LapSummary
        {
            LapNumber = this._lastSeenLap,
            IsValid = this._lastSeenLapIsValid,
            LapTimeSeconds = frame.Lap.LastLapTime,
            FuelRemainingLiters = frame.Car.FuelLiters,
        });

        this._lastSeenLap = currentLap;
        this._lastSeenLapIsValid = frame.Lap.IsValid;
        return true;
    }

    /// <summary>
    /// Records the race format the game reports on the race segment — the plan page shows it
    /// whatever the plan says — and warns once when it disagrees with the plan, unless the driver
    /// turned that warning off.
    /// </summary>
    private bool DetectRaceFormatMismatch(SessionPlan plan, PlanSegment segment, TelemetryFrame frame)
    {
        if (segment.Kind != SegmentKind.Race)
        {
            return false;
        }

        RaceLengthFormat detected = frame.Session.MaxLaps > 0 ? RaceLengthFormat.LapBased : RaceLengthFormat.TimeBased;
        bool changed = segment.DetectedRaceFormat != detected;
        segment.DetectedRaceFormat = detected;

        if (plan.RaceLengthFormat == RaceLengthFormat.Unknown
            || detected == plan.RaceLengthFormat
            || !this._warnOnRaceFormatMismatch())
        {
            return changed;
        }

        bool alreadyWarned = plan.Warnings.Any(warning => warning.Kind == RaceFormatMismatchWarning);
        if (alreadyWarned)
        {
            return changed;
        }

        plan.Warnings.Add(new PlanWarning
        {
            Kind = RaceFormatMismatchWarning,
            Message = $"Live telemetry reports a {detected} race, but the plan is {plan.RaceLengthFormat}.",
            CreatedAt = this._clock(),
        });
        this._log.Warn($"Race format mismatch on plan '{plan.Id}': planned {plan.RaceLengthFormat}, detected {detected}");
        return true;
    }

    private static PlanSegment? OpenSegment(SessionPlan plan) =>
        plan.Segments.FirstOrDefault(segment => segment.ActualStart is not null && segment.ActualEnd is null);

    private PlanSegment AppendSegment(SessionPlan plan, SegmentKind kind, SegmentSource source, DateTimeOffset start)
    {
        PlanSegment segment = new PlanSegment
        {
            Id = this._idFactory(),
            Kind = kind,
            Source = source,
            ActualStart = start,
        };
        plan.Segments.Add(segment);
        return segment;
    }

    private SessionPlan Require(string planId) =>
        this.Find(planId) ?? throw new InvalidOperationException($"No session plan with id '{planId}' exists.");

    private void ClaimActiveSlot(SessionPlan plan)
    {
        if (this._activePlanId is not null && this._activePlanId != plan.Id)
        {
            throw new InvalidOperationException(
                $"Session plan '{this._activePlanId}' is already active; only one plan can be active at a time.");
        }

        if (this._activePlanId != plan.Id)
        {
            this._activePlanId = plan.Id;
            this._store.SaveActivePlanId(plan.Id);
        }
    }

    private void ClearActiveSlot()
    {
        this._activePlanId = null;
        this._lastSeenLap = 0;
        this._lastSeenLapIsValid = true;
        this._autoStartCandidate = SessionType.Unknown;
        this._autoStartSince = null;
        this._store.SaveActivePlanId(null);
    }

    // On startup, drop a dangling active pointer (deleted plan) and demote a plan left
    // "tracking" by a crash to Abandoned so the single active slot is never wedged.
    private void ReconcileActiveSlot()
    {
        if (this._activePlanId is null)
        {
            return;
        }

        SessionPlan? active = this._plans.FirstOrDefault(plan => plan.Id == this._activePlanId);
        if (active is null)
        {
            this.ClearActiveSlot();
            return;
        }

        if (active.Status == PlanStatus.Tracking)
        {
            active.Status = PlanStatus.Abandoned;
            active.EndedAt ??= this._clock();
            foreach (PlanSegment? open in active.Segments.Where(segment => segment.ActualStart is not null && segment.ActualEnd is null))
            {
                open.ActualEnd = active.EndedAt;
            }

            this._store.Save(active);
            this._log.Warn($"Session plan '{active.Id}' was left tracking; marked Abandoned on startup.");
            this.ClearActiveSlot();
        }
    }
}
