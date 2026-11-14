using System.Runtime.CompilerServices;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Pure RGB565 (little-endian) conversion + screen fit helpers, ported from the
/// Go <c>hardware/rgb565.go</c> (matrix 4.6, WS7). The dash renderer and desktop
/// capture produce a BGRA8888 buffer (B,G,R,A per pixel); these routines convert
/// it to the 16-bit format sim wheel screens expect, applying rotation, a
/// uniform margin inset, and screen-space offsets. No allocation beyond the
/// caller-provided destination — safe to call on the hardware render thread.
/// The frame path composes through <see cref="Rgb565Composer"/>, which does all
/// three in one pass; the tests check it against these separate steps.
/// </summary>
public static class Rgb565
{
    /// <summary>Output (width, height) after a rotation of <paramref name="rotation"/> degrees (90/270 swap axes).</summary>
    public static (int Width, int Height) OutputSize(int width, int height, int rotation) =>
        Sanitize(rotation) is 90 or 270 ? (height, width) : (width, height);

    /// <summary>Converts a BGRA8888 buffer to RGB565 LE with the given rotation. <paramref name="dst"/> must be width*height*2 bytes.</summary>
    public static void FromBgra(ReadOnlySpan<byte> bgra, int width, int height, int rotation, Span<byte> dst)
    {
        int expected = checked(width * height * 4);
        if (bgra.Length < expected)
        {
            throw new ArgumentException($"Source buffer too small: need {expected}, got {bgra.Length}.", nameof(bgra));
        }

        if (dst.Length < width * height * 2)
        {
            throw new ArgumentException("Destination buffer too small for RGB565 output.", nameof(dst));
        }

        int i = 0;
        switch (Sanitize(rotation))
        {
            case 90:
                for (int dy = 0; dy < width; dy++)
                {
                    for (int dx = 0; dx < height; dx++)
                    {
                        int sx = dy;
                        int sy = height - 1 - dx;
                        Write(bgra, (sy * width + sx) * 4, dst, ref i);
                    }
                }

                break;
            case 180:
                for (int y = height - 1; y >= 0; y--)
                {
                    for (int x = width - 1; x >= 0; x--)
                    {
                        Write(bgra, (y * width + x) * 4, dst, ref i);
                    }
                }

                break;
            case 270:
                for (int dy = 0; dy < width; dy++)
                {
                    for (int dx = 0; dx < height; dx++)
                    {
                        int sx = width - 1 - dy;
                        int sy = dx;
                        Write(bgra, (sy * width + sx) * 4, dst, ref i);
                    }
                }

                break;
            default: // 0
                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        Write(bgra, (y * width + x) * 4, dst, ref i);
                    }
                }

