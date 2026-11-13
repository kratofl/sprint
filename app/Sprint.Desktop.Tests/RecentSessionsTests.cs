using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>Home's recent sessions: the newest session against your earlier best on the same car and track.</summary>
public sealed class RecentSessionsTests
{
    [Fact]
    public void ComparesTheNewestSessionWithYourEarlierBestOnTheSameCarAndTrack()
    {
        RecentSessions? recent = RecentSessions.From(
        [
            Session("older-spa", "2026-09-20T18:00:00Z", "Spa", Lap(125.2, [36.3, 53.9, 35.0]), Lap(120, [30, 50, 40], isValid: false)),
            Session("monza", "2026-09-27T18:00:00Z", "Monza", Lap(97.8, [30, 35, 32.8])),
            Session("newest-spa", "2026-09-28T19:00:00Z", "Spa", Lap(125.0, [36.1, 53.8, 35.1]), Lap(126.0, [36.0, 54, 36])),
            new LapHistorySession(),
        ]);

        Assert.NotNull(recent);
        Assert.Equal("newest-spa", recent.Last.Id);
        Assert.Equal(125.0, recent.Last.BestLapSeconds);
        Assert.Equal([36.1, 53.8, 35.1], recent.Last.BestSectors);
        // Against 125.2 at Spa: the invalid 120 and the Monza lap do not count.
        Assert.Equal(-0.2, recent.Comparison.GapSeconds!.Value, 9);
        Assert.Equal([-0.2, -0.1, 0.1], recent.Comparison.SectorGaps.Select(gap => Math.Round(gap!.Value, 3)));
        Assert.Equal(["monza", "older-spa"], recent.Earlier.Select(session => session.Id));
    }

    [Fact]
    public void AFirstVisitHasNoGapAndNoSessionsHaveNothing()
    {
        RecentSessions? first = RecentSessions.From([Session("only", "2026-09-28T19:00:00Z", "Spa", Lap(125))]);

        Assert.NotNull(first);
        Assert.Null(first.Comparison.GapSeconds);
        Assert.Empty(first.Comparison.SectorGaps);
        Assert.Null(RecentSessions.From([]));
    }

    private static LapHistoryRecord Lap(double lapTimeSeconds, double[]? sectors = null, bool isValid = true) =>
        new() { LapNumber = 1, IsValid = isValid, LapTimeSeconds = lapTimeSeconds, SectorsSeconds = [.. sectors ?? []] };

    private static LapHistorySession Session(string id, string startedAt, string track, params LapHistoryRecord[] laps) => new()
    {
        Id = id,
        Kind = HistorySessionKind.Qualifying,
        StartedAt = DateTimeOffset.Parse(startedAt, System.Globalization.CultureInfo.InvariantCulture),
        Context = new LapHistoryContext { Game = "LeMansUltimate", TrackCourse = track, CarModel = "Porsche 963" },
        Laps = [.. laps],
    };
}
