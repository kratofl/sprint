using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for #184: fastest/median/slowest read off the lap-history
/// corpus (#179), each resolving to a real driven lap plus the sample size it was drawn
/// from. Scope selection (Current Quali / Quali / Practice / program) is #186's concern —
/// these tests exercise context filtering plus the statistics themselves, nothing more.
/// </summary>
public sealed class LapHistoryStatisticsTests
{
    private static readonly LapHistoryContext Context = new()
    {
        Game = "Le Mans Ultimate",
        TrackCourse = "Spa-Francorchamps",
        CarModel = "Porsche 963",
    };

    [Fact]
    public void AnOddCorpusResolvesTheMiddleLapAsMedian()
    {
        // Hand-worked: sorted [130, 131, 132, 140, 999] -> the middle position holds the lap
        // timed 132. Never computed with the same expression the implementation uses.
        var store = StoreWith(Session("hs-1", 130, 131, 132, 140, 999));

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        Assert.Equal(132, result!.Median.Lap.LapTimeSeconds);
        Assert.Equal(5, result.SampleSize);
    }

    [Fact]
    public void AnEvenCorpusResolvesTheLowerMedian()
    {
        // Hand-worked: sorted [130, 131, 132, 140] has no single middle lap, and the design
        // is explicit that the LOWER of the two middle laps wins (131), never an interpolated
        // 131.5 that no one actually drove.
        var store = StoreWith(Session("hs-1", 130, 131, 132, 140));

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        Assert.Equal(131, result!.Median.Lap.LapTimeSeconds);
        Assert.Equal(4, result.SampleSize);
    }

    [Fact]
    public void InvalidLapsAreExcludedFromTheCorpus()
    {
        // Hand-worked: only [130, 140] are valid, so the median is the lower of those two
        // (130), not anything a naive full-list median (which would land on 132, the invalid
        // lap) would give.
        var session = Session("hs-1", 130, 131, 132, 140);
        session.Laps[1].IsValid = false; // 131
        session.Laps[2].IsValid = false; // 132
        var store = StoreWith(session);

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        Assert.Equal(2, result!.SampleSize);
        Assert.Equal(130, result.Median.Lap.LapTimeSeconds);
    }

    [Fact]
    public void ZeroOrNegativeLapTimesAreExcludedAsUnrecordedRatherThanFast()
    {
        // A lap with no time (0) or a bogus negative value is not a real driven lap timed at
        // zero seconds — it means the recorder never got a time for it — so it must not sort
        // to the front and become "fastest".
        var session = Session("hs-1", 0, -5, 131, 140);
        var store = StoreWith(session);

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        Assert.Equal(2, result!.SampleSize);
        Assert.Equal(131, result.Fastest.Lap.LapTimeSeconds);
    }

    [Fact]
    public void LapsFromOtherContextsNeverLeakIntoTheCorpus()
    {
        // A different car at the same track, and the same car at a different track/game, must
        // not contribute laps: only Game + TrackCourse + CarModel together form the key.
        var wrongCar = Session("hs-car", 50, 51);
        wrongCar.Context.CarModel = "Peugeot 9X8";
        var wrongTrack = Session("hs-track", 60, 61);
        wrongTrack.Context.TrackCourse = "Spa-Francorchamps Endurance";
        var wrongGame = Session("hs-game", 70, 71);
        wrongGame.Context.Game = "Assetto Corsa";
        var matching = Session("hs-match", 130, 131);
        var store = StoreWith(wrongCar, wrongTrack, wrongGame, matching);

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        Assert.Equal(2, result!.SampleSize);
        Assert.All(result.Candidates, candidate => Assert.Equal("hs-match", candidate.Session.Id));
    }

