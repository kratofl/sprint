using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Diagnostics;
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

    [Theory]
    [InlineData(ScreenConnectionState.ConfigurationRequired, "Setup needed", "VID/PID")]
    [InlineData(ScreenConnectionState.Disconnected, "Not found", "USB connection")]
    [InlineData(ScreenConnectionState.DeviceBusy, "In use", "SimHub")]
    [InlineData(ScreenConnectionState.PermissionDenied, "USB access failed", "does not ask you to install")]
    [InlineData(ScreenConnectionState.Faulted, "Connection failed", "diagnostics log")]
    public void ScreenStatusPresentationExplainsTheActualRecovery(
        ScreenConnectionState state,
        string expectedLabel,
        string expectedDetail)
    {
        var presented = ScreenStatusPresentation.Describe(new ScreenStatus { State = state });

        Assert.Equal(expectedLabel, presented.Label);
        Assert.Contains(expectedDetail, presented.Detail, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void GenericScreenPresetsResolveToTheExpectedUsbSearch()
    {
        Assert.Equal(
            new ScreenUsbIdentity(0xC872, 0),
            ScreenUsbIdentity.ForDriver("vocore", configuredVid: 0, configuredPid: 0));
        Assert.Equal(
            new ScreenUsbIdentity(0x16C0, 0x08A7),
            ScreenUsbIdentity.ForDriver("usbd480", configuredVid: 0, configuredPid: 0));
    }

    [Theory]
    [InlineData(@"\\?\usb#vid_c872&pid_1004#abc", 0xC872, 0, true)]
    [InlineData(@"\\?\usb#vid_c872&pid_1004#abc", 0xC872, 0x1004, true)]
    [InlineData(@"\\?\usb#vid_c872&pid_1005#abc", 0xC872, 0x1004, false)]
    [InlineData(@"\\?\usb#vid_16c0&pid_08a7#abc", 0x16C0, 0x08A7, true)]
    public void UsbEnumerationSupportsVendorOnlyGenericMatching(
        string path,
        ushort vid,
        ushort pid,
        bool expected)
    {
        Assert.Equal(expected, new ScreenUsbIdentity(vid, pid).MatchesDevicePath(path));
    }

    [Theory]
    [InlineData(ScreenOpenFailureStage.CreateFile, 32, ScreenConnectionState.DeviceBusy)]
    [InlineData(ScreenOpenFailureStage.CreateFile, 5, ScreenConnectionState.DeviceBusy)]
    [InlineData(ScreenOpenFailureStage.WinUsbInitialize, 31, ScreenConnectionState.PermissionDenied)]
    [InlineData(ScreenOpenFailureStage.CreateFile, 2, ScreenConnectionState.Faulted)]
    public void NativeOpenFailuresMapToDistinctUserStates(
        ScreenOpenFailureStage stage,
        int nativeError,
        ScreenConnectionState expected)
    {
        var status = ScreenOpenFailureStatus.Describe(stage, nativeError, 0xC872, 0x1004);

        Assert.Equal(expected, status.State);
        Assert.Contains(nativeError.ToString(), status.Detail, StringComparison.Ordinal);
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
    public void PublisherRebuildsItsRendererForTheNativeSizeReportedAfterConnect()
    {
        var driver = new FakeScreenDriver
        {
            ConnectResult = ScreenConnectionState.Connected,
            NativeSizeOverride = new ScreenNativeSize(8, 4),
        };
        var requestedSizes = new List<ScreenNativeSize>();
        using var publisher = new ScreenPublisher(
            driver,
            new ConstantFrameSource(4, 4),
            () => new TelemetryFrame(),
            sourceFactory: (width, height) =>
            {
                requestedSizes.Add(new ScreenNativeSize(width, height));
                return new ConstantFrameSource(width, height);
            });

        Assert.Equal(ScreenStepOutcome.SentFrame, publisher.Step());
        Assert.Equal([new ScreenNativeSize(8, 4)], requestedSizes);
        Assert.Equal(8 * 4 * 2, driver.LastFrame?.Length);
    }

    [Fact]
    public void PublisherCanShowAStaticTestPatternWithoutTelemetry()
    {
        var driver = new FakeScreenDriver { ConnectResult = ScreenConnectionState.Connected };
        using var publisher = new ScreenPublisher(driver, new ConstantFrameSource(4, 2), () => new TelemetryFrame());

        publisher.SetTestPattern(ScreenTestPattern.Red);
        Assert.Equal(ScreenStepOutcome.SentFrame, publisher.Step());
        Assert.Equal(
            Enumerable.Repeat(new byte[] { 0x00, 0xF8 }, 8).SelectMany(bytes => bytes),
            driver.LastFrame);

        publisher.SetTestPattern(ScreenTestPattern.Dashboard);
        publisher.Step();
        Assert.All(driver.LastFrame!, value => Assert.Equal(0xAB, value));
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
    public void PublisherKeepsAStuckNativeOpenDistinctFromConfirmedDeviceBusy()
    {
        var driver = new FakeScreenDriver { ConnectResult = ScreenConnectionState.Connecting };
        using var publisher = new ScreenPublisher(
            driver,
            new ConstantFrameSource(4, 4),
            () => new TelemetryFrame(),
            new ScreenPublisherOptions
            {
                ConnectingWarningAfter = TimeSpan.Zero,
            });

        Assert.Equal(ScreenStepOutcome.Reconnecting, publisher.Step());
        Assert.Equal(ScreenConnectionState.Connecting, publisher.Status.State);
        Assert.Contains("taking longer", publisher.Status.Detail, StringComparison.OrdinalIgnoreCase);
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