                break;
        }
    }

    /// <summary>
    /// Decodes an RGB565 LE buffer back to BGRA8888 (SkiaSharp memory order
    /// [B, G, R, A], opaque alpha) for on-screen display. The inverse of
    /// <see cref="FromBgra"/> without rotation — the source is already the native,
    /// rotated/inset/offset panel buffer, so this only expands each 16-bit pixel to
    /// 32-bit. Lets the Devices preview show the exact pixels the hardware receives.
    /// <paramref name="dst"/> must be width*height*4 bytes.
    /// </summary>
    public static void ToBgra(ReadOnlySpan<byte> src, int width, int height, Span<byte> dst)
    {
        int pixels = checked(width * height);
        if (src.Length < pixels * 2)
        {
            throw new ArgumentException($"Source buffer too small: need {pixels * 2}, got {src.Length}.", nameof(src));
        }

        if (dst.Length < pixels * 4)
        {
            throw new ArgumentException("Destination buffer too small for BGRA output.", nameof(dst));
        }

        for (int p = 0; p < pixels; p++)
        {
            ushort px = (ushort)(src[p * 2] | (src[p * 2 + 1] << 8));
            int r5 = (px >> 11) & 0x1f;
            int g6 = (px >> 5) & 0x3f;
            int b5 = px & 0x1f;
            // Expand to 8-bit by replicating the high bits into the low bits so
            // full-scale 565 maps to full-scale 888 (0x1f -> 0xff, 0x3f -> 0xff).
            int j = p * 4;
            dst[j] = (byte)((b5 << 3) | (b5 >> 2));
            dst[j + 1] = (byte)((g6 << 2) | (g6 >> 4));
            dst[j + 2] = (byte)((r5 << 3) | (r5 >> 2));
            dst[j + 3] = 0xff;
        }
    }

    private static void Write(ReadOnlySpan<byte> bgra, int j, Span<byte> dst, ref int i)
    {
        // SkiaSharp Bgra8888 memory order: [B, G, R, A].
        ushort b = (ushort)(bgra[j] >> 3);
        ushort g = (ushort)(bgra[j + 1] >> 2);
        ushort r = (ushort)(bgra[j + 2] >> 3);
        ushort px = (ushort)((r << 11) | (g << 5) | b);
        dst[i] = (byte)px;
        dst[i + 1] = (byte)(px >> 8);
        i += 2;
    }

    /// <summary>
    /// Scales the full RGB565 buffer into a centred inset, leaving a black border
    /// of <paramref name="margin"/> px per side. Samples the most-visible pixel in
    /// the covered source area so thin dash lines survive downscaling.
    /// </summary>
    public static void ApplyMargin(ReadOnlySpan<byte> src, Span<byte> dst, int nativeW, int nativeH, int margin)
    {
        if (margin <= 0)
        {
            src[..(nativeW * nativeH * 2)].CopyTo(dst);
            return;
        }

        dst[..(nativeW * nativeH * 2)].Clear();
        int innerW = nativeW - margin * 2;
        int innerH = nativeH - margin * 2;
        if (innerW <= 0 || innerH <= 0)
        {
            return;
        }

        for (int dy = 0; dy < innerH; dy++)
        {
            int dstRow = (dy + margin) * nativeW;
            int sy0 = dy * nativeH / innerH;
            int sy1 = Math.Min(nativeH, Math.Max(sy0 + 1, ((dy + 1) * nativeH + innerH - 1) / innerH));
            for (int dx = 0; dx < innerW; dx++)
            {
                int sx0 = dx * nativeW / innerW;
                int sx1 = Math.Min(nativeW, Math.Max(sx0 + 1, ((dx + 1) * nativeW + innerW - 1) / innerW));
                int srcIdx = MostVisible(src, nativeW, sx0, sx1, sy0, sy1);
                int dstIdx = (dstRow + dx + margin) * 2;
                dst[dstIdx] = src[srcIdx];
                dst[dstIdx + 1] = src[srcIdx + 1];
            }
        }
    }

    /// <summary>
    /// Shifts content so <paramref name="offsetX"/>/<paramref name="offsetY"/> px of
    /// black appear at the left/top screen edges. Offsets are in screen space; the
    /// rotation maps them to native buffer edges. In-place, no allocation.
    /// </summary>
    public static void ApplyOffset(Span<byte> buf, int nativeW, int nativeH, int offsetX, int offsetY, int rotation)
    {
        if (offsetX <= 0 && offsetY <= 0)
        {
            if (offsetX < 0 || offsetY < 0)
            {
                // clamp negatives to zero, then nothing to shift
            }

            return;
        }

        offsetX = Math.Max(0, offsetX);
        offsetY = Math.Max(0, offsetY);

        int fromLeft = 0, fromRight = 0, fromTop = 0, fromBottom = 0;
        switch (Sanitize(rotation))
        {
            case 90: fromTop = offsetX; fromRight = offsetY; break;
            case 180: fromRight = offsetX; fromBottom = offsetY; break;
            case 270: fromBottom = offsetX; fromLeft = offsetY; break;
            default: fromLeft = offsetX; fromTop = offsetY; break;
        }

        int rowBytes = nativeW * 2;

        if (fromTop > 0)
        {
            if (fromTop >= nativeH) { buf[..(rowBytes * nativeH)].Clear(); return; }
            for (int row = nativeH - 1; row >= fromTop; row--)
            {
                buf.Slice((row - fromTop) * rowBytes, rowBytes).CopyTo(buf.Slice(row * rowBytes, rowBytes));
            }

            buf[..(fromTop * rowBytes)].Clear();
        }

        if (fromBottom > 0)
        {
            if (fromBottom >= nativeH) { buf[..(rowBytes * nativeH)].Clear(); return; }
            for (int row = 0; row < nativeH - fromBottom; row++)
            {
                buf.Slice((row + fromBottom) * rowBytes, rowBytes).CopyTo(buf.Slice(row * rowBytes, rowBytes));
            }

            buf.Slice((nativeH - fromBottom) * rowBytes, fromBottom * rowBytes).Clear();
        }

        if (fromLeft > 0)
        {
            int shift = fromLeft * 2;
            if (shift >= rowBytes) { buf[..(rowBytes * nativeH)].Clear(); return; }
            for (int row = 0; row < nativeH; row++)
            {
                int start = row * rowBytes;
                buf.Slice(start, rowBytes - shift).CopyTo(buf.Slice(start + shift, rowBytes - shift));
                buf.Slice(start, shift).Clear();
            }
        }

        if (fromRight > 0)
        {
            int shift = fromRight * 2;
            if (shift >= rowBytes) { buf[..(rowBytes * nativeH)].Clear(); return; }
            for (int row = 0; row < nativeH; row++)
            {
                int start = row * rowBytes;
                buf.Slice(start + shift, rowBytes - shift).CopyTo(buf.Slice(start, rowBytes - shift));
                buf.Slice(start + rowBytes - shift, shift).Clear();
            }
        }
    }

    private static int MostVisible(ReadOnlySpan<byte> src, int nativeW, int sx0, int sx1, int sy0, int sy1)
    {
        int bestIdx = (sy0 * nativeW + sx0) * 2;
        int bestScore = Visibility(src[bestIdx], src[bestIdx + 1]);
        for (int sy = sy0; sy < sy1; sy++)
        {
            for (int sx = sx0; sx < sx1; sx++)
            {
                int idx = (sy * nativeW + sx) * 2;
                int score = Visibility(src[idx], src[idx + 1]);
                if (score > bestScore)
                {
                    bestIdx = idx;
                    bestScore = score;
                }
            }
        }

        return bestIdx;
    }

    private static int Visibility(byte lo, byte hi)
    {
        ushort px = (ushort)(lo | (hi << 8));
        return Visibility(px);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static int Visibility(ushort px)
    {
        int r = (px >> 11) & 0x1f;
        int g = (px >> 5) & 0x3f;
        int b = px & 0x1f;
        return r * 299 + g * 587 / 2 + b * 114;
    }

    private static int Sanitize(int rotation)
    {
        int r = ((rotation % 360) + 360) % 360;
        return r switch { 90 => 90, 180 => 180, 270 => 270, _ => 0 };
    }
}
