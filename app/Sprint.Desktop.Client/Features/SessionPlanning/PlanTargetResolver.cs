using System.Globalization;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// A corpus with nothing in it, for callers that were not given a real one. Target selection
/// then offers no preset at all rather than a zero, and the driver sets the value directly.
/// </summary>
public sealed class EmptyLapHistoryStore : ILapHistoryStore
{
    public static EmptyLapHistoryStore Instance { get; } = new();

    public IReadOnlyList<LapHistorySession> LoadAll() => [];

    public void Save(LapHistorySession session) =>
        throw new NotSupportedException("There is no corpus to save into.");

    public void Delete(string sessionId) =>
        throw new NotSupportedException("There is no corpus to delete from.");
}

/// <summary>
/// One selectable (scope, statistic) pair, already resolved against the corpus: the real lap
/// it points at, the sample size it was drawn from, and the label the UI shows.
/// </summary>
public sealed record PlanTargetOption(
    PlanTargetScope Scope,
    string? ProgramType,
    PlanTargetStatistic Statistic,
    string Label,
    string TimeText,
    string Detail,
    double LapTimeSeconds,
    int SampleSize,
    string LapSessionId,
    int LapNumber,
    bool HasReferenceCurve,
    DateTimeOffset? LapSessionStartedAt)
{
    /// <summary>
    /// Which tier this option delivers, in the driver's words. A recorded lap with a trace can
    /// drive a position-accurate delta; anything else is a single number, and presenting a
    /// pro-rata delta from one as if it were measured would be a lie on a driver's screen.
    /// <para>
    /// Read off the lap's own curve rather than its session's origin: a recorded lap whose
    /// trace failed the completeness guards has no curve either.
    /// </para>
    /// </summary>
    public string TierNote => HasReferenceCurve ? "reference curve" : "time only";

    /// <summary>The stored form of this choice, for <paramref name="now"/>'s write.</summary>
    public PlanTarget ToTarget(DateTimeOffset now) => new()
    {
        Scope = Scope,
        Statistic = Statistic,
        ProgramType = ProgramType,
        LapTimeSeconds = LapTimeSeconds,
        SampleSize = SampleSize,
        LapSessionId = LapSessionId,
        LapNumber = LapNumber,
        LapSessionStartedAt = LapSessionStartedAt,
        HasReferenceCurve = HasReferenceCurve,
        UpdatedAt = now,
    };
}

/// <summary>
/// One scope and everything selectable inside it: the three statistics, plus every lap
/// ordered fastest to slowest for a <see cref="PlanTargetStatistic.Custom"/> pick.
/// </summary>
public sealed record PlanTargetScopeGroup(
    PlanTargetScope Scope,
    string? ProgramType,
    string Label,
    int SampleSize,
    IReadOnlyList<PlanTargetOption> Options,
    IReadOnlyList<PlanTargetOption> Laps)
{
    public PlanTargetOption? Option(PlanTargetStatistic statistic) =>
        Options.FirstOrDefault(option => option.Statistic == statistic);
}

/// <summary>
/// What the selector can offer for one plan. Empty means the corpus holds nothing for this
/// context, and the driver sets the value directly instead — the planner never dead-ends on
/// missing history, and it never offers a zero dressed up as a target.
/// </summary>
public sealed record PlanTargetChoices(IReadOnlyList<PlanTargetScopeGroup> Scopes)
{
    public static PlanTargetChoices None { get; } = new([]);

    /// <summary>Shown in place of the scope list when there is no history to pick from.</summary>
    public const string NoHistoryMessage =
        "No laps recorded for this car and track yet. Drive or import a session to unlock targets.";

    public bool IsEmpty => Scopes.Count == 0;

    public PlanTargetScopeGroup? Scope(PlanTargetScope scope, string? programType = null) =>
        Scopes.FirstOrDefault(group =>
            group.Scope == scope
            && string.Equals(group.ProgramType, programType, StringComparison.Ordinal));
}

