namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// What a screen shows while its frame source fails (the dash renderer rejects the dash, cannot be
/// loaded, a desktop capture fails): red and black diagonal stripes over the whole panel. A wheel
/// screen has no text renderer to say what went wrong — the Devices page and the log do — so the
/// pattern only has to be impossible to mistake for a dash or for a hardware test pattern (those are
/// solid fills and vertical colour bars), and to never look like a frozen last picture.
/// </summary>
internal static class ScreenFailurePattern
{
    private const ushort Red = 0xF800;
    private const ushort Black = 0x0000;

    /// <summary>Fills the native RGB565 buffer (<paramref name="width"/> x <paramref name="height"/>).</summary>
    public static void Fill(Span<byte> rgb565, int width, int height)
    {
        // About eight stripes across the short side, whatever the panel's size.
        int stripe = Math.Max(4, Math.Min(width, height) / 16);
        for (int y = 0; y < height; y++)
        {
            int row = y * width * 2;
            for (int x = 0; x < width; x++)
            {
                ushort color = (x + y) / stripe % 2 == 0 ? Red : Black;
                rgb565[row + x * 2] = (byte)(color & 0xFF);
                rgb565[row + x * 2 + 1] = (byte)(color >> 8);
            }
        }
    }
}
