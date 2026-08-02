using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for trace retention (#194). Traces are written for every valid
/// lap, so the corpus is bounded by a disk budget rather than by refusing to record. What the
/// budget must never delete is a reference lap.
/// </summary>
public sealed class LapTraceRetentionTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 2, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void NothingIsPrunedWhileTheCorpusIsInsideItsBudget()
    {
        var (traces, history) = Corpus(lapCount: 5);

        var result = Retention(traces, history).Prune(Budget(maxTotalBytes: 10_000), Now);

        Assert.Equal(0, result.Deleted);
        Assert.Equal(5, traces.All.Count);
    }

    [Fact]
    public void TheOldestUnprotectedTracesGoUntilTheBudgetIsMet()
    {
        // Five traces of 100 bytes; a 250-byte budget leaves room for two.
        var (traces, history) = Corpus(lapCount: 5);

        var result = Retention(traces, history)
            .Prune(Budget(maxTotalBytes: 250, protectedPerContext: 1), Now);

        // Through the interface: TotalBytes is a default interface member, so the fake's own
        // type does not expose it.
        Assert.True(((ILapTraceStore)traces).TotalBytes() <= 250);
        Assert.True(result.Deleted > 0);
        Assert.Equal(result.Deleted * 100, result.BytesFreed);
    }

    [Fact]
    public void TheBestLapsPerContextAreNeverPruned()
    {
        // Lap 1 is both the fastest and the oldest, so oldest-first must not reach it.
        var (traces, history) = Corpus(lapCount: 5);

        Retention(traces, history).Prune(Budget(maxTotalBytes: 100, protectedPerContext: 1), Now);

        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-1", 1)));
    }

    [Fact]
    public void ProtectionIsPerContextSoASecondTrackKeepsItsOwnBest()
    {
        var traces = new FakeTraceStore();
        var history = new FakeHistoryStore();
        history.Saved.Add(Session("hs-spa", "Spa-Francorchamps", traces, lapCount: 3));
        history.Saved.Add(Session("hs-lm", "Le Mans", traces, lapCount: 3));

        Retention(traces, history).Prune(Budget(maxTotalBytes: 200, protectedPerContext: 1), Now);

        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-spa", 1)));
        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-lm", 1)));
    }

    [Fact]
    public void AnInvalidLapIsNeverWhatProtectionSpendsItselfOn()
    {
        var traces = new FakeTraceStore();
        var history = new FakeHistoryStore();
        var session = Session("hs-1", "Spa-Francorchamps", traces, lapCount: 3);
        // The fastest of the three is invalid — a lap set by cutting a corner is not a
        // reference lap, and it must not occupy the one protection slot.
        session.Laps[0].IsValid = false;
        history.Saved.Add(session);

        Retention(traces, history).Prune(Budget(maxTotalBytes: 100, protectedPerContext: 1), Now);

        Assert.False(traces.All.ContainsKey(LapTraceId.For("hs-1", 1)));
        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-1", 2)));
    }

    [Fact]
    public void PruningALapClearsItsPointerSoTheStoredTierNeverLies()
    {
        var (traces, history) = Corpus(lapCount: 5);

        Retention(traces, history).Prune(Budget(maxTotalBytes: 100, protectedPerContext: 1), Now);

        foreach (var lap in history.Saved.SelectMany(session => session.Laps))
        {
            Assert.Equal(
                lap.HasChannelTrace,
                lap.TraceId is not null && traces.All.ContainsKey(lap.TraceId));
        }
    }

    [Fact]
    public void APrunedLapDegradesToTheReferenceCurveTierRatherThanVanishing()
    {
        var (traces, history) = Corpus(lapCount: 5);

        Retention(traces, history).Prune(Budget(maxTotalBytes: 100, protectedPerContext: 1), Now);

        var pruned = history.Saved
            .SelectMany(session => session.Laps)
            .Where(lap => !lap.HasChannelTrace)
            .ToList();

        Assert.NotEmpty(pruned);
        Assert.All(pruned, lap => Assert.True(lap.HasReferenceCurve));
    }

    [Fact]
    public void OrphanTracesAreDeletedBeforeAnyLapLosesItsOwn()
    {
        var (traces, history) = Corpus(lapCount: 2);
        // No lap points at this one, so no reader can ever reach it: pure cost.
        traces.All["hs-gone-9"] = 100;

        Retention(traces, history).Prune(Budget(maxTotalBytes: 200, protectedPerContext: 1), Now);

        Assert.False(traces.All.ContainsKey("hs-gone-9"));
        Assert.Equal(2, traces.All.Count);
    }

    [Fact]
    public void TracesPastTheAgeLimitGoEvenWhenTheBudgetHasRoom()
    {
        var (traces, history) = Corpus(lapCount: 5, sessionStartedAt: Now.AddDays(-200));

        Retention(traces, history)
            .Prune(Budget(maxTotalBytes: long.MaxValue, protectedPerContext: 1, maxAgeDays: 90), Now);

        // Protection outranks age: the reference lap survives even at 200 days old.
        Assert.Single(traces.All);
        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-1", 1)));
    }

    [Fact]
    public void AnEmptyCorpusPrunesToNothingWithoutFailing()
    {
        var result = Retention(new FakeTraceStore(), new FakeHistoryStore()).Prune(Budget(), Now);

        Assert.Equal(0, result.Deleted);
        Assert.Equal(0, result.BytesFreed);
    }

    [Fact]
    public void OnlySessionsThatActuallyLostATraceAreRewritten()
    {
        // Pruning rewrites history documents to clear pointers; rewriting one that lost
        // nothing would be disk churn on every start.
        var traces = new FakeTraceStore();
        var history = new FakeHistoryStore();
        history.Saved.Add(Session("hs-1", "Spa-Francorchamps", traces, lapCount: 4));
        history.Saved.Add(Session("hs-2", "Le Mans", traces, lapCount: 1));

        Retention(traces, history).Prune(Budget(maxTotalBytes: 200, protectedPerContext: 1), Now);

        // hs-2's single lap is its context's best, so it is protected and untouched.
        Assert.DoesNotContain("hs-2", history.Rewritten);
        Assert.Contains("hs-1", history.Rewritten);
    }

    private static LapTraceRetention Retention(ILapTraceStore traces, ILapHistoryStore history) =>
        new(traces, history);

    private static LapTraceBudget Budget(
        long maxTotalBytes = long.MaxValue,
        int protectedPerContext = 3,
        int? maxAgeDays = null) => new(maxTotalBytes, protectedPerContext, maxAgeDays);

    private static (FakeTraceStore Traces, FakeHistoryStore History) Corpus(
        int lapCount,
        DateTimeOffset? sessionStartedAt = null)
    {
        var traces = new FakeTraceStore();
        var history = new FakeHistoryStore();
        history.Saved.Add(Session("hs-1", "Spa-Francorchamps", traces, lapCount, sessionStartedAt));
        return (traces, history);
    }

    /// <summary>
    /// One session of <paramref name="lapCount"/> laps, each with a 100-byte trace and a
    /// reference curve. Lap 1 is the fastest and lap N the slowest, so "oldest" and "best"
    /// point at the same lap and protection has to win against oldest-first.
    /// </summary>
    private static LapHistorySession Session(
        string id,
        string track,
        FakeTraceStore traces,
        int lapCount,
        DateTimeOffset? startedAt = null)
    {
        var session = new LapHistorySession
        {
            Id = id,
            StartedAt = startedAt ?? Now.AddHours(-1),
            Context = new LapHistoryContext
            {
                Game = "Le Mans Ultimate",
                TrackCourse = track,
                CarModel = "Porsche 963",
            },
        };

        for (var lap = 1; lap <= lapCount; lap++)
        {
            var traceId = LapTraceId.For(id, lap);
            traces.All[traceId] = 100;
            session.Laps.Add(new LapHistoryRecord
            {
                LapNumber = lap,
                IsValid = true,
                LapTimeSeconds = 100 + lap,
                TraceId = traceId,
                ReferenceCurve = new LapReferenceCurve { PositionStep = 0.5, TimesSeconds = [0, 50, 100] },
            });
        }

        return session;
    }

    private sealed class FakeTraceStore : ILapTraceStore
    {
        public Dictionary<string, long> All { get; } = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => All[traceId] = 100;

        public LapChannelTrace? Load(string traceId) => null;

        public void Delete(string traceId) => All.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() =>
            [.. All.Select(pair => new LapTraceInfo(pair.Key, pair.Value, Now.AddHours(-1)))];
    }

    private sealed class FakeHistoryStore : ILapHistoryStore
    {
        public List<LapHistorySession> Saved { get; } = [];

        /// <summary>Ids of sessions written back, so churn is observable.</summary>
        public List<string> Rewritten { get; } = [];

        public IReadOnlyList<LapHistorySession> LoadAll() => Saved;

        public void Save(LapHistorySession session)
        {
            Rewritten.Add(session.Id);
            Saved.RemoveAll(existing => existing.Id == session.Id);
            Saved.Add(session);
        }

        public void Delete(string sessionId) => Saved.RemoveAll(session => session.Id == sessionId);
    }
}