/// <summary>
/// Turns the lap-history corpus into the target selector's choices (#186). Avalonia-free so
/// every rule is a unit test; <see cref="SessionPlannerView"/> only renders what this returns.
/// <para>
/// Scope filtering happens here and the statistics themselves stay in
/// <see cref="LapHistoryStatistics"/>: each scope is handed to it as a narrowed view of the
/// corpus, so "median of a real driven lap" is defined in exactly one place.
/// </para>
/// </summary>
public static class PlanTargetResolver
{
    /// <summary>
    /// Every scope with laps behind it, in display order. A scope the corpus cannot fill is
    /// omitted rather than shown empty.
    /// </summary>
    public static PlanTargetChoices Choices(
        ILapHistoryStore store,
        LapHistoryContext context,
        PlanMode mode)
    {
        ArgumentNullException.ThrowIfNull(store);
        ArgumentNullException.ThrowIfNull(context);

        // No track or car means no bucket to look in. Matching on the empty key instead would
        // aim the plan at whatever laps happen to have been recorded without a context.
        if (string.IsNullOrWhiteSpace(context.TrackCourse) || string.IsNullOrWhiteSpace(context.CarModel))
        {
            return PlanTargetChoices.None;
        }

        var sessions = store.LoadAll()
            .Where(session => SameContext(session.Context, context))
            .ToList();

        var practice = OfKind(sessions, HistorySessionKind.Practice);
        var groups = new List<PlanTargetScopeGroup>();
        Add(groups, CurrentQualifying(sessions), context, PlanTargetScope.CurrentQualifying);
        Add(groups, OfKind(sessions, HistorySessionKind.Qualifying), context, PlanTargetScope.Qualifying);
        Add(groups, practice, context, PlanTargetScope.Practice);

        // Quick mode is the minute before joining a server: it asks only for what it cannot
        // work out, so the deliberate per-program choice stays out of it.
        if (mode != PlanMode.Quick)
        {
            AddPrograms(groups, practice, context);
        }

        return new PlanTargetChoices(groups);
    }

    // Whatever program types the corpus holds, in a stable order — never a fixed menu, since
    // an offered program with no laps behind it is an offer of nothing. Practice sessions
    // only: a program is a practice exercise, and a stray tag on a race lap belongs to the
    // race, not to a program the driver could aim at.
    private static void AddPrograms(
        List<PlanTargetScopeGroup> groups,
        IReadOnlyList<LapHistorySession> practice,
        LapHistoryContext context)
    {
        var programTypes = practice
            .SelectMany(session => session.Laps)
            .Select(lap => lap.ProgramType)
            .Where(programType => !string.IsNullOrWhiteSpace(programType))
            .Select(programType => programType!)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(programType => programType, StringComparer.Ordinal);

        foreach (var programType in programTypes)
        {
            Add(groups, OfProgram(practice, programType), context, PlanTargetScope.PracticeProgram, programType);
        }
    }

    // Program tags sit on the lap, not the session, so a program scope is each session
    // narrowed to its tagged laps. The narrowed sessions keep their identity and origin, which
    // is what the resolved target records.
    private static List<LapHistorySession> OfProgram(
        IReadOnlyList<LapHistorySession> sessions,
        string programType)
    {
        var narrowed = new List<LapHistorySession>();
        foreach (var session in sessions)
        {
            var laps = session.Laps
                .Where(lap => string.Equals(lap.ProgramType, programType, StringComparison.Ordinal))
                .ToList();
            if (laps.Count == 0)
            {
                continue;
            }

            narrowed.Add(new LapHistorySession
            {
                Id = session.Id,
                Context = session.Context,
                Kind = session.Kind,
                Origin = session.Origin,
                StartedAt = session.StartedAt,
                EndedAt = session.EndedAt,
                Conditions = session.Conditions,
                SetupReference = session.SetupReference,
                Laps = laps,
            });
        }

        return narrowed;
    }

