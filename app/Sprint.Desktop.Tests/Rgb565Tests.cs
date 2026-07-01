using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class Rgb565Tests
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

    private static int ScaleSourceColumn(int sourceX, int sourceW, int destW) =>
        (sourceX * 2 + 1) * destW / (sourceW * 2);

    private static (byte Lo, byte Hi) Encode565(byte r, byte g, byte b)
    {
        var px = (ushort)(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3));
        return ((byte)px, (byte)(px >> 8));
    }
}
