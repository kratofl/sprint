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
    public void ComposerIsByteEquivalentToTheSeparateSteps()
    {
        (int Width, int Height)[] nativeSizes =
            [(5, 3), (3, 5), (1, 1), (2, 9), (9, 2), (7, 7), (64, 37), (37, 64)];
        int[] margins = [-1, 0, 1, 2, 3, 5, 17];
        (int X, int Y)[] offsets =
            [(0, 0), (1, 1), (2, 0), (0, 2), (99, 99), (-1, 0), (0, -2), (-3, 2), (4, -5), (-50, 50)];

        foreach ((int Width, int Height) native in nativeSizes)
        {
            foreach (DeviceOrientation orientation in Enum.GetValues<DeviceOrientation>())
            {
                DeviceOrientationTransform transform = DeviceOrientations.Transform(
                    native.Width,
                    native.Height,
                    orientation);
                byte[][] pictures =
                [
                    Pattern(transform.LogicalWidth, transform.LogicalHeight),
                    Noise(transform.LogicalWidth, transform.LogicalHeight, seed: 7),
                    Ties(transform.LogicalWidth, transform.LogicalHeight, seed: 11),
                ];

                foreach (byte[] bgra in pictures)
                {
                    foreach (int margin in margins)
                    {
                        foreach ((int X, int Y) offset in offsets)
                        {
                            byte[] expected = SeparateSteps(
                                bgra,
                                native.Width,
                                native.Height,
                                transform,
                                margin,
                                offset.X,
                                offset.Y);
                            byte[] actual = new byte[expected.Length];

                            new Rgb565Composer(
                                native.Width,
                                native.Height,
                                transform,
                                margin,
                                offset.X,
                                offset.Y).Compose(bgra, actual);

                            Assert.True(
                                expected.AsSpan().SequenceEqual(actual),
                                $"{native.Width}x{native.Height} {orientation}, margin {margin}, offset {offset}");
                        }
                    }
                }
            }
        }
    }

    [Fact]
    public void AbsurdMarginsAndOffsetsGiveABlackPanel()
    {
        const int width = 6;
        const int height = 4;
        DeviceOrientationTransform transform = DeviceOrientations.Transform(width, height, DeviceOrientation.Landscape);
        byte[] bgra = Noise(transform.LogicalWidth, transform.LogicalHeight, seed: 3);
        (int Margin, int OffsetX, int OffsetY)[] cases =
            [(int.MaxValue, 0, 0), (1 << 30, 0, 0), (0, int.MaxValue, 0), (0, 0, int.MinValue), (2, int.MinValue, int.MaxValue)];

        foreach ((int Margin, int OffsetX, int OffsetY) setting in cases)
        {
            // Two bytes past the panel must survive: Compose writes width * height * 2 bytes only.
            byte[] destination = new byte[width * height * 2 + 2];
            Array.Fill(destination, (byte)0xA5);

            new Rgb565Composer(width, height, transform, setting.Margin, setting.OffsetX, setting.OffsetY)
                .Compose(bgra, destination);

            Assert.All(destination[..^2], value => Assert.Equal(0, value));
            Assert.Equal(new byte[] { 0xA5, 0xA5 }, destination[^2..]);
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

        new Rgb565Composer(width, height, transform, margin: 0, offsetX: 0, offsetY: 0).Compose(bgra, centred);
        new Rgb565Composer(width, height, transform, margin: 0, offsetX: -1, offsetY: -1).Compose(bgra, shifted);

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
        Rgb565Composer composer = new(width, height, transform, margin: 5, offsetX: 2, offsetY: 2);

        void Compose() => composer.Compose(bgra, fused);

        Compose();

        const int frames = 20;
        long allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
        for (int frame = 0; frame < frames; frame++)
        {
            Compose();
        }

        Assert.Equal(0, GC.GetAllocatedBytesForCurrentThread() - allocatedBefore);
    }

    // The composer's behaviour spelled out as the old separate steps: convert with rotation, inset,
    // then offset. ApplyOffset only pushes from the edges a positive offset picks, so a negative
    // one is applied as a positive one from the opposite edge (rotation + 180).
    private static byte[] SeparateSteps(
        byte[] bgra,
        int nativeWidth,
        int nativeHeight,
        DeviceOrientationTransform transform,
        int margin,
        int offsetX,
        int offsetY)
    {
        int rotation = (int)transform.PixelRotation;
        byte[] converted = new byte[nativeWidth * nativeHeight * 2];
        byte[] destination = new byte[converted.Length];
        Rgb565.FromBgra(bgra, transform.LogicalWidth, transform.LogicalHeight, rotation, converted);
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
            Math.Abs(offsetX),
            0,
            offsetX < 0 ? rotation + 180 : rotation);
        Rgb565.ApplyOffset(
            destination,
            nativeWidth,
            nativeHeight,
            0,
            Math.Abs(offsetY),
            offsetY < 0 ? rotation + 180 : rotation);
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

    // Random colours and alpha.
    private static byte[] Noise(int width, int height, int seed)
    {
        byte[] bgra = new byte[width * height * 4];
        new Random(seed).NextBytes(bgra);
        return bgra;
    }

    // Distinct colours with equal visibility, so the first-on-tie rule decides what an inset
    // keeps; the bits RGB565 drops and alpha are random.
    private static byte[] Ties(int width, int height, int seed)
    {
        // Each group of three shares one visibility score.
        ushort[] palette = [0x021D, 0x607F, 0xD002, 0x023D, 0x71C0, 0xD022, 0x0000];
        Random random = new(seed);
        byte[] bgra = new byte[width * height * 4];
        for (int at = 0; at < bgra.Length; at += 4)
        {
            ushort pixel = palette[random.Next(palette.Length)];
            bgra[at] = (byte)(((pixel & 0x1F) << 3) | random.Next(8));
            bgra[at + 1] = (byte)((((pixel >> 5) & 0x3F) << 2) | random.Next(4));
            bgra[at + 2] = (byte)(((pixel >> 11) << 3) | random.Next(8));
            bgra[at + 3] = (byte)random.Next(256);
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
