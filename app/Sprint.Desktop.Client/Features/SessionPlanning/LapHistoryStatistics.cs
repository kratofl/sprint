namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// One identified real lap picked out of the corpus (fastest, median, slowest, or one entry
/// of the ordered candidate list). Never a synthetic or interpolated time — the record it
/// points to is a lap that was actually driven, so a caller can always trace back to which
/// session it came from and (via <see cref="Session"/>'s <see cref="LapHistorySession.Origin"/>)
/// whether it has a reference curve (<see cref="LapHistoryOrigin.Recorded"/>) or is
/// scalar-only (<see cref="LapHistoryOrigin.Imported"/>).
/// </summary>
public sealed class LapHistoryStatistic
{
    public required LapHistorySession Session { get; init; }

    public required LapHistoryRecord Lap { get; init; }
}

/// <summary>
/// Fastest/median/slowest read off a lap-history corpus for one context, plus the sample
/// size every result must carry (#184) and the full fastest-to-slowest candidate list a
/// "Custom" pick (#186) chooses from.
/// </summary>
public sealed class LapHistoryStatisticsResult
{
    public required int SampleSize { get; init; }

    public required LapHistoryStatistic Fastest { get; init; }

    public required LapHistoryStatistic Median { get; init; }

    public required LapHistoryStatistic Slowest { get; init; }

    /// <summary>Ordered fastest to slowest — the list a "Custom" pick (#186) chooses from.</summary>
    public required IReadOnlyList<LapHistoryStatistic> Candidates { get; init; }
}

/// <summary>
/// Resolves fastest/median/slowest statistics over the lap-history corpus (#179) for a given
/// context. The corpus rule comes from #103: every valid, timed lap for the same context,
/// across every session type — scope filtering (Current Quali / Quali / Practice / program)
/// is #186's job, not this one.
/// </summary>
public static class LapHistoryStatistics
{
    /// <summary>
    /// Resolves the statistics for <paramref name="context"/>, or null when the corpus has no
    /// matching lap — an empty corpus has no statistic, not a zero or a default.
    /// </summary>
    public static LapHistoryStatisticsResult? Resolve(ILapHistoryStore store, LapHistoryContext context)
    {
        var candidates = store.LoadAll()
            .Where(session => SameContext(session.Context, context))
            .SelectMany(session => session.Laps
                // The corpus rule (#103): invalid laps and laps with no recorded time never
                // enter the statistic, whatever session type they came from.
                .Where(lap => lap.IsValid && lap.LapTimeSeconds > 0)
                .Select(lap => new LapHistoryStatistic { Session = session, Lap = lap }))
            .OrderBy(candidate => candidate.Lap.LapTimeSeconds)
            .ToList();

        if (candidates.Count == 0)
        {
            return null;
        }

        // Lower median: never interpolated between two laps, always the lap actually driven
        // at that position, so a delta always has a real per-corner curve behind it.
        var medianIndex = (candidates.Count - 1) / 2;

        return new LapHistoryStatisticsResult
        {
            SampleSize = candidates.Count,
            Fastest = candidates[0],
            Median = candidates[medianIndex],
            Slowest = candidates[^1],
            Candidates = candidates,
        };
    }

    private static bool SameContext(LapHistoryContext a, LapHistoryContext b) =>
        a.Game == b.Game && a.TrackCourse == b.TrackCourse && a.CarModel == b.CarModel;
}
