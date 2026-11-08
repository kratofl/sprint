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

    public ScreenPerformanceSnapshot Snapshot => Volatile.Read(ref this._snapshot);

    public void RecordFrame(
        long completedAt,
        ScreenFrameTiming renderTiming,
        TimeSpan usbTransferTime,
        TimeSpan totalFrameTime,
        ScreenFrameDisposition disposition)
    {
        this._framesRendered++;
        if (disposition == ScreenFrameDisposition.Sent)
        {
            this._framesSent++;
            this._sourceTime = renderTiming.SourceTime;
            this._pixelTransformTime = renderTiming.PixelTransformTime;
            this._renderTime = renderTiming.FrameTime;
            this._usbTransferTime = usbTransferTime;
            this._totalFrameTime = totalFrameTime;
            if (this._lastSentTimestamp != 0)
            {
                TimeSpan interval = Stopwatch.GetElapsedTime(this._lastSentTimestamp, completedAt);
                if (interval > TimeSpan.Zero)
                {
                    double instantaneousFps = 1d / interval.TotalSeconds;
                    this._renderFps = this._renderFps <= 0
                        ? instantaneousFps
                        : this._renderFps * 0.8 + instantaneousFps * 0.2;
                }
            }

            this._lastSentTimestamp = completedAt;
        }
        else if (disposition == ScreenFrameDisposition.Skipped)
        {
            this._framesSkipped++;
        }

        if (disposition != ScreenFrameDisposition.Sent
            && this._lastSentTimestamp != 0
            && Stopwatch.GetElapsedTime(this._lastSentTimestamp, completedAt) >= OutputFpsIdleAfter)
        {
            this._renderFps = 0;
        }

        this.Publish();
    }

    private void Publish() =>
        Volatile.Write(
            ref this._snapshot,
            new ScreenPerformanceSnapshot(
                this._renderFps,
                this._sourceTime,
                this._pixelTransformTime,
                this._renderTime,
                this._usbTransferTime,
                this._totalFrameTime,
                this._framesRendered,
                this._framesSent,
                this._framesSkipped));
}
