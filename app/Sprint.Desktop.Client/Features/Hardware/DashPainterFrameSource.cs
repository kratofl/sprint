using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Bridges the WS6 <see cref="DashPainter"/> onto the WS7 hardware pipeline: it
/// renders the active dash layout for a frame, converts the BGRA output to the
/// screen's native RGB565 (rotation → margin → offset), and yields a buffer the
/// driver can push over USB. Owns its painter; not thread-safe (the render loop
/// owns one instance).
/// </summary>
public sealed class DashPainterFrameSource : IDashFrameSource
{
    private readonly DashPainter _painter;
    private readonly AppSettings _settings;
    private readonly ScreenConfig _config;
    private readonly byte[] _scratch;
    private readonly DashPalette _palette;
    private readonly DashAlertTracker _alerts = new();
    private DashLayout _layout;
    private bool _idle;

    public DashPainterFrameSource(DashLayout layout, AppSettings settings, ScreenConfig config, DashPalette? palette = null)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(config);

        _layout = layout;
        _settings = settings;
        _config = config;
        Width = config.Width;
        Height = config.Height;

        // The painter renders at the logical size that, once rotated, fills the
        // native screen: 90/270 swap the axes.
        var (logicalW, logicalH) = config.Rotation is 90 or 270 ? (Height, Width) : (Width, Height);
        _palette = palette ?? DashPalette.Default;
        _painter = new DashPainter(logicalW, logicalH, _palette);
        _scratch = new byte[Width * Height * 2];
    }

    public int Width { get; }

    public int Height { get; }

    public void SetLayout(DashLayout layout)
    {
        _layout = layout ?? throw new ArgumentNullException(nameof(layout));
        _alerts.Reset();
    }

    public void SetIdle(bool idle) => _idle = idle;

    public void Render(TelemetryFrame frame, Span<byte> rgb565)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (rgb565.Length < Width * Height * 2)
        {
            throw new ArgumentException("Destination buffer too small for the native screen.", nameof(rgb565));
        }

        var banner = _idle ? null : _alerts.Evaluate(_layout, frame, _palette);
        var bitmap = _painter.Render(_layout, frame, _settings, idle: _idle, banner: banner);
        var bgra = bitmap.GetPixelSpan();

        if (_config.Margin > 0)
        {
            Rgb565.FromBgra(bgra, _painter.Width, _painter.Height, _config.Rotation, _scratch);
            Rgb565.ApplyMargin(_scratch, rgb565, Width, Height, _config.Margin);
        }
        else
        {
            Rgb565.FromBgra(bgra, _painter.Width, _painter.Height, _config.Rotation, rgb565);
        }

        Rgb565.ApplyOffset(rgb565, Width, Height, _config.OffsetX, _config.OffsetY, _config.Rotation);
    }

    public void Dispose() => _painter.Dispose();
}
