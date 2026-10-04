using System.Diagnostics;
using System.Runtime.InteropServices;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Runtime;
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
}
