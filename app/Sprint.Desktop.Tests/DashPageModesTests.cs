using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashPageModesTests
{
    // The hypercar dash in small: two practice pages, quali's out lap and push pages, a race page,
    // a page in every session and one in the driver's "fuel-save" mode as well as the race.
    private static DashLayout Dash() => new()
    {
        Id = "hypercar",
        Pages =
        [
            Page("practice", "practice"),
            Page("tyres", "practice"),
            Page("outlap", "qualifying", DashPageJump.OutLap),
            Page("push", "qualifying", DashPageJump.FlyingLap),
            Page("race", "race"),
            Page("everywhere"),
            Page("energy", "race", "fuel-save"),
        ],
    };

    private static DashPage Page(string id, params string[] showIn) => new() { Id = id, Name = id, ShowIn = showIn.Length > 0 ? [.. showIn] : null };

    private static DashPage Page(string id, string session, DashPageJump jump) => new() { Id = id, Name = id, ShowIn = [session], Jump = jump };

    private static string[] Ids(IEnumerable<DashPage> pages) => pages.Select(page => page.Id).ToArray();

    [Fact]
    public void CyclePages_FollowsTheSessionThenTheDriversModeAndNeverComesBackEmpty()
    {
        DashLayout dash = Dash();
        Assert.Equal(["practice", "tyres", "everywhere"], Ids(DashPageModes.CyclePages(dash, null, SessionType.Practice)));
        Assert.Equal(["practice", "tyres", "everywhere"], Ids(DashPageModes.CyclePages(dash, null, SessionType.Warmup)));
        Assert.Equal(["outlap", "push", "everywhere"], Ids(DashPageModes.CyclePages(dash, null, SessionType.Qualify)));
        Assert.Equal(["energy"], Ids(DashPageModes.CyclePages(dash, "fuel-save", SessionType.Practice)));

        // A mode this dash has no page for leaves the session's pages; no session at all, every page.
        Assert.Equal(["race", "everywhere", "energy"], Ids(DashPageModes.CyclePages(dash, "wet", SessionType.Race)));
        Assert.Equal(7, DashPageModes.CyclePages(dash, null, SessionType.Unknown).Count);

        DashLayout onlyQuali = new() { Id = "q", Pages = [Page("push", "qualifying")] };
        Assert.Equal(["push"], Ids(DashPageModes.CyclePages(onlyQuali, null, SessionType.Race)));
    }

    [Fact]
    public void LapWatch_SeesTheOutLapAtPitExitAndAFlyingLapAtEveryLineOnTrack()
    {
        DashLapWatch watch = new();
        Assert.Null(watch.Next(Frame(lap: 1, inPitLane: true)));
        Assert.Null(watch.Next(Frame(lap: 2, inPitLane: true)));
        Assert.Equal(DashPageJump.OutLap, watch.Next(Frame(lap: 2, inPitLane: false)));
        Assert.Null(watch.Next(Frame(lap: 2, inPitLane: false)));
        Assert.Equal(DashPageJump.FlyingLap, watch.Next(Frame(lap: 3, inPitLane: false)));
        Assert.Equal(DashPageJump.FlyingLap, watch.Next(Frame(lap: 4, inPitLane: false)));

        // Back to the garage: nothing until driving again, and a new session starts over.
        Assert.Null(watch.Next(Frame(lap: 4, inPitLane: true, inCar: false)));
        Assert.Null(watch.Next(Frame(lap: 0, inPitLane: true, session: SessionType.Race)));
        Assert.Null(watch.Next(Frame(lap: 1, inPitLane: true, session: SessionType.Race)));
    }

    [Fact]
    public void Cycle_MovesWithinTheSessionsPagesAndJumpsToThePushPageAtTheLine()
    {
        DashLayout dash = Dash();
        DashPageCycle cycle = new() { Session = SessionType.Qualify };

        cycle.Settle("wheel", dash, jump: null, contextChanged: true);
        Assert.Equal("outlap", cycle.CurrentPageId("wheel"));
        Assert.Equal("push", cycle.Move("wheel", dash, 1));
        Assert.Equal("everywhere", cycle.Move("wheel", dash, 1));
        Assert.Equal("outlap", cycle.Move("wheel", dash, 1));

        cycle.Settle("wheel", dash, DashPageJump.FlyingLap, contextChanged: false);
        Assert.Equal("push", cycle.CurrentPageId("wheel"));

        // A "Go to" page outside the session stays until the session or mode changes.
        Assert.True(cycle.Show("wheel", dash, "race"));
        cycle.Settle("wheel", dash, jump: null, contextChanged: false);
        Assert.Equal("race", cycle.CurrentPageId("wheel"));
        // From there, Next is the session's first page and Previous its last.
        Assert.Equal("outlap", cycle.Move("wheel", dash, 1));
        Assert.True(cycle.Show("wheel", dash, "race"));
        Assert.Equal("everywhere", cycle.Move("wheel", dash, -1));

        cycle.SetMode("wheel", "fuel-save");
        cycle.Settle("wheel", dash, jump: null, contextChanged: true);
        Assert.Equal("energy", cycle.CurrentPageId("wheel"));

        // A jump only lands on a page the device cycles now: no quali page while in the mode.
        cycle.Settle("wheel", dash, DashPageJump.OutLap, contextChanged: false);
        Assert.Equal("energy", cycle.CurrentPageId("wheel"));
    }

    [Fact]
    public void ForgetUnknownPicks_DropsAModeThatIsGoneAndPutsAnEmptiedPageBackOnEverySession()
    {
        DashLayout dash = Dash();
        Assert.True(DashPageModes.ForgetUnknownPicks(dash, [new DashMode { Id = "wet", Name = "Wet" }]));
        Assert.Equal(["race"], dash.Pages.Single(page => page.Id == "energy").ShowIn);
        Assert.Equal(["practice"], dash.Pages.Single(page => page.Id == "practice").ShowIn);

        DashLayout onlyMode = new() { Id = "m", Pages = [Page("fuel", "fuel-save")] };
        Assert.True(DashPageModes.ForgetUnknownPicks(onlyMode, []));
        Assert.Null(onlyMode.Pages[0].ShowIn);
        Assert.False(DashPageModes.ForgetUnknownPicks(onlyMode, []));
    }

    private static TelemetryFrame Frame(int lap, bool inPitLane, bool inCar = true, SessionType session = SessionType.Qualify) => new()
    {
        Session = new SessionInfo { InCar = inCar, SessionType = session },
        Lap = new LapState { CurrentLap = lap },
        Car = new CarState { InPitLane = inPitLane },
    };
}
