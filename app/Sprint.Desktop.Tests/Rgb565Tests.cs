using System.Diagnostics;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Xunit;
using Xunit.Abstractions;

namespace Sprint.Desktop.Tests;

public sealed class Rgb565Tests(ITestOutputHelper output)
{
    [Fact]
    public void FromBgraEncodesRedPixelLittleEndian()
    {
        // One red pixel in SkiaSharp BGRA order: B=0, G=0, R=255, A=255.
        var bgra = new byte[] { 0, 0, 255, 255 };
        var dst = new byte[2];
        Rgb565.FromBgra(bgra, 1, 1, 0, dst);

        // R5=31, G6=0, B5=0 → 0xF800, little-endian.
        Assert.Equal(0x00, dst[0]);
        Assert.Equal(0xF8, dst[1]);
    }

    [Fact]
    public void OutputSizeSwapsAxesForQuarterTurns()
    {
        Assert.Equal((800, 480), Rgb565.OutputSize(800, 480, 0));
        Assert.Equal((800, 480), Rgb565.OutputSize(800, 480, 180));
        Assert.Equal((480, 800), Rgb565.OutputSize(800, 480, 90));
        Assert.Equal((480, 800), Rgb565.OutputSize(800, 480, 270));
    }

    [Fact]
    public void ApplyMarginAddsUniformBorder()
    {
        var src = new byte[4 * 4 * 2];
        for (var i = 0; i < 16; i++)
        {
            src[i * 2] = (byte)i;
            src[i * 2 + 1] = (byte)i;
        }

        var dst = new byte[src.Length];
        Rgb565.ApplyMargin(src, dst, 4, 4, 1);

        for (var y = 0; y < 4; y++)
        {
            for (var x = 0; x < 4; x++)
            {
                var got = dst[(y * 4 + x) * 2];
                if (x is 0 or 3 || y is 0 or 3)
                {
                    Assert.Equal(0, got);
                }
            }
        }

        for (var y = 1; y <= 2; y++)
        {
            for (var x = 1; x <= 2; x++)
            {
                Assert.NotEqual(0, dst[(y * 4 + x) * 2]);
            }
        }
    }

    [Fact]
    public void ApplyMarginClearsWhenInsetConsumesFrame()
    {
        var src = new byte[2 * 2 * 2];
        Array.Fill(src, (byte)0xFF);
        var dst = new byte[src.Length];

        Rgb565.ApplyMargin(src, dst, 2, 2, 1);

        Assert.All(dst, b => Assert.Equal(0, b));
    }

    [Fact]
    public void ApplyMarginPreservesThinVerticalLines()
    {
        const int w = 800, h = 480, margin = 5;
        var src = new byte[w * h * 2];
        var dst = new byte[src.Length];
        var (lineLo, lineHi) = Encode565(42, 42, 42);

        foreach (var x in new[] { 79, 479 })
        {
            for (var y = 0; y < h; y++)
            {
                var idx = (y * w + x) * 2;
                src[idx] = lineLo;
                src[idx + 1] = lineHi;
            }
        }

        Rgb565.ApplyMargin(src, dst, w, h, margin);

        foreach (var sourceX in new[] { 79, 479 })
        {
            var x = margin + ScaleSourceColumn(sourceX, w, w - margin * 2);
            var y = h / 2;
            var idx = (y * w + x) * 2;
            Assert.Equal(lineLo, dst[idx]);
            Assert.Equal(lineHi, dst[idx + 1]);
        }
    }

    [Fact]
    public void ApplyOffsetShiftsContentRightAndDown()
    {
        // 3x3, fill non-zero, offset (1,1) with rotation 0 → top row + left column cleared.
        const int w = 3, h = 3;
        var buf = new byte[w * h * 2];
        Array.Fill(buf, (byte)0x20);

        Rgb565.ApplyOffset(buf, w, h, offsetX: 1, offsetY: 1, rotation: 0);

        for (var x = 0; x < w; x++)
        {
            Assert.Equal(0, buf[x * 2]); // top row black
        }

        for (var y = 0; y < h; y++)
        {
            Assert.Equal(0, buf[(y * w) * 2]); // left column black
        }

        Assert.NotEqual(0, buf[(1 * w + 1) * 2]); // interior retains content
    }

