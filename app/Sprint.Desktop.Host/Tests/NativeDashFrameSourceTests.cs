using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// <see cref="NativeDashFrameSource"/> with the real Rust renderer (the library the host's build
/// puts next to this test assembly): it draws, it redraws only when something changed, and a scene
/// the renderer rejects fails with the renderer's own reason.
/// </summary>
public sealed class NativeDashFrameSourceTests
{
    private static readonly JsonSerializerOptions Json = HostJson.Create();

    [Theory]
    [InlineData(DeviceOrientation.Portrait, 80, 48)]
    [InlineData(DeviceOrientation.Landscape, 48, 80)]
    public void ASceneAndAFrameDrawANonBlankPictureOfThePanelSize(DeviceOrientation orientation, int width, int height)
    {
        DashSceneFeed scenes = Feed(out _, out _);
        scenes.Publish(Content(TestDash.Layout("dash")));
        using NativeDashFrameSource source = new(Config(width, height, orientation), scenes, Json);
        byte[] rgb565 = new byte[width * height * 2];

        ScreenFrameTiming timing = source.Render(new TelemetryFrame(), rgb565);

        Assert.Equal(1, source.RenderCount);
        Assert.True(timing.SourceTime > TimeSpan.Zero);
        Assert.Contains(rgb565, value => value != 0);
    }

    [Fact]
    public void AnUnchangedFrameIsNotDrawnAgainAndANewOneIs()
    {
        DashSceneFeed scenes = Feed(out _, out _);
        scenes.Publish(Content(TestDash.Layout("dash")));
        using NativeDashFrameSource source = new(Config(80, 48), scenes, Json);
        byte[] first = new byte[80 * 48 * 2];
        byte[] again = new byte[80 * 48 * 2];
        TelemetryFrame frame = new();

        source.Render(frame, first);
        source.Render(frame, again);

        Assert.Equal(1, source.RenderCount);
        Assert.Equal(first, again);

        source.Render(new TelemetryFrame(), again);
        Assert.Equal(2, source.RenderCount);
    }

    [Fact]
    public void TheRendererReadsTheHostsFieldNames()
    {
        // Speed is one of the values the renderer used to read under the old mirror name
        // (speedMS) and so always drew as 0 on the wheel.
        DashSceneFeed scenes = Feed(out Func<bool> setLive, out _);
        setLive();
        scenes.Publish(Content(TestDash.Layout("dash")));
        using NativeDashFrameSource source = new(Config(160, 96), scenes, Json);
        TelemetryFrame standing = new() { Car = new CarState { Gear = 3 } };

        byte[] still = Draw(source, standing);
        byte[] moving = Draw(source, standing with { Car = standing.Car with { SpeedMetersPerSecond = 61.5f } });

        Assert.Equal(2, source.RenderCount);
        Assert.NotEqual(still, moving);
    }

    [Fact]
    public void APageChangeTheLiveSwitchAndADashEditAreDrawnOnTheNextFrame()
    {
        DashSceneFeed scenes = Feed(out Func<bool> setLive, out Action<string?> setPage);
        scenes.Publish(Content(TestDash.Layout("dash")));
        using NativeDashFrameSource source = new(Config(80, 48), scenes, Json);
        TelemetryFrame frame = new();
        byte[] idle = Draw(source, frame);

        setLive();
        byte[] main = Draw(source, frame);
        Assert.Equal(2, source.RenderCount);
        Assert.NotEqual(idle, main);

        setPage("second");
        byte[] second = Draw(source, frame);
        Assert.Equal(3, source.RenderCount);
        Assert.NotEqual(main, second);

        // The same dash published again (the reconcile loop does so every second) changes nothing.
        scenes.Publish(Content(TestDash.Layout("dash")));
        Draw(source, frame);
        Assert.Equal(3, source.RenderCount);

        DashLayout edited = TestDash.Layout("dash");
        edited.Pages[1].Widgets[0].Type = "gear_speed";
        scenes.Publish(Content(edited));
        Draw(source, frame);
        Assert.Equal(4, source.RenderCount);
    }

