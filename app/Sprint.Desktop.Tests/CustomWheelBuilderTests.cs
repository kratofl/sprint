using Sprint.Desktop;
using Sprint.Desktop.Features.Devices;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The custom-wheel form's pure core (issue #49): a user-defined wheel becomes a
/// catalog entry with no VID/PID (so the screen service auto-detects the panel like
/// the shipped generic entries), and incomplete input is rejected with a message
/// rather than an exception or a half-built device.
/// </summary>
public sealed class CustomWheelBuilderTests
{
    [Fact]
    public void WheelWithAutoDetectedScreenKeepsResolutionOpen()
    {
        Assert.True(CustomWheelBuilder.TryBuild(
            new CustomWheelRequest("  My GT Rim  ", HasScreen: true, Driver: "vocore"),
            out var device,
            out var error));

        Assert.Null(error);
        Assert.Equal("My GT Rim", device.Name);
        Assert.Equal("custom-wheel-my-gt-rim", device.Id);
        Assert.Equal("wheel", device.Type);
        Assert.Equal("vocore", device.Driver);
        // No VID/PID is what makes auto-detection claim the first free panel.
        Assert.Equal(0, device.Vid);
        Assert.Equal(0, device.Pid);
        Assert.Equal(0, device.Width);
        Assert.Equal(0, device.Height);
        Assert.Contains("auto-detected", device.Description, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void WheelWithAnExplicitResolutionKeepsIt()
    {
        Assert.True(CustomWheelBuilder.TryBuild(
            new CustomWheelRequest("NX50 rim", HasScreen: true, Driver: "USBD480", Width: 800, Height: 480),
            out var device,
            out _));

        Assert.Equal("usbd480", device.Driver);
        Assert.Equal(800, device.Width);
        Assert.Equal(480, device.Height);
        Assert.Contains("800 × 480", device.Description, StringComparison.Ordinal);
    }

    [Fact]
    public void ScreenlessWheelCarriesNoTransportOrResolution()
    {
        Assert.True(CustomWheelBuilder.TryBuild(
            new CustomWheelRequest("Button box rim", HasScreen: false, Driver: "vocore", Width: 800, Height: 480),
            out var device,
            out _));

        // Screen fields are ignored when the wheel has no screen, so the saved device
        // cannot masquerade as a display.
        Assert.Equal("", device.Driver);
        Assert.Equal(0, device.Width);
        Assert.Equal(0, device.Height);
        Assert.Contains("no screen", device.Description, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void NameIsRequired(string? name)
    {
        Assert.False(CustomWheelBuilder.TryBuild(new CustomWheelRequest(name, HasScreen: false), out _, out var error));
        Assert.Equal("Enter a name for the wheel.", error);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("hdmi")]
    public void ScreenTypeIsRequiredWhenTheWheelHasAScreen(string? driver)
    {
        Assert.False(CustomWheelBuilder.TryBuild(
            new CustomWheelRequest("Rim", HasScreen: true, Driver: driver),
            out _,
            out var error));

        Assert.Equal("Choose the screen type for this wheel.", error);
    }

    [Theory]
    [InlineData(800, 0)]
    [InlineData(0, 480)]
    public void HalfFilledResolutionIsRejected(int width, int height)
    {
        Assert.False(CustomWheelBuilder.TryBuild(
            new CustomWheelRequest("Rim", HasScreen: true, Driver: "vocore", Width: width, Height: height),
            out _,
            out var error));

        Assert.Equal("Enter both width and height, or use auto-detect.", error);
    }

    [Theory]
    [InlineData(-1, 480)]
    [InlineData(800, 9000)]
    public void OutOfRangeResolutionIsRejected(int width, int height)
    {
        Assert.False(CustomWheelBuilder.TryBuild(
            new CustomWheelRequest("Rim", HasScreen: true, Driver: "vocore", Width: width, Height: height),
            out _,
            out var error));

        Assert.Contains("Resolution must be between", error);
    }

    [Fact]
    public void NamesThatSlugToNothingStillProduceAnId()
    {
        Assert.True(CustomWheelBuilder.TryBuild(new CustomWheelRequest("!!!", HasScreen: false), out var device, out _));
        Assert.Equal("custom-wheel-wheel", device.Id);
    }

    [Fact]
    public void AddedCustomWheelsGetTheRightResolutionFromTheRuntime()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            CustomWheelBuilder.TryBuild(new CustomWheelRequest("Screened rim", HasScreen: true, Driver: "vocore"), out var screened, out _);
            CustomWheelBuilder.TryBuild(new CustomWheelRequest("Bare rim", HasScreen: false), out var bare, out _);

            var withScreen = runtime.AddDevice(screened);
            var withoutScreen = runtime.AddDevice(bare);

            // Auto-detect resolves to the driver's stand-in size until hardware reports in.
            Assert.Equal(800, withScreen.Width);
            Assert.Equal(480, withScreen.Height);
            Assert.True(DeviceCapabilities.HasScreen(withScreen));
            Assert.Equal(DevicePurposes.Dash, withScreen.Purpose);

            // A screenless wheel must not be given an invented resolution, or it would
            // be treated as a display and get a publisher.
            Assert.Equal(0, withoutScreen.Width);
            Assert.Equal(0, withoutScreen.Height);
            Assert.False(DeviceCapabilities.HasScreen(withoutScreen));
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void DriverLabelsRoundTripForTheDropdown()
    {
        Assert.Equal("VoCore", CustomWheelBuilder.DriverLabel("vocore"));
        Assert.Equal("USBD480", CustomWheelBuilder.DriverLabel("usbd480"));
        Assert.Equal("vocore", CustomWheelBuilder.DriverForLabel("VoCore"));
        Assert.Equal("usbd480", CustomWheelBuilder.DriverForLabel(" usbd480 "));
        Assert.Null(CustomWheelBuilder.DriverForLabel("HDMI"));
    }
}
