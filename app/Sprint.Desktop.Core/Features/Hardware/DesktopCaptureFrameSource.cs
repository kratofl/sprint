using System.Diagnostics;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Rear-view frame source: desktop capture at the screen's logical orientation,
/// followed by the same rotation, margin, and offset pipeline as dashboards. Always
/// composes through the managed <see cref="Rgb565Composer"/> path — the
/// SkiaSharp-accelerated composer the Avalonia client used for this was UI-only and
/// did not survive the web/Electron cutover; nothing here depends on it for
/// correctness, only for the fast path's throughput.
/// </summary>
public sealed class DesktopCaptureFrameSource : IDashFrameSource
{
    private readonly ScreenCaptureRegion _region;
    private readonly IDesktopRegionCapturer _capturer;
    private readonly int _logicalWidth;
    private readonly int _logicalHeight;
    private readonly Rgb565Composer _composer;
    private readonly LatestBgraFrameExchange? _sharedFrames;
    private readonly byte[]? _bgra;

    public DesktopCaptureFrameSource(
        ScreenCaptureRegion region,
        ScreenConfig config,
        IDesktopRegionCapturer capturer)
        : this(region, config, capturer, sharedFrames: null)
    {
    }

    internal DesktopCaptureFrameSource(
        ScreenCaptureRegion region,
        ScreenConfig config,
        IDesktopRegionCapturer capturer,
        LatestBgraFrameExchange? sharedFrames)
    {
        ArgumentNullException.ThrowIfNull(region);
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(capturer);
        if (!region.IsValid)
        {
            throw new ArgumentOutOfRangeException(nameof(region));
        }

        this._region = region;
        this._capturer = capturer;
        this.Width = config.Width;
        this.Height = config.Height;
        DeviceOrientationTransform transform = DeviceOrientations.Transform(
            this.Width,
            this.Height,
            config.Orientation);
        this._logicalWidth = transform.LogicalWidth;
        this._logicalHeight = transform.LogicalHeight;
        this._composer = new Rgb565Composer(
            this.Width,
            this.Height,
            transform,
            config.Margin,
            config.OffsetX,
            config.OffsetY);
        if (sharedFrames is not null
            && (sharedFrames.Width != this._logicalWidth || sharedFrames.Height != this._logicalHeight))
        {
            throw new ArgumentException(
                "Shared capture dimensions must match the frame source's logical size.",
                nameof(sharedFrames));
        }

        this._sharedFrames = sharedFrames;
        this._bgra = sharedFrames is null
            ? new byte[checked(this._logicalWidth * this._logicalHeight * 4)]
            : null;
    }

    public int Width { get; }

    public int Height { get; }

    public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (rgb565.Length < this.Width * this.Height * 2)
        {
            throw new ArgumentException("Destination buffer too small for the native screen.", nameof(rgb565));
        }

        long sourceStarted = Stopwatch.GetTimestamp();
        byte[] bgra = this._sharedFrames?.ProducerBuffer ?? this._bgra!;
        if (!this._capturer.TryCapture(this._region, this._logicalWidth, this._logicalHeight, bgra))
        {
            throw new InvalidOperationException("Windows could not capture the selected desktop area.");
        }

        long sourceCompleted = Stopwatch.GetTimestamp();
        this._sharedFrames?.Publish();
        long transformStarted = sourceCompleted;
        this._composer.Compose(bgra, rgb565);
        long transformCompleted = Stopwatch.GetTimestamp();
        return new ScreenFrameTiming(
            Stopwatch.GetElapsedTime(sourceStarted, sourceCompleted),
            Stopwatch.GetElapsedTime(transformStarted, transformCompleted));
    }

    public void Dispose()
    {
    }
}
