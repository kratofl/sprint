using System.Diagnostics;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class RearViewPreviewSessionTests
{
    private sealed class IncrementingCapturer : IDesktopRegionCapturer
    {
        private int _frames;
        public int Frames => Volatile.Read(ref _frames);

        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            var value = (byte)Interlocked.Increment(ref _frames);
            bgra.AsSpan().Fill(value);
            return true;
        }
    }

    [Fact]
    public void SessionUsesFreshHardwareFrameWithoutCapturingTheDesktopAgain()
    {
        var sharedFrames = new LatestBgraFrameExchange(16, 9);
        sharedFrames.ProducerBuffer.AsSpan().Fill(0xA5);
        sharedFrames.Publish();
        var fallbackCapturer = new IncrementingCapturer();
        using var session = new RearViewPreviewSession(
            new ScreenCaptureRegion(0, 0, 160, 90),
            16,
            9,
            fallbackCapturer,
            targetFps: 30,
            sharedFrames: sharedFrames,
            sharedFrameMaxAge: TimeSpan.FromSeconds(1));
        session.Start();

        var destination = new byte[16 * 9 * 4];
        var timeout = Stopwatch.StartNew();
        long version = 0;
        while (timeout.Elapsed < TimeSpan.FromSeconds(2)
               && !session.TryCopyLatest(destination, ref version, out _))
        {
            Thread.Sleep(10);
        }

        Assert.True(version > 0);
        Assert.All(destination, value => Assert.Equal(0xA5, value));
        Assert.Equal(0, fallbackCapturer.Frames);
    }

    [Fact]
    public void SessionCapturesOffThreadAndPublishesFramesWithTimingStatistics()
    {
        using var session = new RearViewPreviewSession(
            new ScreenCaptureRegion(10, 20, 320, 180),
            64,
            32,
            new IncrementingCapturer(),
            targetFps: 30);
        session.Start();

        var destination = new byte[64 * 32 * 4];
        var timeout = Stopwatch.StartNew();
        long version = 0;
        while (timeout.Elapsed < TimeSpan.FromSeconds(2)
               && !session.TryCopyLatest(destination, ref version, out _))
        {
            Thread.Sleep(10);
        }

        Assert.True(version > 0);
        Assert.NotEqual(0, destination[0]);
        var stats = session.Statistics;
        Assert.True(stats.FramesPerSecond > 0);
        Assert.True(stats.FrameTime.TotalMilliseconds >= 0);
    }

    [Fact]
    public void CopyReturnsFalseUntilANewerFrameIsAvailable()
    {
        using var session = new RearViewPreviewSession(
            new ScreenCaptureRegion(0, 0, 16, 9),
            16,
            9,
            new IncrementingCapturer(),
            targetFps: 15);

        var destination = new byte[16 * 9 * 4];
        long version = 0;
        Assert.False(session.TryCopyLatest(destination, ref version, out _));
    }
}
