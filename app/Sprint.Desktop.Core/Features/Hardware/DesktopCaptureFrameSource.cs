using System.Diagnostics;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Rear-view frame source: desktop capture at the screen's logical orientation,
/// followed by the same rotation, margin, and offset pipeline as dashboards. Always
/// composes through the managed <see cref="Rgb565.ComposeFromBgra"/> path — the
/// SkiaSharp-accelerated composer the Avalonia client used for this was UI-only and
/// did not survive the web/Electron cutover; nothing here depends on it for
/// correctness, only for the fast path's throughput.
/// </summary>
public sealed class DesktopCaptureFrameSource : IDashFrameSource
{
    private readonly ScreenCaptureRegion _region;
    private readonly ScreenConfig _config;
    private readonly IDesktopRegionCapturer _capturer;
    private readonly int _logicalWidth;
    private readonly int _logicalHeight;
    private readonly DeviceOrientationTransform _transform;
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

        _region = region;
        _config = config;
        _capturer = capturer;
        Width = config.Width;
        Height = config.Height;
        _transform = DeviceOrientations.Transform(
            Width,
            Height,
            config.Orientation);
        _logicalWidth = _transform.LogicalWidth;
        _logicalHeight = _transform.LogicalHeight;
        if (sharedFrames is not null
            && (sharedFrames.Width != _logicalWidth || sharedFrames.Height != _logicalHeight))
        {
            throw new ArgumentException(
                "Shared capture dimensions must match the frame source's logical size.",
                nameof(sharedFrames));
        }

        _sharedFrames = sharedFrames;
        _bgra = sharedFrames is null
            ? new byte[checked(_logicalWidth * _logicalHeight * 4)]
            : null;
    }

    public int Width { get; }

    public int Height { get; }

    public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (rgb565.Length < Width * Height * 2)
        {
            throw new ArgumentException("Destination buffer too small for the native screen.", nameof(rgb565));
        }

        var sourceStarted = Stopwatch.GetTimestamp();
        var bgra = _sharedFrames?.ProducerBuffer ?? _bgra!;
        if (!_capturer.TryCapture(_region, _logicalWidth, _logicalHeight, bgra))
        {
            throw new InvalidOperationException("Windows could not capture the selected desktop area.");
        }

        var sourceCompleted = Stopwatch.GetTimestamp();
        _sharedFrames?.Publish();
        var transformStarted = sourceCompleted;
        Rgb565.ComposeFromBgra(
            bgra,
            Width,
            Height,
            _transform,
            _config.Margin,
            _config.OffsetX,
            _config.OffsetY,
            rgb565);
        var transformCompleted = Stopwatch.GetTimestamp();
        return new ScreenFrameTiming(
            Stopwatch.GetElapsedTime(sourceStarted, sourceCompleted),
            Stopwatch.GetElapsedTime(transformStarted, transformCompleted));
    }

    public void Dispose()
    {
    }
}