    [Fact]
    public void ASingleLapIsFastestMedianAndSlowestAtOnce()
    {
        var store = StoreWith(Session("hs-1", 145));

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        Assert.Equal(1, result!.SampleSize);
        Assert.Same(result.Fastest.Lap, result.Median.Lap);
        Assert.Same(result.Median.Lap, result.Slowest.Lap);
        Assert.Equal(145, result.Fastest.Lap.LapTimeSeconds);
    }

    [Fact]
    public void AnEmptyCorpusHasNoStatisticRatherThanAZeroOrDefault()
    {
        var store = StoreWith();

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.Null(result);
    }

    [Fact]
    public void LapsFromEverySessionKindAreIncludedInOneCorpus()
    {
        // #103's corpus rule is explicit: all session types feed the same context bucket. A
        // practice lap can be the fastest, a race lap the median, a qualifying lap the
        // slowest — the statistic does not care which tab produced them.
        var practice = Session("hs-practice", 128);
        practice.Kind = HistorySessionKind.Practice;
        var qualifying = Session("hs-qualifying", 999);
        qualifying.Kind = HistorySessionKind.Qualifying;
        var race = Session("hs-race", 131);
        race.Kind = HistorySessionKind.Race;
        var warmup = Session("hs-warmup", 132);
        warmup.Kind = HistorySessionKind.Warmup;
        var testDay = Session("hs-testday", 133);
        testDay.Kind = HistorySessionKind.TestDay;
        var store = StoreWith(practice, qualifying, race, warmup, testDay);

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        Assert.Equal(5, result!.SampleSize);
        Assert.Equal(128, result.Fastest.Lap.LapTimeSeconds);
        Assert.Equal(999, result.Slowest.Lap.LapTimeSeconds);
    }

    [Fact]
    public void EachPresetPointsAtALapThatActuallyExistsInTheCorpus()
    {
        var store = StoreWith(Session("hs-1", 130, 131, 132, 140, 999));

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        var allLapTimes = result!.Candidates.Select(candidate => candidate.Lap.LapTimeSeconds).ToList();
        Assert.Contains(result.Fastest.Lap, result.Candidates.Select(candidate => candidate.Lap));
        Assert.Contains(result.Median.Lap, result.Candidates.Select(candidate => candidate.Lap));
        Assert.Contains(result.Slowest.Lap, result.Candidates.Select(candidate => candidate.Lap));
        Assert.Equal(new[] { 130.0, 131, 132, 140, 999 }, allLapTimes);
    }

    [Fact]
    public void ACallerCanTellARecordedResultFromAnImportedOneByItsSessionOrigin()
    {
        // #181 is adding a reference curve to Recorded laps; Imported laps never have one and
        // degrade to a scalar target. Until the curve accessor lands on LapHistoryRecord
        // itself, LapHistorySession.Origin is the caller's only way to tell the two tiers
        // apart, so a statistic must keep pointing at the owning session, not just the lap.
        var imported = Session("hs-imported", 120);
        imported.Origin = LapHistoryOrigin.Imported;
        var store = StoreWith(imported);

        var result = LapHistoryStatistics.Resolve(store, Context);

        Assert.NotNull(result);
        Assert.Equal(LapHistoryOrigin.Imported, result!.Fastest.Session.Origin);
    }

    private static ILapHistoryStore StoreWith(params LapHistorySession[] sessions) =>
        new FakeLapHistoryStore(sessions);

    private static LapHistorySession Session(string id, params double[] lapTimes) => new()
    {
        Id = id,
        Kind = HistorySessionKind.Practice,
        Context = new LapHistoryContext
        {
            Game = Context.Game,
            TrackCourse = Context.TrackCourse,
            CarModel = Context.CarModel,
        },
        Laps =
        [
            .. lapTimes.Select((time, index) => new LapHistoryRecord
            {
                LapNumber = index + 1,
                IsValid = true,
                LapTimeSeconds = time,
            }),
        ],
    };

    private sealed class FakeLapHistoryStore(IReadOnlyList<LapHistorySession> sessions) : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => sessions;

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();
    }
}
