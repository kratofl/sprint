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
        public int Frames => Volatile.Read(ref this._frames);

        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            byte value = (byte)Interlocked.Increment(ref this._frames);
            bgra.AsSpan().Fill(value);
            return true;
        }
    }

    [Fact]
    public void SessionUsesFreshHardwareFrameWithoutCapturingTheDesktopAgain()
    {
        LatestBgraFrameExchange sharedFrames = new LatestBgraFrameExchange(16, 9);
        sharedFrames.ProducerBuffer.AsSpan().Fill(0xA5);
        sharedFrames.Publish();
        IncrementingCapturer fallbackCapturer = new IncrementingCapturer();
        using RearViewPreviewSession session = new RearViewPreviewSession(
            new ScreenCaptureRegion(0, 0, 160, 90),
            16,
            9,
            fallbackCapturer,
            targetFps: 30,
            sharedFrames: sharedFrames,
            sharedFrameMaxAge: TimeSpan.FromSeconds(1));
        session.Start();

        byte[] destination = new byte[16 * 9 * 4];
        Stopwatch timeout = Stopwatch.StartNew();
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
        using RearViewPreviewSession session = new RearViewPreviewSession(
            new ScreenCaptureRegion(10, 20, 320, 180),
            64,
            32,
            new IncrementingCapturer(),
            targetFps: 30);
        session.Start();

        byte[] destination = new byte[64 * 32 * 4];
        Stopwatch timeout = Stopwatch.StartNew();
        long version = 0;
        while (timeout.Elapsed < TimeSpan.FromSeconds(2)
               && !session.TryCopyLatest(destination, ref version, out _))
        {
            Thread.Sleep(10);
        }

        Assert.True(version > 0);
        Assert.NotEqual(0, destination[0]);
        RearViewPreviewStatistics stats = session.Statistics;
        Assert.True(stats.FramesPerSecond > 0);
        Assert.True(stats.FrameTime.TotalMilliseconds >= 0);
    }

    [Fact]
    public void CopyReturnsFalseUntilANewerFrameIsAvailable()
    {
        using RearViewPreviewSession session = new RearViewPreviewSession(
            new ScreenCaptureRegion(0, 0, 16, 9),
            16,
            9,
            new IncrementingCapturer(),
            targetFps: 15);

        byte[] destination = new byte[16 * 9 * 4];
        long version = 0;
        Assert.False(session.TryCopyLatest(destination, ref version, out _));
    }
}
