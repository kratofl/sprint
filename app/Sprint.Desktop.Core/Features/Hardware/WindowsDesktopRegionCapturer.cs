using System.Runtime.InteropServices;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

internal interface IDesktopCaptureSurfaceFactory
{
    bool IsSupported { get; }
    IDesktopCaptureSurface? Create(int width, int height);
}

internal interface IDesktopCaptureSurface : IDisposable
{
    int Width { get; }
    int Height { get; }
    bool TryCapture(ScreenCaptureRegion region, byte[] bgra);
}

/// <summary>
/// Windows GDI desktop capture. The expensive compatible DC and top-down DIB are
/// retained across frames and rebuilt only when the destination size changes.
/// </summary>
public sealed class WindowsDesktopRegionCapturer : IDesktopRegionCapturer, IDisposable
{
    private readonly object _sync = new();
    private readonly IDesktopCaptureSurfaceFactory _surfaceFactory;
    private IDesktopCaptureSurface? _surface;
    private bool _disposed;

    public WindowsDesktopRegionCapturer()
        : this(new GdiDesktopCaptureSurfaceFactory())
    {
    }

    internal WindowsDesktopRegionCapturer(IDesktopCaptureSurfaceFactory surfaceFactory)
    {
        this._surfaceFactory = surfaceFactory ?? throw new ArgumentNullException(nameof(surfaceFactory));
    }

    public bool TryCapture(
        ScreenCaptureRegion region,
        int destinationWidth,
        int destinationHeight,
        byte[] bgra)
    {
        ArgumentNullException.ThrowIfNull(region);
        ArgumentNullException.ThrowIfNull(bgra);
        if (!this._surfaceFactory.IsSupported
            || !region.IsValid
            || destinationWidth <= 0
            || destinationHeight <= 0
            || bgra.Length < checked(destinationWidth * destinationHeight * 4))
        {
            return false;
        }

        lock (this._sync)
        {
            if (this._disposed)
            {
                return false;
            }

            if (this._surface is null
                || this._surface.Width != destinationWidth
                || this._surface.Height != destinationHeight)
            {
                this._surface?.Dispose();
                this._surface = this._surfaceFactory.Create(destinationWidth, destinationHeight);
            }

            return this._surface?.TryCapture(region, bgra) == true;
        }
    }

    public void Dispose()
    {
        lock (this._sync)
        {
            if (this._disposed)
            {
                return;
            }

            this._disposed = true;
            this._surface?.Dispose();
            this._surface = null;
        }
    }
}

internal sealed class GdiDesktopCaptureSurfaceFactory : IDesktopCaptureSurfaceFactory
{
    public bool IsSupported => OperatingSystem.IsWindows();

    public IDesktopCaptureSurface? Create(int width, int height) =>
        GdiDesktopCaptureSurface.TryCreate(width, height);
}

internal sealed class GdiDesktopCaptureSurface : IDesktopCaptureSurface
{
    private const uint SrcCopy = 0x00CC0020;
    private const uint CaptureBlt = 0x40000000;
    private const uint DibRgbColors = 0;
    private const uint BiRgb = 0;
    private const int ColorOnColor = 3;

    private readonly IntPtr _memoryDc;
    private readonly IntPtr _bitmap;
    private readonly IntPtr _previousBitmap;
    private readonly IntPtr _pixels;
    private int _disposed;

    private GdiDesktopCaptureSurface(
        int width,
        int height,
        IntPtr memoryDc,
        IntPtr bitmap,
        IntPtr previousBitmap,
        IntPtr pixels)
    {
        this.Width = width;
        this.Height = height;
        this._memoryDc = memoryDc;
        this._bitmap = bitmap;
        this._previousBitmap = previousBitmap;
        this._pixels = pixels;
    }

    public int Width { get; }
    public int Height { get; }

