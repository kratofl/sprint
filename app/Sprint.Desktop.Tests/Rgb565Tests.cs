using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class Rgb565Tests
{
    [Fact]
    public void FromBgraEncodesRedPixelLittleEndian()
    {
        // One red pixel in SkiaSharp BGRA order: B=0, G=0, R=255, A=255.
        byte[] bgra = new byte[] { 0, 0, 255, 255 };
        byte[] dst = new byte[2];
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
        byte[] src = new byte[4 * 4 * 2];
        for (int i = 0; i < 16; i++)
        {
            src[i * 2] = (byte)i;
            src[i * 2 + 1] = (byte)i;
        }

        byte[] dst = new byte[src.Length];
        Rgb565.ApplyMargin(src, dst, 4, 4, 1);

        for (int y = 0; y < 4; y++)
        {
            for (int x = 0; x < 4; x++)
            {
                byte got = dst[(y * 4 + x) * 2];
                if (x is 0 or 3 || y is 0 or 3)
                {
                    Assert.Equal(0, got);
                }
            }
        }

        for (int y = 1; y <= 2; y++)
        {
            for (int x = 1; x <= 2; x++)
            {
                Assert.NotEqual(0, dst[(y * 4 + x) * 2]);
            }
        }
    }

    [Fact]
    public void ApplyMarginClearsWhenInsetConsumesFrame()
    {
        byte[] src = new byte[2 * 2 * 2];
        Array.Fill(src, (byte)0xFF);
        byte[] dst = new byte[src.Length];

        Rgb565.ApplyMargin(src, dst, 2, 2, 1);

        Assert.All(dst, b => Assert.Equal(0, b));
    }

    [Fact]
    public void ApplyMarginPreservesThinVerticalLines()
    {
        const int w = 800, h = 480, margin = 5;
        byte[] src = new byte[w * h * 2];
        byte[] dst = new byte[src.Length];
        (byte lineLo, byte lineHi) = Encode565(42, 42, 42);

        foreach (int x in new[] { 79, 479 })
        {
            for (int y = 0; y < h; y++)
            {
                int idx = (y * w + x) * 2;
                src[idx] = lineLo;
                src[idx + 1] = lineHi;
            }
        }

        Rgb565.ApplyMargin(src, dst, w, h, margin);

        foreach (int sourceX in new[] { 79, 479 })
        {
            int x = margin + ScaleSourceColumn(sourceX, w, w - margin * 2);
            int y = h / 2;
            int idx = (y * w + x) * 2;
            Assert.Equal(lineLo, dst[idx]);
            Assert.Equal(lineHi, dst[idx + 1]);
        }
    }

    [Fact]
    public void ApplyOffsetShiftsContentRightAndDown()
    {
        // 3x3, fill non-zero, offset (1,1) with rotation 0 → top row + left column cleared.
        const int w = 3, h = 3;
        byte[] buf = new byte[w * h * 2];
        Array.Fill(buf, (byte)0x20);

        Rgb565.ApplyOffset(buf, w, h, offsetX: 1, offsetY: 1, rotation: 0);

        for (int x = 0; x < w; x++)
        {
            Assert.Equal(0, buf[x * 2]); // top row black
        }

        for (int y = 0; y < h; y++)
        {
            Assert.Equal(0, buf[(y * w) * 2]); // left column black
        }

        Assert.NotEqual(0, buf[(1 * w + 1) * 2]); // interior retains content
    }

    [Fact]
    public void ToBgraDecodesFullScaleRedToOpaque()
    {
        // 0xF800 LE = full red in 565.
        byte[] src = new byte[] { 0x00, 0xF8 };
        byte[] dst = new byte[4];
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
        byte[][] colors = new byte[][]
        {
            new byte[] { 0, 0, 0, 255 },
            new byte[] { 255, 255, 255, 255 },
            new byte[] { 12, 200, 90, 255 },
            new byte[] { 255, 106, 0, 255 }, // ember #FF6A00 in BGRA order below
        };

        foreach (byte[] bgra in colors)
        {
            byte[] rgb565 = new byte[2];
            Rgb565.FromBgra(bgra, 1, 1, 0, rgb565);
            byte[] decoded = new byte[4];
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
        (int Width, int Height)[] nativeSizes = new[] { (Width: 5, Height: 3), (Width: 3, Height: 5) };
        (int Margin, int OffsetX, int OffsetY)[] transforms = new[]
        {
            (Margin: 0, OffsetX: 0, OffsetY: 0),
            (Margin: 1, OffsetX: 1, OffsetY: 1),
            (Margin: 1, OffsetX: 2, OffsetY: 0),
            (Margin: 1, OffsetX: 0, OffsetY: 2),
            (Margin: 3, OffsetX: 0, OffsetY: 0),
            (Margin: 0, OffsetX: 99, OffsetY: 99),
            (Margin: -1, OffsetX: 2, OffsetY: 3),
        };

        foreach ((int Width, int Height) native in nativeSizes)
        {
            foreach (DeviceOrientation orientation in Enum.GetValues<DeviceOrientation>())
            {
                DeviceOrientationTransform orientationTransform = DeviceOrientations.Transform(
                    native.Width,
                    native.Height,
                    orientation);
                byte[] bgra = Pattern(
                    orientationTransform.LogicalWidth,
                    orientationTransform.LogicalHeight);

                foreach ((int Margin, int OffsetX, int OffsetY) transform in transforms)
                {
                    byte[] expected = LegacyCompose(
                        bgra,
                        native.Width,
                        native.Height,
                        orientationTransform,
                        transform.Margin,
                        transform.OffsetX,
                        transform.OffsetY);
                    byte[] actual = new byte[expected.Length];

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
    public void NegativeOffsetsShiftTheImageLeftAndUp()
    {
        const int width = 5;
        const int height = 3;
        DeviceOrientationTransform transform = Enum.GetValues<DeviceOrientation>()
            .Select(orientation => DeviceOrientations.Transform(width, height, orientation))
            .First(candidate => candidate.PixelRotation == PixelRotation.None);
        byte[] bgra = Pattern(transform.LogicalWidth, transform.LogicalHeight);
        byte[] centred = new byte[width * height * 2];
        byte[] shifted = new byte[centred.Length];

        Rgb565.ComposeFromBgra(bgra, width, height, transform, margin: 0, offsetX: 0, offsetY: 0, centred);
        Rgb565.ComposeFromBgra(bgra, width, height, transform, margin: 0, offsetX: -1, offsetY: -1, shifted);

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int at = (y * width + x) * 2;
                bool pushedOff = x == width - 1 || y == height - 1;
                int from = ((y + 1) * width + x + 1) * 2;
                Assert.Equal(pushedOff ? (byte)0 : centred[from], shifted[at]);
                Assert.Equal(pushedOff ? (byte)0 : centred[from + 1], shifted[at + 1]);
            }
        }
    }

    [Fact]
    public void FusedCompositionIsAllocationFree()
    {
        const int width = 480;
        const int height = 272;
        DeviceOrientationTransform transform = DeviceOrientations.Transform(width, height, DeviceOrientation.Landscape);
        byte[] bgra = Pattern(transform.LogicalWidth, transform.LogicalHeight);
        byte[] fused = new byte[width * height * 2];

        void Compose() =>
            Rgb565.ComposeFromBgra(
                bgra,
                width,
                height,
                transform,
                margin: 5,
                offsetX: 2,
                offsetY: 2,
                fused);

        Compose();

        const int frames = 20;
        long allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
        for (int frame = 0; frame < frames; frame++)
        {
            Compose();
        }

        Assert.Equal(0, GC.GetAllocatedBytesForCurrentThread() - allocatedBefore);
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
        byte[] converted = new byte[nativeWidth * nativeHeight * 2];
        byte[] destination = new byte[converted.Length];
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
        byte[] bgra = new byte[width * height * 4];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int offset = (y * width + x) * 4;
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
        ushort px = (ushort)(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3));
        return ((byte)px, (byte)(px >> 8));
    }
}