    [Fact]
    public void ToBgraDecodesFullScaleRedToOpaque()
    {
        // 0xF800 LE = full red in 565.
        var src = new byte[] { 0x00, 0xF8 };
        var dst = new byte[4];
        Rgb565.ToBgra(src, 1, 1, dst);

        Assert.Equal(0x00, dst[0]); // B
        Assert.Equal(0x00, dst[1]); // G
        Assert.Equal(0xFF, dst[2]); // R replicated to full scale
        Assert.Equal(0xFF, dst[3]); // A opaque
    }

    [Fact]
    public void FromBgraThenToBgraRoundTripsWithinQuantization()
    {
        // Encode a spread of colours to 565 and back; each channel must land within
        // one 565 step of the original (5-bit R/B ≈ 8, 6-bit G ≈ 4).
        var colors = new byte[][]
        {
            new byte[] { 0, 0, 0, 255 },
            new byte[] { 255, 255, 255, 255 },
            new byte[] { 12, 200, 90, 255 },
            new byte[] { 255, 106, 0, 255 }, // ember #FF6A00 in BGRA order below
        };

        foreach (var bgra in colors)
        {
            var rgb565 = new byte[2];
            Rgb565.FromBgra(bgra, 1, 1, 0, rgb565);
            var decoded = new byte[4];
            Rgb565.ToBgra(rgb565, 1, 1, decoded);

            Assert.True(Math.Abs(decoded[0] - bgra[0]) <= 8, $"B off by {Math.Abs(decoded[0] - bgra[0])}");
            Assert.True(Math.Abs(decoded[1] - bgra[1]) <= 4, $"G off by {Math.Abs(decoded[1] - bgra[1])}");
            Assert.True(Math.Abs(decoded[2] - bgra[2]) <= 8, $"R off by {Math.Abs(decoded[2] - bgra[2])}");
            Assert.Equal(0xFF, decoded[3]);
        }
    }

    [Fact]
    public void FusedCompositionIsByteEquivalentToTheLegacyPipeline()
    {
        var nativeSizes = new[] { (Width: 5, Height: 3), (Width: 3, Height: 5) };
        var transforms = new[]
        {
            (Margin: 0, OffsetX: 0, OffsetY: 0),
            (Margin: 1, OffsetX: 1, OffsetY: 1),
            (Margin: 1, OffsetX: 2, OffsetY: 0),
            (Margin: 1, OffsetX: 0, OffsetY: 2),
            (Margin: 3, OffsetX: 0, OffsetY: 0),
            (Margin: 0, OffsetX: 99, OffsetY: 99),
            (Margin: -1, OffsetX: -2, OffsetY: -3),
        };

        foreach (var native in nativeSizes)
        {
            foreach (var orientation in Enum.GetValues<DeviceOrientation>())
            {
                var orientationTransform = DeviceOrientations.Transform(
                    native.Width,
                    native.Height,
                    orientation);
                var bgra = Pattern(
                    orientationTransform.LogicalWidth,
                    orientationTransform.LogicalHeight);

                foreach (var transform in transforms)
                {
                    var expected = LegacyCompose(
                        bgra,
                        native.Width,
                        native.Height,
                        orientationTransform,
                        transform.Margin,
                        transform.OffsetX,
                        transform.OffsetY);
                    var actual = new byte[expected.Length];

                    Rgb565.ComposeFromBgra(
                        bgra,
                        native.Width,
                        native.Height,
                        orientationTransform,
                        transform.Margin,
                        transform.OffsetX,
                        transform.OffsetY,
                        actual);

                    Assert.Equal(expected, actual);
                }
            }
        }
    }

