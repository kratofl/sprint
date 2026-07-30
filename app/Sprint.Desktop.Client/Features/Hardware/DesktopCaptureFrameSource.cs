using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Captures a physical desktop rectangle and scales it into a caller-owned BGRA
/// buffer. Implementations may be platform-specific; the frame source stays
/// deterministic and injectable for tests.
/// </summary>
public interface IDesktopRegionCapturer
{
    bool TryCapture(
        ScreenCaptureRegion region,
        int destinationWidth,
        int destinationHeight,
        byte[] bgra);
}

/// <summary>
/// Rear-view frame source: desktop capture at the screen's logical orientation,
/// followed by the same rotation, margin, and offset pipeline as dashboards.
/// </summary>
public sealed class DesktopCaptureFrameSource : IDashFrameSource
{
    private readonly ScreenCaptureRegion _region;
    private readonly ScreenConfig _config;
    private readonly IDesktopRegionCapturer _capturer;
    private readonly int _logicalWidth;
    private readonly int _logicalHeight;
    private readonly int _pixelRotation;
    private readonly byte[] _bgra;
    private readonly byte[] _scratch;

    public DesktopCaptureFrameSource(
        ScreenCaptureRegion region,
        ScreenConfig config,
        IDesktopRegionCapturer capturer)
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
        var transform = CaptureSelectionGeometry.FrameTransform(Width, Height, config.Rotation);
        _logicalWidth = transform.LogicalWidth;
        _logicalHeight = transform.LogicalHeight;
        _pixelRotation = transform.PixelRotation;
        _bgra = new byte[checked(_logicalWidth * _logicalHeight * 4)];
        _scratch = new byte[checked(Width * Height * 2)];
    }

    public int Width { get; }

    public int Height { get; }

    public void Render(TelemetryFrame frame, Span<byte> rgb565)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (rgb565.Length < Width * Height * 2)
        {
            throw new ArgumentException("Destination buffer too small for the native screen.", nameof(rgb565));
        }

        if (!_capturer.TryCapture(_region, _logicalWidth, _logicalHeight, _bgra))
        {
            throw new InvalidOperationException("Windows could not capture the selected desktop area.");
        }

        if (_config.Margin > 0)
        {
            Rgb565.FromBgra(_bgra, _logicalWidth, _logicalHeight, _pixelRotation, _scratch);
            Rgb565.ApplyMargin(_scratch, rgb565, Width, Height, _config.Margin);
        }
        else
        {
            Rgb565.FromBgra(_bgra, _logicalWidth, _logicalHeight, _pixelRotation, rgb565);
        }

        Rgb565.ApplyOffset(rgb565, Width, Height, _config.OffsetX, _config.OffsetY, _pixelRotation);
    }

    public void Dispose()
    {
    }
}
