using System.Diagnostics;
using System.Runtime.InteropServices;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Runtime;
using SkiaSharp;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class ScreenPipelineTests
{
    [Fact]
    public void PerformanceTrackerAccountsForEveryFrameStage()
    {
        var tracker = new ScreenPerformanceTracker();
        var renderedAt = Stopwatch.GetTimestamp();

        tracker.RecordFrame(
            renderedAt,
            new ScreenFrameTiming(
                TimeSpan.FromMilliseconds(6),
                TimeSpan.FromMilliseconds(4)),
            TimeSpan.FromMilliseconds(3),
            TimeSpan.FromMilliseconds(14),
            ScreenFrameDisposition.Sent);

        var performance = tracker.Snapshot;
        Assert.Equal(TimeSpan.FromMilliseconds(6), performance.SourceTime);
        Assert.Equal(TimeSpan.FromMilliseconds(4), performance.PixelTransformTime);
        Assert.Equal(TimeSpan.FromMilliseconds(10), performance.FrameTime);
        Assert.Equal(TimeSpan.FromMilliseconds(3), performance.UsbTransferTime);
        Assert.Equal(TimeSpan.FromMilliseconds(14), performance.TotalFrameTime);
        Assert.Equal(1, performance.FramesRendered);
        Assert.Equal(1, performance.FramesSent);
        Assert.Equal(0, performance.FramesSkipped);
    }

    [Fact]
    public void SkippedFramesPreserveDeliveredTimingsAndExpireOutputFps()
    {
        var tracker = new ScreenPerformanceTracker();
        var firstSentAt = Stopwatch.GetTimestamp();
        var secondSentAt = firstSentAt + Stopwatch.Frequency / 25;
        tracker.RecordFrame(
            firstSentAt,
            new ScreenFrameTiming(
                TimeSpan.FromMilliseconds(6),
                TimeSpan.FromMilliseconds(4)),
            TimeSpan.FromMilliseconds(3),
            TimeSpan.FromMilliseconds(13),
            ScreenFrameDisposition.Sent);
        tracker.RecordFrame(
            secondSentAt,
            new ScreenFrameTiming(
                TimeSpan.FromMilliseconds(5),
                TimeSpan.FromMilliseconds(2)),
            TimeSpan.FromMilliseconds(4),
            TimeSpan.FromMilliseconds(11),
            ScreenFrameDisposition.Sent);

        tracker.RecordFrame(
            secondSentAt + Stopwatch.Frequency * 2,
            new ScreenFrameTiming(
                TimeSpan.FromMilliseconds(1),
                TimeSpan.FromMilliseconds(1)),
            TimeSpan.Zero,
            TimeSpan.FromMilliseconds(2),
            ScreenFrameDisposition.Skipped);

        var performance = tracker.Snapshot;
        Assert.Equal(0, performance.FramesPerSecond);
        Assert.Equal(TimeSpan.FromMilliseconds(5), performance.SourceTime);
        Assert.Equal(TimeSpan.FromMilliseconds(2), performance.PixelTransformTime);
        Assert.Equal(TimeSpan.FromMilliseconds(7), performance.FrameTime);
        Assert.Equal(TimeSpan.FromMilliseconds(4), performance.UsbTransferTime);
        Assert.Equal(TimeSpan.FromMilliseconds(11), performance.TotalFrameTime);
        Assert.Equal(3, performance.FramesRendered);
        Assert.Equal(2, performance.FramesSent);
        Assert.Equal(1, performance.FramesSkipped);
    }

    private sealed class ConstantFrameSource(int width, int height) : IDashFrameSource
    {
        public int Width => width;
        public int Height => height;
        public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
        {
            rgb565.Fill(0xAB);
            return new ScreenFrameTiming(TimeSpan.FromMilliseconds(2), TimeSpan.FromMilliseconds(1));
        }

        public void Dispose() { }
    }

    private sealed class CoordinatedFrameSource : IDashFrameSource
    {
        private int _frames;

        public int Width => 8;
        public int Height => 8;
        public ManualResetEventSlim SecondRenderStarted { get; } = new();

        public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
        {
            var rendered = Interlocked.Increment(ref _frames);
            rgb565.Fill((byte)rendered);
            if (rendered == 2)
            {
                SecondRenderStarted.Set();
            }

            return new ScreenFrameTiming(TimeSpan.Zero, TimeSpan.Zero);
        }

        public void Dispose() => SecondRenderStarted.Dispose();
    }

    private sealed class BlockingScreenDriver : IScreenDriver
    {
        private ScreenStatus _status = ScreenStatus.Disconnected();
        private int _framesSent;

        public string Name => "Blocking screen";
        public ScreenStatus Status => _status;
        public ScreenNativeSize? NativeSize => new(8, 8);
        public ManualResetEventSlim FirstTransferStarted { get; } = new();
        public ManualResetEventSlim AllowFirstTransfer { get; } = new();
        public int FramesSent => Volatile.Read(ref _framesSent);

        public void Configure(ScreenConfig config)
        {
        }

        public bool Connect()
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Connected };
            return true;
        }

        public bool TrySendFrame(byte[] rgb565)
        {
            if (Interlocked.Increment(ref _framesSent) == 1)
            {
                FirstTransferStarted.Set();
                AllowFirstTransfer.Wait(TimeSpan.FromSeconds(2));
            }

            return true;
        }

        public void Disconnect() => _status = ScreenStatus.Disconnected();

        public void Dispose()
        {
            AllowFirstTransfer.Set();
            FirstTransferStarted.Dispose();
            AllowFirstTransfer.Dispose();
        }
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

    [Fact]
    public void PublisherRendersTheNextFrameWhileThePreviousUsbTransferIsInFlight()
    {
        var driver = new BlockingScreenDriver();
        var source = new CoordinatedFrameSource();
        using var publisher = new ScreenPublisher(
            driver,
            source,
            () => new TelemetryFrame(),
            new ScreenPublisherOptions { TargetFps = 60 });
        try
        {
            publisher.Start();

            Assert.True(driver.FirstTransferStarted.Wait(TimeSpan.FromSeconds(1)));
            Assert.True(
                source.SecondRenderStarted.Wait(TimeSpan.FromSeconds(1)),
                "The next source frame did not begin until the blocking USB transfer completed.");
        }
        finally
        {
            driver.AllowFirstTransfer.Set();
        }
    }

    private sealed class ThrowingFrameSource : IDashFrameSource
    {
        public int Width => 8;
        public int Height => 8;
        public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565) =>
            throw new InvalidOperationException("boom");
        public void Dispose() { }
    }

    private sealed class RecoveringFrameSource : IDashFrameSource
    {
        public int Width => 8;
        public int Height => 8;
        public bool Failing { get; set; } = true;

        public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
        {
            if (Failing)
            {
                throw new InvalidOperationException("capture unavailable");
            }

            rgb565.Fill(0x1f);
            return new ScreenFrameTiming(TimeSpan.Zero, TimeSpan.Zero);
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
        Assert.Equal(2, publisher.Performance.FramesRendered);
        Assert.Equal(1, publisher.Performance.FramesSent);
        Assert.Equal(1, publisher.Performance.FramesSkipped);
    }

    [Fact]
    public void PublisherReportsActualScreenOutputFpsAndFrameTime()
    {
        var driver = new FakeScreenDriver { ConnectResult = ScreenConnectionState.Connected };
        using var publisher = new ScreenPublisher(
            driver,
            new CoordinatedFrameSource(),
            () => new TelemetryFrame());

        Assert.Equal(ScreenStepOutcome.SentFrame, publisher.Step());
        Thread.Sleep(20);
        Assert.Equal(ScreenStepOutcome.SentFrame, publisher.Step());

        var performance = publisher.Performance;
        Assert.True(performance.HasSamples);
        Assert.Equal(2, performance.FramesRendered);
        Assert.Equal(2, performance.FramesSent);
        Assert.Equal(0, performance.FramesSkipped);
        Assert.True(performance.FramesPerSecond > 0);
        Assert.True(performance.FrameTime >= TimeSpan.Zero);
        Assert.Equal(
            performance.FrameTime + performance.UsbTransferTime,
            performance.TotalFrameTime);
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
    public void DashPainterCanRenderIntoACallerOwnedRgb565Surface()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);
            var pixels = new byte[80 * 48 * 2];
            var pinned = GCHandle.Alloc(pixels, GCHandleType.Pinned);
            try
            {
                var info = new SKImageInfo(
                    80,
                    48,
                    SKColorType.Rgb565,
                    SKAlphaType.Opaque);
                using var surface = SKSurface.Create(
                    info,
                    pinned.AddrOfPinnedObject(),
                    80 * 2);
                Assert.NotNull(surface);
                using var painter = new DashPainter(
                    80,
                    48,
                    DashPalette.FromLayout(layout));

                painter.RenderToSurface(
                    surface,
                    layout,
                    new TelemetryFrame
                    {
                        Car = new CarState { Gear = 3, Rpm = 7000, MaxRpm = 9000 },
                    },
                    runtime.Settings);

                Assert.Contains(pixels, value => value != 0);
            }
            finally
            {
                pinned.Free();
            }
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
                    Margin = 3,
                    OffsetX = 2,
                    OffsetY = 1,
                };
                var palette = DashPalette.FromLayout(layout);
                using var expectedPainter = new DashPainter(
                    testCase.LogicalWidth,
                    testCase.LogicalHeight,
                    palette);
                var expectedBitmap = expectedPainter.Render(layout, frame, runtime.Settings);
                var converted = new byte[config.Width * config.Height * 2];
                Rgb565.FromBgra(
                    expectedBitmap.GetPixelSpan(),
                    testCase.LogicalWidth,
                    testCase.LogicalHeight,
                    testCase.PixelRotation,
                    converted);
                var expected = new byte[converted.Length];
                Rgb565.ApplyMargin(
                    converted,
                    expected,
                    config.Width,
                    config.Height,
                    config.Margin);
                Rgb565.ApplyOffset(
                    expected,
                    config.Width,
                    config.Height,
                    config.OffsetX,
                    config.OffsetY,
                    testCase.PixelRotation);

                using var source = new DashPainterFrameSource(
                    layout,
                    runtime.Settings,
                    config,
                    palette,
                    preferDirectRgb565: false);
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
    public void DashboardFramesApplyScreenSpaceOffsetsForEveryOrientation()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);
            var cases = new[]
            {
                (Width: 120, Height: 200, Orientation: DeviceOrientation.Portrait),
                (Width: 120, Height: 200, Orientation: DeviceOrientation.Landscape),
                (Width: 120, Height: 200, Orientation: DeviceOrientation.PortraitInverted),
                (Width: 120, Height: 200, Orientation: DeviceOrientation.LandscapeInverted),
                (Width: 200, Height: 120, Orientation: DeviceOrientation.Portrait),
                (Width: 200, Height: 120, Orientation: DeviceOrientation.Landscape),
                (Width: 200, Height: 120, Orientation: DeviceOrientation.PortraitInverted),
                (Width: 200, Height: 120, Orientation: DeviceOrientation.LandscapeInverted),
            };

            foreach (var testCase in cases)
            {
                var config = new ScreenConfig
                {
                    Width = testCase.Width,
                    Height = testCase.Height,
                    Orientation = testCase.Orientation,
                    Margin = 1,
                    OffsetX = 3,
                    OffsetY = 2,
                };
                using var source = new DashPainterFrameSource(
                    layout,
                    runtime.Settings,
                    config,
                    DashPalette.FromLayout(layout));
                var actual = new byte[config.Width * config.Height * 2];

                source.Render(new TelemetryFrame(), actual);

                Assert.Contains(actual, value => value != 0);
                var rotation = DeviceOrientations.Transform(
                    config.Width,
                    config.Height,
                    config.Orientation).PixelRotation;
                AssertClearedOffsetEdges(
                    actual,
                    config.Width,
                    config.Height,
                    rotation,
                    config.OffsetX,
                    config.OffsetY);
            }
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void DirectRgb565DashboardOutputStaysCloseToTheFusedReferenceForEveryOrientation()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);
            var palette = DashPalette.FromLayout(layout);
            var frame = new TelemetryFrame
            {
                Car = new CarState
                {
                    Gear = 4,
                    SpeedMetersPerSecond = 51.67f,
                    Rpm = 7425,
                    MaxRpm = 9000,
                },
                Lap = new LapState
                {
                    CurrentLap = 7,
                    CurrentLapTime = 82.413,
                    LastLapTime = 81.972,
                    BestLapTime = 81.404,
                },
            };
            var cases = new[]
            {
                (Width: 120, Height: 200, Orientation: DeviceOrientation.Portrait),
                (Width: 120, Height: 200, Orientation: DeviceOrientation.Landscape),
                (Width: 120, Height: 200, Orientation: DeviceOrientation.PortraitInverted),
                (Width: 120, Height: 200, Orientation: DeviceOrientation.LandscapeInverted),
                (Width: 200, Height: 120, Orientation: DeviceOrientation.Portrait),
                (Width: 200, Height: 120, Orientation: DeviceOrientation.Landscape),
                (Width: 200, Height: 120, Orientation: DeviceOrientation.PortraitInverted),
                (Width: 200, Height: 120, Orientation: DeviceOrientation.LandscapeInverted),
            };

            foreach (var testCase in cases)
            {
                var config = new ScreenConfig
                {
                    Width = testCase.Width,
                    Height = testCase.Height,
                    Orientation = testCase.Orientation,
                    Margin = 3,
                    OffsetX = 2,
                    OffsetY = 1,
                };
                using var direct = new DashPainterFrameSource(
                    layout,
                    runtime.Settings,
                    config,
                    palette);
                using var fallback = new DashPainterFrameSource(
                    layout,
                    runtime.Settings,
                    config,
                    palette,
                    preferDirectRgb565: false);
                var directPixels = new byte[config.Width * config.Height * 2];
                var fallbackPixels = new byte[directPixels.Length];

                direct.Render(frame, directPixels);
                fallback.Render(frame, fallbackPixels);

                Rgb565Similarity.AssertLooksTheSame(
                    fallbackPixels,
                    directPixels,
                    config.Width,
                    config.Height,
                    $"direct RGB565 dashboard at {config.Width}x{config.Height} {config.Orientation}");
            }
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void DirectRgb565DashboardSourceDoesNotRegressManagedAllocation()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);
            var config = new ScreenConfig
            {
                Width = 320,
                Height = 240,
                Orientation = DeviceOrientation.Landscape,
            };
            using var source = new DashPainterFrameSource(
                layout,
                runtime.Settings,
                config,
                DashPalette.FromLayout(layout));
            using var fallback = new DashPainterFrameSource(
                layout,
                runtime.Settings,
                config,
                DashPalette.FromLayout(layout),
                preferDirectRgb565: false);
            var destination = new byte[config.Width * config.Height * 2];
            var fallbackDestination = new byte[destination.Length];
            var frame = new TelemetryFrame
            {
                Car = new CarState
                {
                    Gear = 4,
                    SpeedMetersPerSecond = 51.67f,
                    Rpm = 7425,
                    MaxRpm = 9000,
                },
            };
            source.Render(frame, destination);
            fallback.Render(frame, fallbackDestination);

            const int frames = 50;
            var allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
            for (var index = 0; index < frames; index++)
            {
                source.Render(frame, destination);
            }

            var directBytes = GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
            allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
            for (var index = 0; index < frames; index++)
            {
                fallback.Render(frame, fallbackDestination);
            }

            var fallbackBytes = GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
            Assert.True(
                directBytes <= fallbackBytes + frames * 64,
                $"Expected no direct-path allocation regression; direct={directBytes / frames} B/frame, " +
                $"fallback={fallbackBytes / frames} B/frame.");
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static void AssertClearedOffsetEdges(
        byte[] rgb565,
        int width,
        int height,
        PixelRotation rotation,
        int offsetX,
        int offsetY)
    {
        var left = rotation switch
        {
            PixelRotation.None => offsetX,
            PixelRotation.Clockwise270 => offsetY,
            _ => 0,
        };
        var right = rotation switch
        {
            PixelRotation.Clockwise90 => offsetY,
            PixelRotation.Clockwise180 => offsetX,
            _ => 0,
        };
        var top = rotation switch
        {
            PixelRotation.None => offsetY,
            PixelRotation.Clockwise90 => offsetX,
            _ => 0,
        };
        var bottom = rotation switch
        {
            PixelRotation.Clockwise180 => offsetY,
            PixelRotation.Clockwise270 => offsetX,
            _ => 0,
        };

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                if (x >= left && x < width - right && y >= top && y < height - bottom)
                {
                    continue;
                }

                var index = (y * width + x) * 2;
                Assert.Equal(0, rgb565[index]);
                Assert.Equal(0, rgb565[index + 1]);
            }
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
