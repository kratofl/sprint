using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Compares two RGB565 frames that should look the same but are produced by
/// different code paths — Skia rendering straight into the native surface versus
/// rendering BGRA and converting. Rounding differs by a hair, so equality is the
/// wrong bar: the frames have to agree on the whole image and in every local tile,
/// which is what catches a shifted, rotated, or mirrored frame.
/// </summary>
internal static class Rgb565Similarity
{
    private const int TileSize = 32;
    private const double MaximumMeanError = 16;
    private const double MaximumTileError = 48;

    public static void AssertLooksTheSame(
        byte[] expected,
        byte[] actual,
        int width,
        int height,
        string because)
    {
        var (mean, maximumTile) = Compare(expected, actual, width, height);
        Assert.True(
            mean < MaximumMeanError,
            $"{because}: whole-frame mean RGB error was {mean:0.00}; expected < {MaximumMeanError}.");
        Assert.True(
            maximumTile < MaximumTileError,
            $"{because}: localized {TileSize}px-tile RGB error was {maximumTile:0.00}; "
                + $"expected < {MaximumTileError}.");
    }

    private static (double Mean, double MaximumTile) Compare(
        byte[] left,
        byte[] right,
        int width,
        int height)
    {
        var leftBgra = new byte[width * height * 4];
        var rightBgra = new byte[leftBgra.Length];
        Rgb565.ToBgra(left, width, height, leftBgra);
        Rgb565.ToBgra(right, width, height, rightBgra);
        long total = 0;
        var maximumTile = 0d;
        for (var tileY = 0; tileY < height; tileY += TileSize)
        {
            for (var tileX = 0; tileX < width; tileX += TileSize)
            {
                long tileTotal = 0;
                var tileSamples = 0;
                for (var y = tileY; y < Math.Min(height, tileY + TileSize); y++)
                {
                    for (var x = tileX; x < Math.Min(width, tileX + TileSize); x++)
                    {
                        var offset = (y * width + x) * 4;
                        tileTotal += Math.Abs(leftBgra[offset] - rightBgra[offset]);
                        tileTotal += Math.Abs(leftBgra[offset + 1] - rightBgra[offset + 1]);
                        tileTotal += Math.Abs(leftBgra[offset + 2] - rightBgra[offset + 2]);
                        tileSamples += 3;
                    }
                }

                total += tileTotal;
                maximumTile = Math.Max(maximumTile, tileTotal / (double)tileSamples);
            }
        }

        return (total / (double)(width * height * 3), maximumTile);
    }
}
