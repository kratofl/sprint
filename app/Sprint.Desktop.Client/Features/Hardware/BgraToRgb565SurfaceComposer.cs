using System.Runtime.InteropServices;
using Sprint.Desktop.Features.Devices;
using SkiaSharp;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Reuses caller-backed Skia raster objects to convert a captured logical BGRA
/// frame into the native RGB565 screen buffer with rotation, margin, and offset.
/// </summary>
internal sealed class BgraToRgb565SurfaceComposer : IDisposable
{
    private readonly byte[] _sourcePixels;
    private readonly byte[] _outputPixels;
    private readonly GCHandle _sourceHandle;
    private readonly GCHandle _outputHandle;
    private readonly SKPixmap _sourcePixmap;
    private readonly SKImage _sourceImage;
    private readonly SKSurface _outputSurface;
    private readonly SKCanvas _outputCanvas;
    private readonly SKMatrix _outputTransform;
    private readonly SKRect _logicalBounds;
    private readonly SKSamplingOptions _sampling =
        new(SKFilterMode.Linear, SKMipmapMode.None);
    private bool _disposed;

    public BgraToRgb565SurfaceComposer(
        byte[] sourcePixels,
        int nativeWidth,
        int nativeHeight,
        DeviceOrientationTransform transform,
        int margin,
        int offsetX,
        int offsetY)
    {
        ArgumentNullException.ThrowIfNull(sourcePixels);
        var sourceBytes = checked(transform.LogicalWidth * transform.LogicalHeight * 4);
        if (sourcePixels.Length < sourceBytes)
        {
            throw new ArgumentException("Source buffer is too small for the logical BGRA frame.", nameof(sourcePixels));
        }

        _sourcePixels = sourcePixels;
        _outputPixels = new byte[checked(nativeWidth * nativeHeight * 2)];
        _sourceHandle = GCHandle.Alloc(_sourcePixels, GCHandleType.Pinned);
        _outputHandle = GCHandle.Alloc(_outputPixels, GCHandleType.Pinned);
        try
        {
            var sourceInfo = new SKImageInfo(
                transform.LogicalWidth,
                transform.LogicalHeight,
                SKColorType.Bgra8888,
                SKAlphaType.Opaque);
            _sourcePixmap = new SKPixmap(
                sourceInfo,
                _sourceHandle.AddrOfPinnedObject(),
                transform.LogicalWidth * 4);
            _sourceImage = SKImage.FromPixels(_sourcePixmap)
                ?? throw new InvalidOperationException("Skia could not wrap the captured BGRA frame.");

            _outputSurface = SKSurface.Create(
                new SKImageInfo(
                    nativeWidth,
                    nativeHeight,
                    SKColorType.Rgb565,
                    SKAlphaType.Opaque),
                _outputHandle.AddrOfPinnedObject(),
                nativeWidth * 2)
                ?? throw new InvalidOperationException("Skia could not create the native RGB565 surface.");
            _outputCanvas = _outputSurface.Canvas;
            _outputTransform = ScreenCanvasTransform.Create(
                nativeWidth,
                nativeHeight,
                transform,
                margin,
                offsetX,
                offsetY);
            _logicalBounds = SKRect.Create(
                transform.LogicalWidth,
                transform.LogicalHeight);
        }
        catch
        {
            _sourceImage?.Dispose();
            _sourcePixmap?.Dispose();
            _outputSurface?.Dispose();
            if (_outputHandle.IsAllocated)
            {
                _outputHandle.Free();
            }

            if (_sourceHandle.IsAllocated)
            {
                _sourceHandle.Free();
            }

            throw;
        }
    }

    public bool Owns(byte[] sourcePixels) => ReferenceEquals(_sourcePixels, sourcePixels);

    public void Compose(Span<byte> destination)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (destination.Length < _outputPixels.Length)
        {
            throw new ArgumentException("Destination buffer is too small for the native RGB565 frame.", nameof(destination));
        }

        var saved = _outputCanvas.Save();
        try
        {
            _outputCanvas.Clear(SKColors.Black);
            _outputCanvas.SetMatrix(_outputTransform);
            _outputCanvas.DrawImage(
                _sourceImage,
                _logicalBounds,
                _logicalBounds,
                _sampling);
        }
        finally
        {
            _outputCanvas.RestoreToCount(saved);
        }

        _outputCanvas.Flush();
        _outputPixels.CopyTo(destination);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _outputCanvas.Dispose();
        _outputSurface.Dispose();
        _sourceImage.Dispose();
        _sourcePixmap.Dispose();
        _outputHandle.Free();
        _sourceHandle.Free();
    }
}