    [Fact]
    public void ADialTurnIsDrawnOnTheNextFrameWithoutAGameInTheDialAlertsLookAndGoesAfterItsDuration()
    {
        MultiDialStatus status = MultiDialStatus.Unknown.MoveTo(0);
        DashSceneFeed scenes = new(() => true, () => null, () => status);
        // The app-wide dial_change alert, stamped on as the host does: full, inverted, the shortest duration.
        AppDashAlerts alerts = AppDashAlerts.Default.With(new DashAlertSettings("dial_change", true, DashAlertSize.Full, true, 1, false));
        scenes.Publish(Content(alerts.Stamp(TestDash.Layout("dash"))));
        scenes.PublishDial(new DashMultiDial("MULTI", [new MultiDialLabel("DASH", "#1F7FE6"), new MultiDialLabel("TC2", "#E0A30C")]));
        using NativeDashFrameSource source = new(Config(80, 48), scenes, Json);
        // One frame object throughout, as when no game is running: only the dial moves.
        TelemetryFrame frame = new();

        byte[] before = Draw(source, frame);
        Assert.Equal(before, Draw(source, frame));
        Assert.Equal(1, source.RenderCount);

        status = status.MoveTo(1);
        byte[] popup = Draw(source, frame);
        Assert.Equal(2, source.RenderCount);
        // Inverted: the panel is filled with the position's colour (#E0A30C).
        byte[] corner = new byte[4];
        Rgb565.ToBgra(popup.AsSpan(0, 2), 1, 1, corner);
        Assert.InRange(corner[2], 0xE0 - 8, 0xE0 + 8);
        Assert.InRange(corner[1], 0xA3 - 4, 0xA3 + 4);
        Assert.InRange(corner[0], 0x0C - 8, 0x0C + 8);

        // The same dial again is no turn; once the alert's second is up the dash is back.
        Thread.Sleep(TimeSpan.FromMilliseconds(1100));
        Assert.Equal(before, Draw(source, frame));
        Assert.Equal(before, Draw(source, frame));
        Assert.Equal(3, source.RenderCount);
    }

    [Fact]
    public void AnAckTakesThePopupDownOnTheNextFrameAndIsNotActedOnTwice()
    {
        MultiDialStatus status = MultiDialStatus.Unknown.MoveTo(0);
        Acknowledgements acknowledgements = new();
        // A press before the screen started is not one for it.
        acknowledgements.Acknowledge();
        DashSceneFeed scenes = new(() => true, () => null, () => status, acknowledgements: acknowledgements);
        AppDashAlerts alerts = AppDashAlerts.Default.With(new DashAlertSettings("dial_change", true, DashAlertSize.Full, true, 30, false));
        scenes.Publish(Content(alerts.Stamp(TestDash.Layout("dash"))));
        scenes.PublishDial(new DashMultiDial("MULTI", [new MultiDialLabel("DASH", "#1F7FE6"), new MultiDialLabel("TC2", "#E0A30C")]));
        using NativeDashFrameSource source = new(Config(80, 48), scenes, Json);
        TelemetryFrame frame = new();

        byte[] before = Draw(source, frame);
        status = status.MoveTo(1);
        Assert.NotEqual(before, Draw(source, frame));
        Assert.Equal(2, source.RenderCount);

        acknowledgements.Acknowledge();
        Assert.Equal(before, Draw(source, frame));
        Assert.Equal(3, source.RenderCount);

        // Nothing new: the picture stays, and is not drawn again for the same press.
        Assert.Equal(before, Draw(source, frame));
        Assert.Equal(3, source.RenderCount);
    }