    private static void Add(
        List<PlanTargetScopeGroup> groups,
        IReadOnlyList<LapHistorySession> sessions,
        LapHistoryContext context,
        PlanTargetScope scope,
        string? programType = null)
    {
        if (sessions.Count == 0)
        {
            return;
        }

        var statistics = LapHistoryStatistics.Resolve(new ScopedLapHistoryStore(sessions), context);
        if (statistics is null)
        {
            return;
        }

        var label = ScopeLabel(scope, programType, sessions);
        var options = new List<PlanTargetOption>
        {
            Option(scope, programType, PlanTargetStatistic.Fastest, statistics.Fastest, statistics.SampleSize),
            Option(scope, programType, PlanTargetStatistic.Median, statistics.Median, statistics.SampleSize),
            Option(scope, programType, PlanTargetStatistic.Slowest, statistics.Slowest, statistics.SampleSize),
        };

        // Already ordered fastest to slowest by #184, which is the order the driver picks from.
        var laps = statistics.Candidates
            .Select((candidate, index) => CustomOption(
                scope,
                programType,
                candidate,
                position: index + 1,
                statistics.SampleSize))
            .ToList();

        groups.Add(new PlanTargetScopeGroup(scope, programType, label, statistics.SampleSize, options, laps));
    }

    private static PlanTargetOption CustomOption(
        PlanTargetScope scope,
        string? programType,
        LapHistoryStatistic candidate,
        int position,
        int sampleSize)
    {
        var timeText = FormatLapTime(candidate.Lap.LapTimeSeconds);
        return new PlanTargetOption(
            scope,
            programType,
            PlanTargetStatistic.Custom,
            $"Lap {candidate.Lap.LapNumber}",
            timeText,
            // The position in the ordered list rather than a statistic word: this is one
            // chosen lap, and it still says how large the corpus behind it is.
            $"{timeText} · #{position} of {sampleSize} {(sampleSize == 1 ? "lap" : "laps")}",
            candidate.Lap.LapTimeSeconds,
            sampleSize,
            candidate.Session.Id,
            candidate.Lap.LapNumber,
            candidate.Lap.HasReferenceCurve,
            candidate.Session.StartedAt);
    }

    private static PlanTargetOption Option(
        PlanTargetScope scope,
        string? programType,
        PlanTargetStatistic statistic,
        LapHistoryStatistic resolved,
        int sampleSize)
    {
        var timeText = FormatLapTime(resolved.Lap.LapTimeSeconds);
        return new PlanTargetOption(
            scope,
            programType,
            statistic,
            StatisticLabel(statistic),
            timeText,
            $"{timeText} · {StatisticWord(statistic)} of {sampleSize} {(sampleSize == 1 ? "lap" : "laps")}",
            resolved.Lap.LapTimeSeconds,
            sampleSize,
            resolved.Session.Id,
            resolved.Lap.LapNumber,
            resolved.Lap.HasReferenceCurve,
            resolved.Session.StartedAt);
    }

    // The most recent qualifying session, by when it started. Ties break on id so the choice
    // is stable across reloads rather than depending on the store's file order.
    private static IReadOnlyList<LapHistorySession> CurrentQualifying(IReadOnlyList<LapHistorySession> sessions)
    {
        var current = OfKind(sessions, HistorySessionKind.Qualifying)
            .OrderByDescending(session => session.StartedAt)
            .ThenByDescending(session => session.Id, StringComparer.Ordinal)
            .FirstOrDefault();
        return current is null ? [] : [current];
    }

    private static List<LapHistorySession> OfKind(
        IReadOnlyList<LapHistorySession> sessions,
        HistorySessionKind kind) =>
        sessions.Where(session => session.Kind == kind).ToList();

