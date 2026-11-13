using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Trace retention (#194). Traces are written for every lap and kept for good: nothing is
/// deleted for size, and for age only once the driver opts into a limit. What a limit must never
/// delete is a reference lap.
/// </summary>
public sealed class LapTraceRetentionTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 2, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset LongAgo = Now.AddDays(-200);

    [Fact]
    public void WithoutAnAgeLimitEveryTraceStaysHoweverOldOrLargeTheCorpusIs()
    {
        (FakeTraceStore? traces, FakeHistoryStore? history) = Corpus(lapCount: 5, sessionStartedAt: Now.AddYears(-6));
        foreach (string id in traces.All.Keys.ToList())
        {
            traces.All[id] = 50L * 1024 * 1024 * 1024;
        }

        LapTracePruneResult result = Retention(traces, history).Prune(Budget(), Now);

        Assert.Equal(0, result.Deleted);
        Assert.Equal(5, traces.All.Count);
        Assert.Empty(history.Rewritten);
    }

    [Fact]
    public void TracesPastTheAgeLimitGoOnceTheDriverSetsOne()
    {
        (FakeTraceStore? traces, FakeHistoryStore? history) = Corpus(lapCount: 5, sessionStartedAt: LongAgo);

        LapTracePruneResult result = Retention(traces, history)
            .Prune(Budget(protectedPerContext: 1, maxAgeDays: 90), Now);

        // Protection outranks age: the reference lap survives even at 200 days old.
        Assert.Single(traces.All);
        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-1", 1)));
        Assert.Equal(4, result.Deleted);
        Assert.Equal(400, result.BytesFreed);
    }

    [Fact]
    public void ProtectionIsPerContextSoASecondTrackKeepsItsOwnBest()
    {
        FakeTraceStore traces = new FakeTraceStore();
        FakeHistoryStore history = new FakeHistoryStore();
        history.Saved.Add(Session("hs-spa", "Spa-Francorchamps", traces, lapCount: 3, LongAgo));
        history.Saved.Add(Session("hs-lm", "Le Mans", traces, lapCount: 3, LongAgo));

        Retention(traces, history).Prune(Budget(protectedPerContext: 1, maxAgeDays: 90), Now);

        Assert.Equal(
            [LapTraceId.For("hs-lm", 1), LapTraceId.For("hs-spa", 1)],
            traces.All.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void AnInvalidLapIsNeverWhatProtectionSpendsItselfOn()
    {
        FakeTraceStore traces = new FakeTraceStore();
        FakeHistoryStore history = new FakeHistoryStore();
        LapHistorySession session = Session("hs-1", "Spa-Francorchamps", traces, lapCount: 3, LongAgo);
        // The fastest of the three is invalid — a lap set by cutting a corner is not a
        // reference lap, and it must not occupy the one protection slot.
        session.Laps[0].IsValid = false;
        history.Saved.Add(session);

        Retention(traces, history).Prune(Budget(protectedPerContext: 1, maxAgeDays: 90), Now);

        Assert.False(traces.All.ContainsKey(LapTraceId.For("hs-1", 1)));
        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-1", 2)));
    }

    [Fact]
    public void ALapThatLosesItsTraceKeepsItsReferenceCurveAndSaysItHasNoTrace()
    {
        (FakeTraceStore? traces, FakeHistoryStore? history) = Corpus(lapCount: 5, sessionStartedAt: LongAgo);

        Retention(traces, history).Prune(Budget(protectedPerContext: 1, maxAgeDays: 90), Now);

        List<LapHistoryRecord> laps = history.Saved.SelectMany(session => session.Laps).ToList();
        Assert.All(laps, lap => Assert.Equal(
            lap.HasChannelTrace,
            lap.TraceId is not null && traces.All.ContainsKey(lap.TraceId)));
        Assert.Equal(4, laps.Count(lap => !lap.HasChannelTrace));
        Assert.All(laps, lap => Assert.True(lap.HasReferenceCurve));
    }

    [Fact]
    public void ATraceNoLapPointsAtIsDeletedWhateverTheAgeLimit()
    {
        (FakeTraceStore? traces, FakeHistoryStore? history) = Corpus(lapCount: 2);
        // No lap points at this one, so no reader can ever reach it: pure cost.
        traces.All["hs-gone-9"] = 100;

        Retention(traces, history).Prune(Budget(), Now);

        Assert.False(traces.All.ContainsKey("hs-gone-9"));
        Assert.Equal(2, traces.All.Count);
    }

    [Fact]
    public void AnEmptyCorpusPrunesToNothingWithoutFailing()
    {
        LapTracePruneResult result = Retention(new FakeTraceStore(), new FakeHistoryStore()).Prune(Budget(maxAgeDays: 90), Now);

        Assert.Equal(0, result.Deleted);
        Assert.Equal(0, result.BytesFreed);
    }

    [Fact]
    public void OnlySessionsThatActuallyLostATraceAreRewritten()
    {
        // Pruning rewrites history documents to clear pointers; rewriting one that lost
        // nothing would be disk churn on every start.
        FakeTraceStore traces = new FakeTraceStore();
        FakeHistoryStore history = new FakeHistoryStore();
        history.Saved.Add(Session("hs-old", "Spa-Francorchamps", traces, lapCount: 4, LongAgo));
        history.Saved.Add(Session("hs-new", "Spa-Francorchamps", traces, lapCount: 3));

        Retention(traces, history).Prune(Budget(protectedPerContext: 1, maxAgeDays: 90), Now);

        Assert.Equal(["hs-old"], history.Rewritten);
        Assert.Equal(3, traces.All.Keys.Count(id => id.StartsWith("hs-new", StringComparison.Ordinal)));
    }

    private static LapTraceRetention Retention(ILapTraceStore traces, ILapHistoryStore history) =>
        new(traces, history);

    private static LapTraceBudget Budget(
        int protectedPerContext = 3,
        int? maxAgeDays = null) => new(protectedPerContext, maxAgeDays);

    private static (FakeTraceStore Traces, FakeHistoryStore History) Corpus(
        int lapCount,
        DateTimeOffset? sessionStartedAt = null)
    {
        FakeTraceStore traces = new FakeTraceStore();
        FakeHistoryStore history = new FakeHistoryStore();
        history.Saved.Add(Session("hs-1", "Spa-Francorchamps", traces, lapCount, sessionStartedAt));
        return (traces, history);
    }

    /// <summary>
    /// One session of <paramref name="lapCount"/> laps, each with a 100-byte trace and a
    /// reference curve. Lap 1 is the fastest and lap N the slowest.
    /// </summary>
    private static LapHistorySession Session(
        string id,
        string track,
        FakeTraceStore traces,
        int lapCount,
        DateTimeOffset? startedAt = null)
    {
        LapHistorySession session = new LapHistorySession
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

        for (int lap = 1; lap <= lapCount; lap++)
        {
            string traceId = LapTraceId.For(id, lap);
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

        public void Save(string traceId, LapChannelTrace trace) => this.All[traceId] = 100;

        public LapChannelTrace? Load(string traceId) => null;

        public void Delete(string traceId) => this.All.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() =>
            [.. this.All.Select(pair => new LapTraceInfo(pair.Key, pair.Value, Now.AddHours(-1)))];
    }

    private sealed class FakeHistoryStore : ILapHistoryStore
    {
        public List<LapHistorySession> Saved { get; } = [];

        /// <summary>Ids of sessions written back, so churn is observable.</summary>
        public List<string> Rewritten { get; } = [];

        public IReadOnlyList<LapHistorySession> LoadAll() => this.Saved;

        public void Save(LapHistorySession session)
        {
            this.Rewritten.Add(session.Id);
            this.Saved.RemoveAll(existing => existing.Id == session.Id);
            this.Saved.Add(session);
        }

        public void Delete(string sessionId) => this.Saved.RemoveAll(session => session.Id == sessionId);
    }
}