    public static GdiDesktopCaptureSurface? TryCreate(int width, int height)
    {
        nint screenDc = GetDC(IntPtr.Zero);
        if (screenDc == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            using PendingSurfaceResources resources = new PendingSurfaceResources();
            if (!resources.TryInitialize(screenDc, width, height))
            {
                return null;
            }

            return resources.Transfer(width, height);
        }
        finally
        {
            _ = ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    public bool TryCapture(ScreenCaptureRegion region, byte[] bgra)
    {
        if (Volatile.Read(ref this._disposed) == 1)
        {
            return false;
        }

        nint screenDc = GetDC(IntPtr.Zero);
        if (screenDc == IntPtr.Zero)
        {
            return false;
        }

        try
        {
            if (!StretchBlt(
                    this._memoryDc,
                    0,
                    0,
                    this.Width,
                    this.Height,
                    screenDc,
                    region.X,
                    region.Y,
                    region.Width,
                    region.Height,
                    SrcCopy | CaptureBlt))
            {
                return false;
            }

            Marshal.Copy(this._pixels, bgra, 0, this.Width * this.Height * 4);
            return true;
        }
        finally
        {
            _ = ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref this._disposed, 1) == 1)
        {
            return;
        }

        _ = SelectObject(this._memoryDc, this._previousBitmap);
        _ = DeleteObject(this._bitmap);
        _ = DeleteDC(this._memoryDc);
    }

    private sealed class PendingSurfaceResources : IDisposable
    {
        private bool _transferred;

        public IntPtr MemoryDc { get; private set; }
        public IntPtr Bitmap { get; private set; }
        public IntPtr PreviousBitmap { get; private set; }
        public IntPtr Pixels { get; private set; }

        public bool TryInitialize(IntPtr screenDc, int width, int height)
        {
            this.MemoryDc = CreateCompatibleDC(screenDc);
            if (this.MemoryDc == IntPtr.Zero)
            {
                return false;
            }

            BitmapInfo bitmapInfo = CreateBitmapInfo(width, height);
            this.Bitmap = CreateDIBSection(
                this.MemoryDc,
                ref bitmapInfo,
                DibRgbColors,
                out nint pixels,
                IntPtr.Zero,
                0);
            this.Pixels = pixels;
            if (this.Bitmap == IntPtr.Zero || this.Pixels == IntPtr.Zero)
            {
                return false;
            }

            this.PreviousBitmap = SelectObject(this.MemoryDc, this.Bitmap);
            if (this.PreviousBitmap == IntPtr.Zero || this.PreviousBitmap == new IntPtr(-1))
            {
                this.PreviousBitmap = IntPtr.Zero;
                return false;
            }

            _ = SetStretchBltMode(this.MemoryDc, ColorOnColor);
            return true;
        }

        public GdiDesktopCaptureSurface Transfer(int width, int height)
        {
            this._transferred = true;
            return new GdiDesktopCaptureSurface(
                width,
                height,
                this.MemoryDc,
                this.Bitmap,
                this.PreviousBitmap,
                this.Pixels);
        }

        public void Dispose()
        {
            if (this._transferred)
            {
                return;
            }

            if (this.PreviousBitmap != IntPtr.Zero && this.MemoryDc != IntPtr.Zero)
            {
                _ = SelectObject(this.MemoryDc, this.PreviousBitmap);
            }

            if (this.Bitmap != IntPtr.Zero)
            {
                _ = DeleteObject(this.Bitmap);
            }

            if (this.MemoryDc != IntPtr.Zero)
            {
                _ = DeleteDC(this.MemoryDc);
            }
        }
    }

    private static BitmapInfo CreateBitmapInfo(int width, int height) =>
        new()
        {
            Header = new BitmapInfoHeader
            {
                Size = (uint)Marshal.SizeOf<BitmapInfoHeader>(),
                Width = width,
                Height = -height,
                Planes = 1,
                BitCount = 32,
                Compression = BiRgb,
            },
        };

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfoHeader
    {
        public uint Size;
        public int Width;
        public int Height;
        public ushort Planes;
        public ushort BitCount;
        public uint Compression;
        public uint SizeImage;
        public int XPelsPerMeter;
        public int YPelsPerMeter;
        public uint ClrUsed;
        public uint ClrImportant;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfo
    {
        public BitmapInfoHeader Header;
        public uint Colors;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr window);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr window, IntPtr deviceContext);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr deviceContext);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteDC(IntPtr deviceContext);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateDIBSection(
        IntPtr deviceContext,
        ref BitmapInfo bitmapInfo,
        uint usage,
        out IntPtr bits,
        IntPtr section,
        uint offset);

    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr deviceContext, IntPtr graphicsObject);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr graphicsObject);

    [DllImport("gdi32.dll")]
    private static extern int SetStretchBltMode(IntPtr deviceContext, int mode);

    [DllImport("gdi32.dll")]
    private static extern bool StretchBlt(
        IntPtr destination,
        int destinationX,
        int destinationY,
        int destinationWidth,
        int destinationHeight,
        IntPtr source,
        int sourceX,
        int sourceY,
        int sourceWidth,
        int sourceHeight,
        uint rasterOperation);
}
