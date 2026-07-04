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

    /// <summary>Copies the painter's current pixels into an existing bitmap (live preview reuse, avoids per-frame allocation).</summary>
    public static void Copy(DashPainter painter, WriteableBitmap target)
    {
        ArgumentNullException.ThrowIfNull(painter);
        ArgumentNullException.ThrowIfNull(target);

        var pixels = painter.PixelSpanBgra.ToArray();
        var srcRowBytes = painter.Width * 4;
        using var buffer = target.Lock();
        if (buffer.RowBytes == srcRowBytes)
        {
            Marshal.Copy(pixels, 0, buffer.Address, pixels.Length);
            return;
        }

        for (var y = 0; y < painter.Height; y++)
        {
            Marshal.Copy(pixels, y * srcRowBytes, buffer.Address + y * buffer.RowBytes, srcRowBytes);
        }
    }
}
