namespace Sprint.Desktop.Features.Hardware;

public enum ScreenTestPattern
{
    Dashboard,
    ColorBars,
    White,
    Red,
    Green,
    Blue,
    Black,
}

internal static class ScreenTestPatternRenderer
{
    public static void Fill(ScreenTestPattern pattern, Span<byte> rgb565, int width, int height)
    {
        if (pattern == ScreenTestPattern.ColorBars)
        {
            FillColorBars(rgb565, width, height);
            return;
        }

        var color = pattern switch
        {
            ScreenTestPattern.White => (ushort)0xFFFF,
            ScreenTestPattern.Red => (ushort)0xF800,
            ScreenTestPattern.Green => (ushort)0x07E0,
            ScreenTestPattern.Blue => (ushort)0x001F,
            _ => (ushort)0x0000,
        };
        FillSolid(rgb565, color);
    }

    private static void FillColorBars(Span<byte> rgb565, int width, int height)
    {
        ushort[] colors = [0xFFFF, 0xFFE0, 0x07FF, 0x07E0, 0xF81F, 0xF800, 0x001F, 0x0000];
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var color = colors[Math.Min(colors.Length - 1, x * colors.Length / Math.Max(1, width))];
                WritePixel(rgb565, (y * width + x) * 2, color);
            }
        }
    }

    private static void FillSolid(Span<byte> rgb565, ushort color)
    {
        for (var offset = 0; offset < rgb565.Length; offset += 2)
        {
            WritePixel(rgb565, offset, color);
        }
    }

    private static void WritePixel(Span<byte> rgb565, int offset, ushort color)
    {
        rgb565[offset] = (byte)(color & 0xFF);
        rgb565[offset + 1] = (byte)(color >> 8);
    }
}
