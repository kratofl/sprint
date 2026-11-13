using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Features.Peer;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// <see cref="DebugSnapshot.Build"/>, the dev debug window's <c>/api/debug</c>: the frame's age, the
/// readings the renderer's frame mirror leaves out, and which screens it lists with what figures.
/// </summary>
public sealed class DebugSnapshotTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 20, 0, 0, TimeSpan.Zero);

    [Fact]
    public void TheFrameIsAgedAndCarriesWhatTheMirrorLeavesOut()
    {
        TelemetryFrame frame = new()
        {
            Session = new SessionInfo { MaxLaps = 0, SessionTimeRemaining = null, Phase = SessionPhase.Green },
            Car = new CarState { SpeedMetersPerSecond = 50, Throttle = 1, ThrottleApplied = 0.8f, FuelLiters = 40, FuelCapacityLiters = 90 },
            Tires =
            [
                new TireState { Position = TirePosition.RearRight, BrakeTempCelsius = 400 },
                new TireState { Position = TirePosition.FrontLeft, BrakeTempCelsius = 610 },
                new TireState { Position = TirePosition.RearLeft },
                new TireState { Position = TirePosition.FrontRight },
            ],
        };
        TelemetryStatus status = new() { State = TelemetryConnectionState.Connected, SourceName = "Le Mans Ultimate", LastFrameAt = Now.AddMilliseconds(-40) };

        DebugSnapshot snapshot = DebugSnapshot.Build(new DesktopTelemetryState(frame, status, 50), Now, [], _ => null, Sprint());

        Assert.Equal(40, snapshot.Telemetry.FrameAgeMs!.Value, precision: 6);
        Assert.Equal(180, snapshot.Car.SpeedKph, precision: 3);
        Assert.Equal(0.8, snapshot.Car.ThrottleApplied!.Value, precision: 6);
        Assert.Null(snapshot.Car.BrakeApplied);
        Assert.Equal(90, snapshot.Car.FuelCapacityLiters);
        // Front left first, whatever order the game listed the corners in.
        Assert.Equal([TirePosition.FrontLeft, TirePosition.FrontRight, TirePosition.RearLeft, TirePosition.RearRight], snapshot.Car.Corners.Select(corner => corner.Position));
        Assert.Equal(610, snapshot.Car.Corners[0].BrakeTemp);
        // No lap limit and no clock: 0 and null, for the window to say so.
        Assert.Equal(0, snapshot.Session.MaxLaps);
        Assert.Null(snapshot.Session.TimeRemainingSeconds);

        // No frame yet: no age rather than a huge one.
        Assert.Null(DebugSnapshot.Build(new DesktopTelemetryState(new TelemetryFrame(), new TelemetryStatus(), 0), Now, [], _ => null, Sprint()).Telemetry.FrameAgeMs);
    }

    [Fact]
    public void EveryEnabledScreenIsListedWithItsOutputsFiguresOrNoneYet()
    {
        SavedDevice running = Screen("running");
        SavedDevice starting = Screen("starting");
        SavedDevice disabled = Screen("disabled");
        disabled.Disabled = true;
        SavedDevice buttonBox = Screen("buttons");
        buttonBox.Width = 0;
        buttonBox.Height = 0;
        ScreenOutputHardware hardware = new(
            new ScreenStatus { State = ScreenConnectionState.Connected },
            new ScreenPerformanceSnapshot(29.7, TimeSpan.FromMilliseconds(2), TimeSpan.FromMilliseconds(1), TimeSpan.FromMilliseconds(3), TimeSpan.FromMilliseconds(9), TimeSpan.FromMilliseconds(12), 602, 590, 10));

        IReadOnlyList<DebugScreen> screens = DebugSnapshot.Build(
            new DesktopTelemetryState(new TelemetryFrame(), new TelemetryStatus(), 0),
            Now,
            [running, starting, disabled, buttonBox],
            id => id == "running" ? hardware : null,
            Sprint()).Screens;

        Assert.Equal(["running", "starting"], screens.Select(screen => screen.DeviceId));
        DebugScreen live = screens[0];
        Assert.Equal(ScreenConnectionState.Connected, live.State);
        Assert.Equal(29.7, live.Fps);
        Assert.Equal(3, live.RenderMs!.Value, precision: 6);
        Assert.Equal(9, live.UsbMs!.Value, precision: 6);
        Assert.Equal(10, live.FramesUnchanged);
        // 602 drawn, 590 sent, 10 unchanged: 2 failed on the way to the panel.
        Assert.Equal(2, live.FramesFailed);
        // No output running yet: no state and no figures, never a zero frame rate that looks measured.
        Assert.Null(screens[1].State);
        Assert.Null(screens[1].Fps);
        Assert.Null(screens[1].TotalMs);
    }

    [Fact]
    public void TheActivePlanAndTheRecordersLastLapAreRead()
    {
        SessionPlan draft = new() { Id = "draft", Status = PlanStatus.Draft };
        SessionPlan armed = new() { Id = "armed", Name = "Spa 6h", Status = PlanStatus.Armed, FuelPerLapLiters = 3.1 };

        Assert.Equal("armed", DebugPlan.Active([draft, armed])!.Id);
        Assert.Null(DebugPlan.Active([draft]));

        LapHistorySession session = new()
        {
            Id = "s1",
            Kind = HistorySessionKind.Practice,
            Laps = [new LapHistoryRecord { FuelUsedLiters = null }, new LapHistoryRecord { FuelUsedLiters = 3.4 }],
        };
        DebugRecorder recorder = DebugRecorder.From(session)!;
        Assert.Equal(2, recorder.Laps);
        Assert.Equal(3.4, recorder.LastLapFuelLiters);
        Assert.Null(DebugRecorder.From(null));
    }

    private static DebugSprint Sprint() => new(
        new DebugTargets(null, null, null),
        null,
        new DebugHud(false, false, false),
        DebugLink.From(PeerLinkState.Off),
        null,
        new DebugTimingsSnapshot(0, 0));

    private static SavedDevice Screen(string id) => new()
    {
        Id = id,
        Name = id,
        Driver = "vocore",
        Type = "screen",
        Width = 480,
        Height = 800,
        Purpose = DevicePurposes.Dash,
    };
}