    [Fact]
    public void FusedCompositionIsAllocationFreeAndReportsRepresentativeDiagnostics()
    {
        foreach (var size in new[]
                 {
                     (Width: 320, Height: 240, Iterations: 20),
                     (Width: 480, Height: 272, Iterations: 20),
                     (Width: 800, Height: 480, Iterations: 10),
                 })
        {
            var transform = DeviceOrientations.Transform(
                size.Width,
                size.Height,
                DeviceOrientation.Landscape);
            var bgra = Pattern(transform.LogicalWidth, transform.LogicalHeight);
            var converted = new byte[size.Width * size.Height * 2];
            var legacy = new byte[converted.Length];
            var fused = new byte[converted.Length];

            void Legacy()
            {
                Rgb565.FromBgra(
                    bgra,
                    transform.LogicalWidth,
                    transform.LogicalHeight,
                    (int)transform.PixelRotation,
                    converted);
                Rgb565.ApplyMargin(converted, legacy, size.Width, size.Height, margin: 5);
                Rgb565.ApplyOffset(
                    legacy,
                    size.Width,
                    size.Height,
                    offsetX: 2,
                    offsetY: 2,
                    (int)transform.PixelRotation);
            }

            void Fused() =>
                Rgb565.ComposeFromBgra(
                    bgra,
                    size.Width,
                    size.Height,
                    transform,
                    margin: 5,
                    offsetX: 2,
                    offsetY: 2,
                    fused);

            Legacy();
            Fused();
            Assert.Equal(legacy, fused);

            var legacyMeasurement = Measure(Legacy, size.Iterations);
            var fusedMeasurement = Measure(Fused, size.Iterations);

            Assert.Equal(0, fusedMeasurement.AllocatedBytes);
            output.WriteLine(
                $"{size.Width}x{size.Height}: legacy={legacyMeasurement.Elapsed.TotalMilliseconds / size.Iterations:0.000} ms/frame, " +
                $"fused={fusedMeasurement.Elapsed.TotalMilliseconds / size.Iterations:0.000} ms/frame, " +
                $"fused-alloc={fusedMeasurement.AllocatedBytes} B");
        }
    }

    private static (TimeSpan Elapsed, long AllocatedBytes) Measure(Action action, int iterations)
    {
        var stopwatch = Stopwatch.StartNew();
        var allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
        for (var iteration = 0; iteration < iterations; iteration++)
        {
            action();
        }

        var allocatedBytes = GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
        stopwatch.Stop();
        return (stopwatch.Elapsed, allocatedBytes);
    }

    private static byte[] LegacyCompose(
        byte[] bgra,
        int nativeWidth,
        int nativeHeight,
        DeviceOrientationTransform transform,
        int margin,
        int offsetX,
        int offsetY)
    {
        var converted = new byte[nativeWidth * nativeHeight * 2];
        var destination = new byte[converted.Length];
        Rgb565.FromBgra(
            bgra,
            transform.LogicalWidth,
            transform.LogicalHeight,
            (int)transform.PixelRotation,
            converted);
        if (margin > 0)
        {
            Rgb565.ApplyMargin(converted, destination, nativeWidth, nativeHeight, margin);
        }
        else
        {
            converted.CopyTo(destination, 0);
        }

        Rgb565.ApplyOffset(
            destination,
            nativeWidth,
            nativeHeight,
            offsetX,
            offsetY,
            (int)transform.PixelRotation);
        return destination;
    }

    private static byte[] Pattern(int width, int height)
    {
        var bgra = new byte[width * height * 4];
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var offset = (y * width + x) * 4;
                bgra[offset] = (byte)(x * 31 + y * 7);
                bgra[offset + 1] = (byte)(x * 13 + y * 29);
                bgra[offset + 2] = (byte)(x * 47 + y * 11);
                bgra[offset + 3] = 0xff;
            }
        }

        return bgra;
    }

    private static int ScaleSourceColumn(int sourceX, int sourceW, int destW) =>
        (sourceX * 2 + 1) * destW / (sourceW * 2);

    private static (byte Lo, byte Hi) Encode565(byte r, byte g, byte b)
    {
        var px = (ushort)(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3));
        return ((byte)px, (byte)(px >> 8));
    }
}
