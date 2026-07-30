using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Api.Telemetry;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DesktopCaptureSelectionTests
{
    private sealed class RecordingCapturer : IDesktopRegionCapturer
    {
        public ScreenCaptureRegion? Region { get; private set; }
        public int Width { get; private set; }
        public int Height { get; private set; }

        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            Region = region;
            Width = destinationWidth;
            Height = destinationHeight;
            for (var pixel = 0; pixel < destinationWidth * destinationHeight; pixel++)
            {
                var offset = pixel * 4;
                bgra[offset] = 0x00;
                bgra[offset + 1] = 0x00;
                bgra[offset + 2] = 0xff;
                bgra[offset + 3] = 0xff;
            }

            return true;
        }
    }

    [Theory]
    [InlineData(0, 480, 800, 0.6)]
    [InlineData(90, 800, 480, 1.6666666667)]
    [InlineData(180, 480, 800, 0.6)]
    [InlineData(270, 800, 480, 1.6666666667)]
    public void EffectiveSizeAndAspectFollowTheDeviceOrientation(
        int rotation,
        int expectedWidth,
        int expectedHeight,
        double expectedAspect)
    {
        var device = ScreenDevice(rotation);

        var size = CaptureSelectionGeometry.EffectiveSize(device);

        Assert.Equal(expectedWidth, size.Width);
        Assert.Equal(expectedHeight, size.Height);
        Assert.Equal(expectedAspect, CaptureSelectionGeometry.AspectRatio(device), precision: 8);
    }

    [Fact]
    public void ResizeUsesTheDominantPointerAxisAndKeepsTheExactAspectRatio()
    {
        const double aspect = 16d / 9d;
        var previous = new CaptureSelectionSize(640, 360);

        var widthDriven = CaptureSelectionGeometry.ConstrainResize(
            previous,
            new CaptureSelectionSize(800, 390),
            aspect);
        var heightDriven = CaptureSelectionGeometry.ConstrainResize(
            previous,
            new CaptureSelectionSize(660, 450),
            aspect);

        Assert.Equal(new CaptureSelectionSize(800, 450), widthDriven);
        Assert.Equal(new CaptureSelectionSize(800, 450), heightDriven);
    }

    [Theory]
    [InlineData(0, 90, 480, 800)]
    [InlineData(90, 270, 800, 480)]
    [InlineData(270, 0, 480, 800)]
    public void RotationChangeKeepsAConfiguredRegionAlignedWithTheDevice(
        int previousRotation,
        int nextRotation,
        int expectedWidth,
        int expectedHeight)
    {
        var region = new ScreenCaptureRegion(25, 50, 800, 480);

        var reoriented = CaptureSelectionGeometry.ReorientRegion(
            region,
            previousRotation,
            nextRotation);

        Assert.Equal(new ScreenCaptureRegion(25, 50, expectedWidth, expectedHeight), reoriented);
    }

    [Fact]
    public void DisconnectedMonitorSelectionRecoversInsideTheVisibleScreen()
    {
        var stale = new ScreenCaptureRegion(-1920, 100, 1600, 900);
        var primaryWorkingArea = new ScreenCaptureRegion(0, 0, 1920, 1040);

        var recovered = CaptureSelectionGeometry.RecoverToVisibleBounds(
            stale,
            primaryWorkingArea,
            16d / 9d);

        Assert.True(recovered.X >= primaryWorkingArea.X);
        Assert.True(recovered.Y >= primaryWorkingArea.Y);
        Assert.True(recovered.X + recovered.Width <= primaryWorkingArea.X + primaryWorkingArea.Width);
        Assert.True(recovered.Y + recovered.Height <= primaryWorkingArea.Y + primaryWorkingArea.Height);
        Assert.Equal(16d / 9d, recovered.Width / (double)recovered.Height, precision: 2);
    }

    [Fact]
    public void CaptureRegionPersistsNegativeMultiMonitorCoordinates()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var device = ScreenDevice(rotation: 90);
            runtime.Devices.Add(device);

            runtime.UpdateDeviceCaptureRegion(
                device,
                new ScreenCaptureRegion(-1920, 140, 1600, 960));

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var persisted = reloaded.Devices.Single(item => item.Id == device.Id);

            Assert.Equal(
                new ScreenCaptureRegion(-1920, 140, 1600, 960),
                persisted.CaptureRegion);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void FrameSourceCapturesAtLogicalSizeThenUsesTheExistingRgb565Pipeline()
    {
        var region = new ScreenCaptureRegion(-800, 25, 1600, 960);
        var capturer = new RecordingCapturer();
        var config = new ScreenConfig
        {
            Width = 2,
            Height = 4,
            Rotation = 90,
        };
        using var source = new DesktopCaptureFrameSource(region, config, capturer);
        var destination = new byte[config.Width * config.Height * 2];

        source.Render(new TelemetryFrame(), destination);

        Assert.Equal(region, capturer.Region);
        Assert.Equal(4, capturer.Width);
        Assert.Equal(2, capturer.Height);
        Assert.Equal(
            Enumerable.Repeat(new byte[] { 0x00, 0xf8 }, 8).SelectMany(bytes => bytes),
            destination);
    }

    private static SavedDevice ScreenDevice(int rotation) => new()
    {
        Id = "capture-screen",
        Name = "Capture screen",
        Type = "screen",
        Driver = "vocore",
        Width = 480,
        Height = 800,
        Rotation = rotation,
    };
}