    private static string ScopeLabel(
        PlanTargetScope scope,
        string? programType,
        IReadOnlyList<LapHistorySession> sessions) => scope switch
    {
        // The timestamp is part of the label, not a tooltip: "should be the one right before
        // the race" is only verifiable if the driver can see which session it is.
        PlanTargetScope.CurrentQualifying => $"Current Quali · {FormatSessionTime(sessions[0].StartedAt)}",
        PlanTargetScope.Qualifying => "Quali",
        PlanTargetScope.Practice => "Practice",
        PlanTargetScope.PracticeProgram => $"Practice program · {programType}",
        _ => "Manual",
    };

    private static string StatisticLabel(PlanTargetStatistic statistic) => statistic switch
    {
        PlanTargetStatistic.Fastest => "Fastest",
        PlanTargetStatistic.Median => "Median",
        PlanTargetStatistic.Slowest => "Slowest",
        _ => "Custom",
    };

    private static string StatisticWord(PlanTargetStatistic statistic) => statistic switch
    {
        PlanTargetStatistic.Fastest => "fastest",
        PlanTargetStatistic.Median => "median",
        PlanTargetStatistic.Slowest => "slowest",
        _ => "picked",
    };

    // Shown in the value's own offset and with the invariant culture: this string exists so a
    // driver can match it against the session they just drove, so it must not shift with the
    // machine's timezone or locale between the record and the label.
    private static string FormatSessionTime(DateTimeOffset startedAt) =>
        startedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);

    /// <summary>
    /// One line describing what a stored target actually is: its time, where it came from, the
    /// sample size behind it, and which tier it can deliver. Built here rather than in the view
    /// so the honesty rules are unit-tested instead of assembled in a renderer.
    /// </summary>
    public static string Describe(PlanTarget target)
    {
        ArgumentNullException.ThrowIfNull(target);

        var parts = new List<string> { FormatLapTime(target.LapTimeSeconds) };
        if (target.Scope == PlanTargetScope.Manual)
        {
            // No lap, no sample, no curve — saying so is the whole point of the manual path.
            parts.Add("set by hand");
            return string.Join(" · ", parts);
        }

        parts.Add(target.Scope switch
        {
            PlanTargetScope.CurrentQualifying when target.LapSessionStartedAt is { } startedAt =>
                $"Current Quali · {FormatSessionTime(startedAt)}",
            PlanTargetScope.CurrentQualifying => "Current Quali",
            PlanTargetScope.Qualifying => "Quali",
            PlanTargetScope.PracticeProgram => $"Practice program · {target.ProgramType}",
            _ => "Practice",
        });

        var laps = $"{target.SampleSize} {(target.SampleSize == 1 ? "lap" : "laps")}";
        parts.Add(target.Statistic switch
        {
            PlanTargetStatistic.Custom => $"lap {target.LapNumber} of {laps}",
            { } statistic => $"{StatisticWord(statistic)} of {laps}",
            null => laps,
        });
        parts.Add(target.HasReferenceCurve ? "reference curve" : "time only");
        return string.Join(" · ", parts);
    }

    /// <summary>Lap time as <c>m:ss.f</c> — the resolution a delta is ever shown at.</summary>
    public static string FormatLapTime(double seconds)
    {
        if (seconds <= 0)
        {
            return "—";
        }

        var span = TimeSpan.FromSeconds(seconds);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{(int)span.TotalMinutes}:{span.Seconds:00}.{span.Milliseconds / 100}");
    }

    private static bool SameContext(LapHistoryContext a, LapHistoryContext b) =>
        a.Game == b.Game && a.TrackCourse == b.TrackCourse && a.CarModel == b.CarModel;

    /// <summary>
    /// A read-only view of one scope's sessions, so scope filtering can reuse
    /// <see cref="LapHistoryStatistics"/> instead of restating the corpus and median rules.
    /// </summary>
    private sealed class ScopedLapHistoryStore(IReadOnlyList<LapHistorySession> sessions) : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => sessions;

        public void Save(LapHistorySession session) =>
            throw new NotSupportedException("A scoped corpus view is read-only.");

        public void Delete(string sessionId) =>
            throw new NotSupportedException("A scoped corpus view is read-only.");
    }
}
