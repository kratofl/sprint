using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>How much disk the trace tier may occupy, and what it must never delete.</summary>
/// <param name="MaxTotalBytes">Hard ceiling on the trace directory.</param>
/// <param name="ProtectedPerContext">
/// How many of the fastest valid laps per (game, track, car) are exempt. This is what makes
/// "write a trace for every lap" safe: a reference lap gets old, so an unqualified oldest-first
/// policy would delete exactly the laps worth chasing.
/// </param>
/// <param name="MaxAgeDays">Age ceiling, or null for none. Protection outranks it.</param>
public readonly record struct LapTraceBudget(
    long MaxTotalBytes,
    int ProtectedPerContext,
    int? MaxAgeDays);

/// <summary>What a prune actually did, for the log and for anything that reports it.</summary>
public readonly record struct LapTracePruneResult(int Deleted, long BytesFreed);

/// <summary>
/// Bounds the trace tier's disk use (#194). Traces are written for every valid lap because
/// skipping one is unrecoverable, so the corpus is bounded here instead — by deleting the laps
/// least likely to be wanted, never by refusing to record.
/// <para>
/// Deleting a trace also clears the owning lap's pointer. A record that still claimed a trace
/// the store no longer has would make the driver's target list offer a tier it cannot deliver,
/// which is exactly the lie the tier note exists to prevent.
/// </para>
/// </summary>
public sealed class LapTraceRetention
{
    private readonly ILapTraceStore _traces;
    private readonly ILapHistoryStore _history;
    private readonly ILog _log;

    public LapTraceRetention(ILapTraceStore traces, ILapHistoryStore history, ILog? log = null)
    {
        this._traces = traces ?? throw new ArgumentNullException(nameof(traces));
        this._history = history ?? throw new ArgumentNullException(nameof(history));
        this._log = log ?? NullLog.Instance;
    }

    /// <summary>Brings the trace directory inside <paramref name="budget"/>.</summary>
    public LapTracePruneResult Prune(LapTraceBudget budget, DateTimeOffset now)
    {
        IReadOnlyList<LapTraceInfo> stored = this._traces.List();
        if (stored.Count == 0)
        {
            return new LapTracePruneResult(0, 0);
        }

        IReadOnlyList<LapHistorySession> sessions = this._history.LoadAll();
        Dictionary<string, TraceOwner> owners = new Dictionary<string, TraceOwner>(StringComparer.Ordinal);
        foreach (LapHistorySession session in sessions)
        {
            foreach (LapHistoryRecord? lap in session.Laps.Where(lap => lap.TraceId is { Length: > 0 }))
            {
                owners[lap.TraceId!] = new TraceOwner(session, lap);
            }
        }

        HashSet<string> protectedIds = ProtectedIds(sessions, budget.ProtectedPerContext);
        DateTimeOffset? cutoff = budget.MaxAgeDays is { } days ? now.AddDays(-days) : (DateTimeOffset?)null;

        // Orphans first: a trace no lap points at is unreachable by every reader, so it is pure
        // cost. Then oldest-first by the session that produced it — file timestamps move when a
        // corpus is copied between machines, but a session's start does not.
        List<LapTraceInfo> candidates = stored
            .Where(info => !protectedIds.Contains(info.TraceId))
            .OrderBy(info => owners.ContainsKey(info.TraceId))
            .ThenBy(info => StartedAt(owners, info))
            .ThenBy(info => owners.TryGetValue(info.TraceId, out TraceOwner owner) ? owner.Lap.LapNumber : 0)
            .ToList();

        long total = stored.Sum(info => info.SizeBytes);
        int deleted = 0;
        long freed = 0L;
        Dictionary<string, LapHistorySession> touched = new Dictionary<string, LapHistorySession>(StringComparer.Ordinal);

        foreach (LapTraceInfo info in candidates)
        {
            bool orphaned = !owners.ContainsKey(info.TraceId);
            bool overBudget = total > budget.MaxTotalBytes;
            bool tooOld = cutoff is { } limit && StartedAt(owners, info) < limit;

            if (!orphaned && !overBudget && !tooOld)
            {
                continue;
            }

            this._traces.Delete(info.TraceId);
            total -= info.SizeBytes;
            freed += info.SizeBytes;
            deleted++;

            if (owners.TryGetValue(info.TraceId, out TraceOwner owner))
            {
                owner.Lap.TraceId = null;
                touched[owner.Session.Id] = owner.Session;
            }
        }

        // Only sessions that actually lost a trace: rewriting the rest would be disk churn on
        // every start, for documents nothing changed in.
        foreach (LapHistorySession session in touched.Values)
        {
            try
            {
                this._history.Save(session);
            }
            catch (Exception ex)
            {
                // A pointer left behind reads as a trace that is missing, which every reader
                // already has to survive. Failing the whole prune would be worse.
                this._log.Warn($"Failed to clear pruned trace pointers on session '{session.Id}'", ex);
            }
        }

        if (deleted > 0)
        {
            this._log.Info($"Pruned {deleted} lap trace(s), freeing {freed / 1024} KB");
        }

        return new LapTracePruneResult(deleted, freed);
    }

    /// <summary>
    /// When the lap behind a trace was driven, falling back to the file's own timestamp for an
    /// orphan — the only thing left to order it by.
    /// </summary>
    private static DateTimeOffset StartedAt(
        IReadOnlyDictionary<string, TraceOwner> owners,
        LapTraceInfo info) =>
        owners.TryGetValue(info.TraceId, out TraceOwner owner) ? owner.Session.StartedAt : info.WrittenAt;

    /// <summary>
    /// The fastest <paramref name="perContext"/> valid laps in each (game, track, car) bucket.
    /// Invalid laps are excluded before ranking: a lap set by cutting the chicane is the last
    /// thing that should occupy a protection slot.
    /// </summary>
    private static HashSet<string> ProtectedIds(
        IReadOnlyList<LapHistorySession> sessions,
        int perContext)
    {
        HashSet<string> ids = new HashSet<string>(StringComparer.Ordinal);
        if (perContext <= 0)
        {
            return ids;
        }

        IEnumerable<IGrouping<(string Game, string TrackCourse, string CarModel), (LapHistoryContext Context, LapHistoryRecord Lap)>> byContext = sessions
            .SelectMany(session => session.Laps.Select(lap => (session.Context, Lap: lap)))
            .Where(entry => entry.Lap.IsValid
                && entry.Lap.LapTimeSeconds > 0
                && entry.Lap.TraceId is { Length: > 0 })
            .GroupBy(entry => (
                entry.Context.Game,
                entry.Context.TrackCourse,
                entry.Context.CarModel));

        foreach (IGrouping<(string Game, string TrackCourse, string CarModel), (LapHistoryContext Context, LapHistoryRecord Lap)> bucket in byContext)
        {
            foreach ((LapHistoryContext Context, LapHistoryRecord Lap) entry in bucket.OrderBy(entry => entry.Lap.LapTimeSeconds).Take(perContext))
            {
                ids.Add(entry.Lap.TraceId!);
            }
        }

        return ids;
    }

    private readonly record struct TraceOwner(LapHistorySession Session, LapHistoryRecord Lap);
}
