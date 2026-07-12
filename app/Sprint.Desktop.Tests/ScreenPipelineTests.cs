using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class ScreenPipelineTests
{
    private sealed class ConstantFrameSource(int width, int height) : IDashFrameSource
    {
        public int Width => width;
        public int Height => height;
        public void Render(TelemetryFrame frame, Span<byte> rgb565) => rgb565.Fill(0xAB);
        public void Dispose() { }
    }

    private sealed class ThrowingFrameSource : IDashFrameSource
    {
        public int Width => 8;
        public int Height => 8;
        public void Render(TelemetryFrame frame, Span<byte> rgb565) => throw new InvalidOperationException("boom");
        public void Dispose() { }
    }

    [Fact]
    public void PublisherConnectsThenSendsFrames()
    {
        var driver = new FakeScreenDriver { ConnectResult = ScreenConnectionState.Connected };
        using var publisher = new ScreenPublisher(driver, new ConstantFrameSource(16, 16), () => new TelemetryFrame());

        Assert.Equal(ScreenStepOutcome.SentFrame, publisher.Step());
        Assert.Equal(1, driver.ConnectAttempts);
        Assert.Equal(1, driver.FramesSent);
        Assert.NotNull(driver.LastFrame);
        Assert.Equal(16 * 16 * 2, driver.LastFrame!.Length);

        // Already connected → subsequent steps just send.
        publisher.Step();
        Assert.Equal(1, driver.ConnectAttempts);
        Assert.Equal(2, driver.FramesSent);
    }

    [Fact]
    public void PublisherIdlesAndSurfacesStatusWhenPermissionDenied()
    {
        var driver = new FakeScreenDriver
        {
            ConnectResult = ScreenConnectionState.PermissionDenied,
            ConnectDetail = "WinUSB driver not installed",
        };
        using var publisher = new ScreenPublisher(driver, new ConstantFrameSource(16, 16), () => new TelemetryFrame());

        Assert.Equal(ScreenStepOutcome.Reconnecting, publisher.Step());
        Assert.Equal(0, driver.FramesSent);
        Assert.Equal(ScreenConnectionState.PermissionDenied, publisher.Status.State);
        Assert.Equal("WinUSB driver not installed", publisher.Status.Detail);
    }

    [Fact]
    public void PublisherNeverThrowsWhenSourceFaults()
    {
        var driver = new FakeScreenDriver { ConnectResult = ScreenConnectionState.Connected };
        using var publisher = new ScreenPublisher(driver, new ThrowingFrameSource(), () => new TelemetryFrame());

        Assert.Equal(ScreenStepOutcome.Reconnecting, publisher.Step());
        Assert.Equal("boom", publisher.LastError);
    }

    [Fact]
    public void DashPainterFrameSourceRendersNativeBufferForDefaultPreset()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);
            var config = new ScreenConfig { Width = 200, Height = 120, Rotation = 0 };

            using var source = new DashPainterFrameSource(layout, runtime.Settings, config);
            Assert.Equal(200, source.Width);
            Assert.Equal(120, source.Height);

            var buffer = new byte[source.Width * source.Height * 2];
            source.Render(
                new TelemetryFrame { Car = new CarState { Gear = 3, Rpm = 8000, MaxRpm = 9000 } },
                buffer);

            Assert.Contains(buffer, b => b != 0); // produced visible content
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void DashPainterFrameSourceSwapsAxesUnderQuarterTurn()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);
            var config = new ScreenConfig { Width = 200, Height = 120, Rotation = 90 };

            using var source = new DashPainterFrameSource(layout, runtime.Settings, config);
            var buffer = new byte[source.Width * source.Height * 2];

            // Native size is unchanged; internal painter renders rotated. No throw = axes handled.
            source.Render(new TelemetryFrame(), buffer);
            Assert.Equal(200, source.Width);
            Assert.Equal(120, source.Height);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

}
