using System.Diagnostics;

namespace Sprint.Desktop.Features.Hardware;

internal enum ScreenFrameDisposition
{
    Rendered,
    Sent,
    Skipped,
}

/// <summary>
/// Single-thread-owned accumulator for screen-render measurements. The publisher
/// records events; the UI reads an immutable snapshot without taking a lock.
/// </summary>
internal sealed class ScreenPerformanceTracker
{
    private static readonly TimeSpan OutputFpsIdleAfter = TimeSpan.FromSeconds(1);

    private ScreenPerformanceSnapshot _snapshot = ScreenPerformanceSnapshot.Empty;
    private long _framesRendered;
    private long _framesSent;
    private long _framesSkipped;
    private long _lastSentTimestamp;
    private double _renderFps;
    private TimeSpan _sourceTime;
    private TimeSpan _pixelTransformTime;
    private TimeSpan _renderTime;
    private TimeSpan _usbTransferTime;
    private TimeSpan _totalFrameTime;

    public ScreenPerformanceSnapshot Snapshot => Volatile.Read(ref _snapshot);

    public void RecordFrame(
        long completedAt,
        ScreenFrameTiming renderTiming,
        TimeSpan usbTransferTime,
        TimeSpan totalFrameTime,
        ScreenFrameDisposition disposition)
    {
        _framesRendered++;
        if (disposition == ScreenFrameDisposition.Sent)
        {
            _framesSent++;
            _sourceTime = renderTiming.SourceTime;
            _pixelTransformTime = renderTiming.PixelTransformTime;
            _renderTime = renderTiming.FrameTime;
            _usbTransferTime = usbTransferTime;
            _totalFrameTime = totalFrameTime;
            if (_lastSentTimestamp != 0)
            {
                var interval = Stopwatch.GetElapsedTime(_lastSentTimestamp, completedAt);
                if (interval > TimeSpan.Zero)
                {
                    var instantaneousFps = 1d / interval.TotalSeconds;
                    _renderFps = _renderFps <= 0
                        ? instantaneousFps
                        : _renderFps * 0.8 + instantaneousFps * 0.2;
                }
            }

            _lastSentTimestamp = completedAt;
        }
        else if (disposition == ScreenFrameDisposition.Skipped)
        {
            _framesSkipped++;
        }

        if (disposition != ScreenFrameDisposition.Sent
            && _lastSentTimestamp != 0
            && Stopwatch.GetElapsedTime(_lastSentTimestamp, completedAt) >= OutputFpsIdleAfter)
        {
            _renderFps = 0;
        }

        Publish();
    }

    private void Publish() =>
        Volatile.Write(
            ref _snapshot,
            new ScreenPerformanceSnapshot(
                _renderFps,
                _sourceTime,
                _pixelTransformTime,
                _renderTime,
                _usbTransferTime,
                _totalFrameTime,
                _framesRendered,
                _framesSent,
                _framesSkipped));
}
