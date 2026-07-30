using System.Diagnostics;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Single-thread-owned accumulator for screen-render measurements. The publisher
/// records events; the UI reads an immutable snapshot without taking a lock.
/// </summary>
internal sealed class ScreenPerformanceTracker
{
    private ScreenPerformanceSnapshot _snapshot = ScreenPerformanceSnapshot.Empty;
    private long _framesRendered;
    private long _framesSent;
    private long _framesSkipped;
    private long _lastRenderedTimestamp;
    private double _renderFps;
    private TimeSpan _renderTime;

    public ScreenPerformanceSnapshot Snapshot => Volatile.Read(ref _snapshot);

    public void RecordRendered(long startedAt, long completedAt)
    {
        _framesRendered++;
        _renderTime = Stopwatch.GetElapsedTime(startedAt, completedAt);
        if (_lastRenderedTimestamp != 0)
        {
            var interval = Stopwatch.GetElapsedTime(_lastRenderedTimestamp, completedAt);
            if (interval > TimeSpan.Zero)
            {
                var instantaneousFps = 1d / interval.TotalSeconds;
                _renderFps = _renderFps <= 0
                    ? instantaneousFps
                    : _renderFps * 0.8 + instantaneousFps * 0.2;
            }
        }

        _lastRenderedTimestamp = completedAt;
        Publish();
    }

    public void RecordSent()
    {
        _framesSent++;
        Publish();
    }

    public void RecordSkipped()
    {
        _framesSkipped++;
        Publish();
    }

    private void Publish() =>
        Volatile.Write(
            ref _snapshot,
            new ScreenPerformanceSnapshot(
                _renderFps,
                _renderTime,
                _framesRendered,
                _framesSent,
                _framesSkipped));
}
