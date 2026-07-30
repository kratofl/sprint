using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
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

    [Theory]
    [InlineData(33, 8, 25)]
    [InlineData(33, 33, 0)]
    [InlineData(33, 48, 0)]
    public void PublisherPacingSubtractsFrameWorkFromTheTargetInterval(
        int targetMilliseconds,
        int workMilliseconds,
        int expectedDelayMilliseconds)
    {
        Assert.Equal(
            TimeSpan.FromMilliseconds(expectedDelayMilliseconds),
            ScreenPublisher.RemainingFrameDelay(
                TimeSpan.FromMilliseconds(targetMilliseconds),
                TimeSpan.FromMilliseconds(workMilliseconds)));
    }

    private sealed class ThrowingFrameSource : IDashFrameSource
    {
        public int Width => 8;
        public int Height => 8;
        public void Render(TelemetryFrame frame, Span<byte> rgb565) => throw new InvalidOperationException("boom");
        public void Dispose() { }
    }

    private sealed class RecoveringFrameSource : IDashFrameSource
    {
        public int Width => 8;
        public int Height => 8;
        public bool Failing { get; set; } = true;

        public void Render(TelemetryFrame frame, Span<byte> rgb565)
        {
            if (Failing)
            {
                throw new InvalidOperationException("capture unavailable");
            }

            rgb565.Fill(0x1f);
        }

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
        Assert.Equal(1, driver.FramesSent);
    }

    [Fact]
    public void PublisherSkipsAnUnchangedFrameWithoutDisconnectingThePanel()
    {
        var driver = new FakeScreenDriver { ConnectResult = ScreenConnectionState.Connected };
        using var publisher = new ScreenPublisher(
            driver,
            new ConstantFrameSource(16, 16),
            () => new TelemetryFrame());

        Assert.Equal(ScreenStepOutcome.SentFrame, publisher.Step());
        Assert.Equal(ScreenStepOutcome.UnchangedFrame, publisher.Step());
        Assert.Equal(1, driver.FramesSent);
        Assert.Equal(ScreenConnectionState.Connected, publisher.Status.State);
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
        Assert.Equal(ScreenConnectionState.Faulted, publisher.Status.State);
        Assert.Contains("boom", publisher.Status.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void PublisherClearsFrameSourceFailureAfterAFrameRecovers()
    {
        var driver = new FakeScreenDriver { ConnectResult = ScreenConnectionState.Connected };
        var source = new RecoveringFrameSource();
        using var publisher = new ScreenPublisher(driver, source, () => new TelemetryFrame());

        Assert.Equal(ScreenStepOutcome.Reconnecting, publisher.Step());
        Assert.Equal(ScreenConnectionState.Faulted, publisher.Status.State);

        source.Failing = false;
        Assert.Equal(ScreenStepOutcome.SentFrame, publisher.Step());
        Assert.Null(publisher.LastError);
        Assert.Equal(ScreenConnectionState.Connected, publisher.Status.State);
    }

    [Fact]
    public void DashPainterFrameSourceRendersNativeBufferForDefaultPreset()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);
            var config = new ScreenConfig { Width = 200, Height = 120, Orientation = DeviceOrientation.Portrait };

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
    public void DashboardFramesUseTheSameOrientationContractForEveryDriverDimensionOrder()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);
            var frame = new TelemetryFrame();
            var cases = new[]
            {
                (NativeWidth: 120, NativeHeight: 200, Orientation: DeviceOrientation.Portrait, LogicalWidth: 120, LogicalHeight: 200, PixelRotation: 0),
                (NativeWidth: 120, NativeHeight: 200, Orientation: DeviceOrientation.Landscape, LogicalWidth: 200, LogicalHeight: 120, PixelRotation: 90),
                (NativeWidth: 120, NativeHeight: 200, Orientation: DeviceOrientation.PortraitInverted, LogicalWidth: 120, LogicalHeight: 200, PixelRotation: 180),
                (NativeWidth: 120, NativeHeight: 200, Orientation: DeviceOrientation.LandscapeInverted, LogicalWidth: 200, LogicalHeight: 120, PixelRotation: 270),
                (NativeWidth: 200, NativeHeight: 120, Orientation: DeviceOrientation.Portrait, LogicalWidth: 120, LogicalHeight: 200, PixelRotation: 90),
                (NativeWidth: 200, NativeHeight: 120, Orientation: DeviceOrientation.Landscape, LogicalWidth: 200, LogicalHeight: 120, PixelRotation: 0),
                (NativeWidth: 200, NativeHeight: 120, Orientation: DeviceOrientation.PortraitInverted, LogicalWidth: 120, LogicalHeight: 200, PixelRotation: 270),
                (NativeWidth: 200, NativeHeight: 120, Orientation: DeviceOrientation.LandscapeInverted, LogicalWidth: 200, LogicalHeight: 120, PixelRotation: 180),
            };

            foreach (var testCase in cases)
            {
                var config = new ScreenConfig
                {
                    Width = testCase.NativeWidth,
                    Height = testCase.NativeHeight,
                    Orientation = testCase.Orientation,
                };
                var palette = DashPalette.FromLayout(layout);
                using var expectedPainter = new DashPainter(
                    testCase.LogicalWidth,
                    testCase.LogicalHeight,
                    palette);
                var expectedBitmap = expectedPainter.Render(layout, frame, runtime.Settings);
                var expected = new byte[config.Width * config.Height * 2];
                Rgb565.FromBgra(
                    expectedBitmap.GetPixelSpan(),
                    testCase.LogicalWidth,
                    testCase.LogicalHeight,
                    testCase.PixelRotation,
                    expected);

                using var source = new DashPainterFrameSource(layout, runtime.Settings, config, palette);
                var actual = new byte[config.Width * config.Height * 2];
                source.Render(frame, actual);

                Assert.Equal(expected, actual);
            }
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
            var config = new ScreenConfig { Width = 200, Height = 120, Orientation = DeviceOrientation.Landscape };

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
