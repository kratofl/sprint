namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Pure RGB565 (little-endian) conversion + screen fit helpers, ported from the
/// Go <c>hardware/rgb565.go</c> (matrix 4.6, WS7). The dash painter renders a
/// BGRA8888 buffer (SkiaSharp order: B,G,R,A per pixel); these routines convert
/// it to the 16-bit format sim wheel screens expect, applying rotation, a
/// uniform margin inset, and screen-space offsets. No allocation beyond the
/// caller-provided destination — safe to call on the hardware render thread.
/// </summary>
public static class Rgb565
{
    /// <summary>Output (width, height) after a rotation of <paramref name="rotation"/> degrees (90/270 swap axes).</summary>
    public static (int Width, int Height) OutputSize(int width, int height, int rotation) =>
        Sanitize(rotation) is 90 or 270 ? (height, width) : (width, height);

    /// <summary>Converts a BGRA8888 buffer to RGB565 LE with the given rotation. <paramref name="dst"/> must be width*height*2 bytes.</summary>
    public static void FromBgra(ReadOnlySpan<byte> bgra, int width, int height, int rotation, Span<byte> dst)
    {
        var expected = checked(width * height * 4);
        if (bgra.Length < expected)
        {
            throw new ArgumentException($"Source buffer too small: need {expected}, got {bgra.Length}.", nameof(bgra));
        }

        if (dst.Length < width * height * 2)
        {
            throw new ArgumentException("Destination buffer too small for RGB565 output.", nameof(dst));
        }

        var i = 0;
        switch (Sanitize(rotation))
        {
            case 90:
                for (var dy = 0; dy < width; dy++)
                {
                    for (var dx = 0; dx < height; dx++)
                    {
                        var sx = dy;
                        var sy = height - 1 - dx;
                        Write(bgra, (sy * width + sx) * 4, dst, ref i);
                    }
                }

                break;
            case 180:
                for (var y = height - 1; y >= 0; y--)
                {
                    for (var x = width - 1; x >= 0; x--)
                    {
                        Write(bgra, (y * width + x) * 4, dst, ref i);
                    }
                }

                break;
            case 270:
                for (var dy = 0; dy < width; dy++)
                {
                    for (var dx = 0; dx < height; dx++)
                    {
                        var sx = width - 1 - dy;
                        var sy = dx;
                        Write(bgra, (sy * width + sx) * 4, dst, ref i);
                    }
                }

                break;
            default: // 0
                for (var y = 0; y < height; y++)
                {
                    for (var x = 0; x < width; x++)
                    {
                        Write(bgra, (y * width + x) * 4, dst, ref i);
                    }
                }

                break;
        }
    }

    private static void Write(ReadOnlySpan<byte> bgra, int j, Span<byte> dst, ref int i)
    {
        // SkiaSharp Bgra8888 memory order: [B, G, R, A].
        var b = (ushort)(bgra[j] >> 3);
        var g = (ushort)(bgra[j + 1] >> 2);
        var r = (ushort)(bgra[j + 2] >> 3);
        var px = (ushort)((r << 11) | (g << 5) | b);
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
        var innerW = nativeW - margin * 2;
        var innerH = nativeH - margin * 2;
        if (innerW <= 0 || innerH <= 0)
        {
            return;
        }

        for (var dy = 0; dy < innerH; dy++)
        {
            var dstRow = (dy + margin) * nativeW;
            var sy0 = dy * nativeH / innerH;
            var sy1 = Math.Min(nativeH, Math.Max(sy0 + 1, ((dy + 1) * nativeH + innerH - 1) / innerH));
            for (var dx = 0; dx < innerW; dx++)
            {
                var sx0 = dx * nativeW / innerW;
                var sx1 = Math.Min(nativeW, Math.Max(sx0 + 1, ((dx + 1) * nativeW + innerW - 1) / innerW));
                var srcIdx = MostVisible(src, nativeW, sx0, sx1, sy0, sy1);
                var dstIdx = (dstRow + dx + margin) * 2;
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

        var rowBytes = nativeW * 2;

        if (fromTop > 0)
        {
            if (fromTop >= nativeH) { buf[..(rowBytes * nativeH)].Clear(); return; }
            for (var row = nativeH - 1; row >= fromTop; row--)
            {
                buf.Slice((row - fromTop) * rowBytes, rowBytes).CopyTo(buf.Slice(row * rowBytes, rowBytes));
            }

            buf[..(fromTop * rowBytes)].Clear();
        }

        if (fromBottom > 0)
        {
            if (fromBottom >= nativeH) { buf[..(rowBytes * nativeH)].Clear(); return; }
            for (var row = 0; row < nativeH - fromBottom; row++)
            {
                buf.Slice((row + fromBottom) * rowBytes, rowBytes).CopyTo(buf.Slice(row * rowBytes, rowBytes));
            }

            buf.Slice((nativeH - fromBottom) * rowBytes, fromBottom * rowBytes).Clear();
        }

        if (fromLeft > 0)
        {
            var shift = fromLeft * 2;
            if (shift >= rowBytes) { buf[..(rowBytes * nativeH)].Clear(); return; }
            for (var row = 0; row < nativeH; row++)
            {
                var start = row * rowBytes;
                buf.Slice(start, rowBytes - shift).CopyTo(buf.Slice(start + shift, rowBytes - shift));
                buf.Slice(start, shift).Clear();
            }
        }

        if (fromRight > 0)
        {
            var shift = fromRight * 2;
            if (shift >= rowBytes) { buf[..(rowBytes * nativeH)].Clear(); return; }
            for (var row = 0; row < nativeH; row++)
            {
                var start = row * rowBytes;
                buf.Slice(start + shift, rowBytes - shift).CopyTo(buf.Slice(start, rowBytes - shift));
                buf.Slice(start + rowBytes - shift, shift).Clear();
            }
        }
    }

    private static int MostVisible(ReadOnlySpan<byte> src, int nativeW, int sx0, int sx1, int sy0, int sy1)
    {
        var bestIdx = (sy0 * nativeW + sx0) * 2;
        var bestScore = Visibility(src[bestIdx], src[bestIdx + 1]);
        for (var sy = sy0; sy < sy1; sy++)
        {
            for (var sx = sx0; sx < sx1; sx++)
            {
                var idx = (sy * nativeW + sx) * 2;
                var score = Visibility(src[idx], src[idx + 1]);
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
        var px = (ushort)(lo | (hi << 8));
        var r = (px >> 11) & 0x1f;
        var g = (px >> 5) & 0x3f;
        var b = px & 0x1f;
        return r * 299 + g * 587 / 2 + b * 114;
    }

    private static int Sanitize(int rotation)
    {
        var r = ((rotation % 360) + 360) % 360;
        return r switch { 90 => 90, 180 => 180, 270 => 270, _ => 0 };
    }
}
