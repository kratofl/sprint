namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>One row of Home's recent sessions: what, where, when, and the best valid lap with its sectors.</summary>
public sealed record RecentSession(
    string Id,
    HistorySessionKind Kind,
    string Track,
    string Car,
    DateTimeOffset StartedAt,
    int LapCount,
    double? BestLapSeconds,
    IReadOnlyList<double> BestSectors);

/// <summary>
/// How the newest session's best lap compares with every earlier session on the same game, track
/// and car. A negative gap is faster, so a new personal best; null where there is nothing to
/// compare with.
/// </summary>
public sealed record RecentSessionComparison(double? GapSeconds, IReadOnlyList<double?> SectorGaps);

/// <summary>
/// Home's recent sessions, built from the lap-history corpus on the host so the corpus itself never
/// travels in <c>/api/state</c>: the newest session opened up with its comparison, then the next few.
/// </summary>
public sealed record RecentSessions(RecentSession Last, RecentSessionComparison Comparison, IReadOnlyList<RecentSession> Earlier)
{
    private sealed record ValidLap(double LapTimeSeconds, IReadOnlyList<double> Sectors);

    private sealed record Parsed(RecentSession Session, (string Game, string Track, string Car) Combo, IReadOnlyList<ValidLap> Laps);

    /// <summary>The newest <paramref name="limit"/> sessions, newest first; null with no sessions.</summary>
    public static RecentSessions? From(IEnumerable<LapHistorySession> sessions, int limit = 4)
    {
        List<Parsed> parsed = [.. sessions
            .Where(session => session.Id.Length > 0)
            .Select(Parse)
            .OrderByDescending(entry => entry.Session.StartedAt)];
        if (parsed.Count == 0)
        {
            return null;
        }

        Parsed newest = parsed[0];
        List<ValidLap> earlierLaps = [.. parsed.Skip(1).Where(entry => entry.Combo == newest.Combo).SelectMany(entry => entry.Laps)];
        double? earlierBest = Fastest(earlierLaps.Select(lap => lap.LapTimeSeconds));
        double? best = newest.Session.BestLapSeconds;
        IReadOnlyList<double> bestSectors = newest.Session.BestSectors;

        // Only laps split the same way compare sector by sector.
        List<double?> sectorGaps = [.. bestSectors.Select((time, index) =>
            Fastest(earlierLaps.Where(lap => lap.Sectors.Count == bestSectors.Count).Select(lap => lap.Sectors[index])) is { } previous
                ? time - previous
                : (double?)null)];

        return new RecentSessions(
            newest.Session,
            new RecentSessionComparison(best is { } b && earlierBest is { } e ? b - e : null, sectorGaps),
            [.. parsed.Skip(1).Take(limit - 1).Select(entry => entry.Session)]);
    }

    private static Parsed Parse(LapHistorySession session)
    {
        List<ValidLap> laps = [.. session.Laps
            .Where(lap => lap.IsValid && lap.LapTimeSeconds > 0)
            .Select(lap => new ValidLap(lap.LapTimeSeconds, [.. lap.SectorsSeconds.Where(sector => sector > 0)]))];
        // The first of equally fast laps, as the list shows them.
        ValidLap? best = laps.Count == 0 ? null : laps.MinBy(lap => lap.LapTimeSeconds);
        LapHistoryContext context = session.Context;
        return new Parsed(
            new RecentSession(
                session.Id,
                session.Kind,
                context.TrackCourse,
                context.CarModel,
                session.StartedAt,
                session.Laps.Count,
                best?.LapTimeSeconds,
                best?.Sectors ?? []),
            (context.Game, context.TrackCourse, context.CarModel),
            laps);
    }

    private static double? Fastest(IEnumerable<double> times)
    {
        double? fastest = null;
        foreach (double time in times)
        {
            if (fastest is null || time < fastest)
            {
                fastest = time;
            }
        }

        return fastest;
    }
}
