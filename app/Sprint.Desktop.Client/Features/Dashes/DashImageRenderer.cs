using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The Avalonia bridge for the SkiaSharp <see cref="DashPainter"/>: copies the
/// painter's BGRA pixel buffer into an Avalonia <see cref="WriteableBitmap"/> so
/// the on-screen dash preview shows the exact pixels the hardware screen would.
/// This is the only dash-render file that references Avalonia — the painter
/// itself stays UI-free so it can also drive thumbnails and hardware output.
/// </summary>
public static class DashImageRenderer
{
    private static readonly Vector Dpi = new(96, 96);

    /// <summary>One-shot render of a layout page to a fresh bitmap (preview tiles, cards).</summary>
    public static WriteableBitmap Render(
        DashLayout layout,
        TelemetryFrame frame,
        AppSettings settings,
        int width,
        int height,
        string? pageId = null,
        bool idle = false,
        DashAlertBanner? banner = null,
        DashPalette? palette = null)
    {
        using var painter = new DashPainter(width, height, palette);
        painter.Render(layout, frame, settings, pageId, idle, banner);
        var bitmap = new WriteableBitmap(new PixelSize(width, height), Dpi, PixelFormat.Bgra8888, AlphaFormat.Premul);
        Copy(painter, bitmap);
        return bitmap;
    }

    /// <summary>
    /// Renders into <paramref name="existing"/> when it matches the requested size (no
    /// allocation), otherwise returns a fresh bitmap. The caller keeps ownership of any
    /// bitmap this replaces — it may still be referenced by a not-yet-detached visual
    /// tree, so it must be disposed later (on view detach), never mid-render.
    /// </summary>
    public static WriteableBitmap RenderReusing(
        WriteableBitmap? existing,
        DashLayout layout,
        TelemetryFrame frame,
        AppSettings settings,
        int width,
        int height,
        string? pageId = null,
        bool idle = false,
        DashAlertBanner? banner = null,
        DashPalette? palette = null)
    {
        using var painter = new DashPainter(width, height, palette);
        painter.Render(layout, frame, settings, pageId, idle, banner);

        if (existing is not null && existing.PixelSize.Width == width && existing.PixelSize.Height == height)
        {
            Copy(painter, existing);
            return existing;
        }

        var bitmap = new WriteableBitmap(new PixelSize(width, height), Dpi, PixelFormat.Bgra8888, AlphaFormat.Premul);
        Copy(painter, bitmap);
        return bitmap;
    }

    /// <summary>Copies the painter's current pixels into an existing bitmap (live preview reuse, avoids per-frame allocation).</summary>
    public static void Copy(DashPainter painter, WriteableBitmap target)
    {
        ArgumentNullException.ThrowIfNull(painter);
        ArgumentNullException.ThrowIfNull(target);
        var pixels = new byte[checked(painter.Width * painter.Height * 4)];
        Copy(painter, target, pixels);
    }

    /// <summary>
    /// Copies through a caller-owned staging buffer. Long-lived previews reuse this
    /// buffer and therefore perform no managed allocation per frame.
    /// </summary>
    public static void Copy(DashPainter painter, WriteableBitmap target, byte[] stagingBuffer)
    {
        ArgumentNullException.ThrowIfNull(painter);
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(stagingBuffer);

        // The copy is a raw pixel-buffer blit; a size mismatch would silently
        // corrupt rows (or overrun) instead of scaling. Fail loud and early.
        if (target.PixelSize.Width != painter.Width || target.PixelSize.Height != painter.Height)
        {
            throw new ArgumentException(
                $"Bitmap size {target.PixelSize.Width}x{target.PixelSize.Height} does not match painter {painter.Width}x{painter.Height}.",
                nameof(target));
        }

        painter.PixelSpanBgra.CopyTo(stagingBuffer);
        CopyBgra(stagingBuffer, painter.Width, painter.Height, target);
    }

    /// <summary>Blits caller-owned BGRA8888 pixels into an existing Avalonia bitmap.</summary>
    public static void CopyBgra(byte[] pixels, int width, int height, WriteableBitmap target)
    {
        ArgumentNullException.ThrowIfNull(pixels);
        ArgumentNullException.ThrowIfNull(target);
        var required = checked(width * height * 4);
        if (pixels.Length < required)
        {
            throw new ArgumentException($"Pixel buffer needs {required} bytes.", nameof(pixels));
        }

        if (target.PixelSize.Width != width || target.PixelSize.Height != height)
        {
            throw new ArgumentException(
                $"Bitmap size {target.PixelSize.Width}x{target.PixelSize.Height} does not match pixels {width}x{height}.",
                nameof(target));
        }

        var srcRowBytes = width * 4;
        using var buffer = target.Lock();
        if (buffer.RowBytes == srcRowBytes)
        {
            Marshal.Copy(pixels, 0, buffer.Address, required);
            return;
        }

        for (var y = 0; y < height; y++)
        {
            Marshal.Copy(pixels, y * srcRowBytes, buffer.Address + y * buffer.RowBytes, srcRowBytes);
        }
    }
}
