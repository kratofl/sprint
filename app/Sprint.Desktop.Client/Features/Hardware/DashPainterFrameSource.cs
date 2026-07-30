using System.Diagnostics;
using System.Runtime.InteropServices;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Runtime;
using SkiaSharp;

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
    private readonly DeviceOrientationTransform _transform;
    private readonly byte[]? _directPixels;
    private GCHandle _directPixelsHandle;
    private readonly SKSurface? _directSurface;
    private readonly SKMatrix _directOutputTransform;
    private DashPalette _palette;
    private readonly DashAlertTracker _alerts = new();
    private DashLayout _layout;
    private bool _idle;

    public DashPainterFrameSource(DashLayout layout, AppSettings settings, ScreenConfig config, DashPalette? palette = null)
        : this(layout, settings, config, palette, preferDirectRgb565: true)
    {
    }

    internal DashPainterFrameSource(
        DashLayout layout,
        AppSettings settings,
        ScreenConfig config,
        DashPalette? palette,
        bool preferDirectRgb565)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(config);

        _layout = layout;
        _settings = settings;
        _config = config;
        Width = config.Width;
        Height = config.Height;

        _transform = DeviceOrientations.Transform(
            Width,
            Height,
            config.Orientation);
        _palette = palette ?? DashPalette.Default;
        _painter = new DashPainter(
            _transform.LogicalWidth,
            _transform.LogicalHeight,
            _palette);
        _directOutputTransform = ScreenCanvasTransform.Create(
            Width,
            Height,
            _transform,
            _config.Margin,
            _config.OffsetX,
            _config.OffsetY);
        // Direct RGB565 was adopted only after the opt-in rendering diagnostic
        // demonstrated a large speedup with bounded whole-frame and localized
        // visual error across representative panel sizes. Keep the fallback
        // constructor seam so that decision remains reproducible.
        if (preferDirectRgb565
            && Width - _config.Margin * 2 > 0
            && Height - _config.Margin * 2 > 0)
        {
            var pixels = new byte[checked(Width * Height * 2)];
            _directPixelsHandle = GCHandle.Alloc(pixels, GCHandleType.Pinned);
            try
            {
                _directSurface = SKSurface.Create(
                    new SKImageInfo(
                        Width,
                        Height,
                        SKColorType.Rgb565,
                        SKAlphaType.Opaque),
                    _directPixelsHandle.AddrOfPinnedObject(),
                    Width * 2);
            }
            catch
            {
                _directPixelsHandle.Free();
                throw;
            }

            if (_directSurface is null)
            {
                _directPixelsHandle.Free();
            }
            else
            {
                _directPixels = pixels;
            }
        }
    }

    public int Width { get; }

    public int Height { get; }

    public void SetLayout(DashLayout layout)
    {
        _layout = layout ?? throw new ArgumentNullException(nameof(layout));
        _alerts.Reset();
    }

    public void SetIdle(bool idle) => _idle = idle;

    public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (rgb565.Length < Width * Height * 2)
        {
            throw new ArgumentException("Destination buffer too small for the native screen.", nameof(rgb565));
        }

        var sourceStarted = Stopwatch.GetTimestamp();
        // The layout instance is shared with the editor and mutated in place, so
        // widget edits arrive automatically — but the palette is resolved state.
        // Re-resolve it each frame (record equality, cheap) so a live theme
        // change recolors the hardware screen without a publisher restart.
        var palette = DashPalette.FromLayout(_layout);
        if (palette != _palette)
        {
            _palette = palette;
            _painter.SetPalette(palette);
        }

        var banner = _idle ? null : _alerts.Evaluate(_layout, frame, _palette);
        long sourceCompleted;
        long transformStarted;
        if (_directSurface is not null && _directPixels is not null)
        {
            _painter.RenderToSurface(
                _directSurface,
                _layout,
                frame,
                _settings,
                idle: _idle,
                banner: banner,
                outputTransform: _directOutputTransform);
            sourceCompleted = Stopwatch.GetTimestamp();
            transformStarted = sourceCompleted;
            _directPixels.AsSpan().CopyTo(rgb565);
        }
        else
        {
            var bitmap = _painter.Render(
                _layout,
                frame,
                _settings,
                idle: _idle,
                banner: banner);
            var bgra = bitmap.GetPixelSpan();
            sourceCompleted = Stopwatch.GetTimestamp();
            transformStarted = sourceCompleted;
            Rgb565.ComposeFromBgra(
                bgra,
                Width,
                Height,
                _transform,
                _config.Margin,
                _config.OffsetX,
                _config.OffsetY,
                rgb565);
        }

        var transformCompleted = Stopwatch.GetTimestamp();
        return new ScreenFrameTiming(
            Stopwatch.GetElapsedTime(sourceStarted, sourceCompleted),
            Stopwatch.GetElapsedTime(transformStarted, transformCompleted));
    }

    public void Dispose()
    {
        _directSurface?.Dispose();
        if (_directPixelsHandle.IsAllocated)
        {
            _directPixelsHandle.Free();
        }

        _painter.Dispose();
    }
}