    [Fact]
    public void ABadSceneFailsWithTheRenderersMessageUntilTheSceneChanges()
    {
        DashSceneFeed scenes = Feed(out _, out _);
        scenes.Publish(new DashSceneContent("{}"u8.ToArray(), "{}"u8.ToArray(), "null"u8.ToArray()));
        using NativeDashFrameSource source = new(Config(80, 48), scenes, Json);
        byte[] rgb565 = new byte[80 * 48 * 2];

        DashRendererException failure = Assert.Throws<DashRendererException>(() => source.Render(new TelemetryFrame(), rgb565));
        Assert.Contains("layout has no pages array", failure.Message, StringComparison.Ordinal);
        Assert.Throws<DashRendererException>(() => source.Render(new TelemetryFrame(), rgb565));
        Assert.Equal(0, source.RenderCount);

        scenes.Publish(Content(TestDash.Layout("dash")));
        source.Render(new TelemetryFrame(), rgb565);
        Assert.Equal(1, source.RenderCount);
    }

    [Fact]
    public void ADeviceWithoutADashIsDarkNotFailed()
    {
        using NativeDashFrameSource source = new(Config(80, 48), Feed(out _, out _), Json);
        byte[] rgb565 = Enumerable.Repeat((byte)0x55, 80 * 48 * 2).ToArray();

        source.Render(new TelemetryFrame(), rgb565);

        Assert.All(rgb565, value => Assert.Equal(0, value));
        Assert.Equal(0, source.RenderCount);
    }

    [Fact]
    public void TheSceneCarriesTheDriversUnitsByNameSoChangingThemIsANewScene()
    {
        DashLayout layout = TestDash.Layout("dash");
        DashSceneContent metric = DashSceneContent.Build(layout, "Driver", "22", UnitSystem.Metric, new ColourSettings(), DashTargets.None, Json);
        DashSceneContent imperial = DashSceneContent.Build(layout, "Driver", "22", UnitSystem.Imperial, new ColourSettings(), DashTargets.None, Json);

        using JsonDocument settings = JsonDocument.Parse(imperial.Settings);
        Assert.Equal("Imperial", settings.RootElement.GetProperty("units").GetString());
        Assert.False(imperial.HasSameBytes(metric));
    }

    [Fact]
    public void TheSceneCarriesTheColoursThemeByNameTheGearRedlineAndTheLimitsSoChangingThemIsANewScene()
    {
        DashLayout layout = TestDash.Layout("dash");
        DashSceneContent sprint = DashSceneContent.Build(layout, "Driver", "22", UnitSystem.Metric, new ColourSettings(), DashTargets.None, Json);
        ColourSettings calm = new() { Theme = ColourTheme.Calm, GearRedline = false, Limits = new ColourLimits { BrakeHotAbove = 900 } };
        DashSceneContent changed = DashSceneContent.Build(layout, "Driver", "22", UnitSystem.Metric, calm, DashTargets.None, Json);

        using JsonDocument settings = JsonDocument.Parse(changed.Settings);
        JsonElement colours = settings.RootElement.GetProperty("colours");
        Assert.Equal("Calm", colours.GetProperty("theme").GetString());
        Assert.Equal(900, colours.GetProperty("limits").GetProperty("brakeHotAbove").GetInt32());
        Assert.False(colours.GetProperty("gearRedline").GetBoolean(), "the renderer reads it by this name");
        Assert.False(changed.HasSameBytes(sprint));
    }

    private static byte[] Draw(NativeDashFrameSource source, TelemetryFrame frame)
    {
        byte[] rgb565 = new byte[source.Width * source.Height * 2];
        source.Render(frame, rgb565);
        return rgb565;
    }

    // Starts idle on no selected page; the out parameters flip telemetry live and pick a page.
    private static DashSceneFeed Feed(out Func<bool> setLive, out Action<string?> setPage)
    {
        bool live = false;
        string? page = null;
        setLive = () => live = true;
        setPage = value => page = value;
        return new DashSceneFeed(() => !live, () => page);
    }

    private static DashSceneContent Content(DashLayout layout) =>
        DashSceneContent.Build(layout, "Driver", "22", UnitSystem.Metric, new ColourSettings(), DashTargets.None, Json);

    private static ScreenConfig Config(int width, int height, DeviceOrientation orientation = DeviceOrientation.Portrait) => new()
    {
        Width = width,
        Height = height,
        Orientation = orientation,
    };
}
