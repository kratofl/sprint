using System.Numerics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Composes a screen's logical BGRA8888 picture onto its native RGB565 (little-endian) panel
/// buffer: the orientation's rotation, a uniform margin inset (downscaled with the same
/// most-visible sampling as <see cref="Rgb565.ApplyMargin"/>, so thin dash lines survive), and
/// signed screen-space offsets (a negative one moves the image left or up; whatever is pushed off
/// the panel is dropped). Build one per screen configuration and reuse it for every frame: the
/// geometry is resolved once here, so <see cref="Compose"/> is a few tight loops and allocates
/// nothing. Not thread-safe — a margin composes through scratch buffers the instance owns.
/// </summary>
public sealed class Rgb565Composer
{
    private readonly int _nativeWidth;
    private readonly int _nativeHeight;
    private readonly int _sourceBytes;
    private readonly int _panelBytes;
    private readonly int _margin;

    // Native pixel (x, y) of the rotated picture is source pixel base + x * xStep + y * yStep.
    private readonly int _sourceBase;
    private readonly int _sourceXStep;
    private readonly int _sourceYStep;

    // Anything but a full-panel, unshifted picture leaves black pixels, so the panel is cleared first.
    private readonly bool _clear;

    // The composed (pre-offset) pixels that land on the panel, and where they move to. Empty when
    // the margin swallows the panel or the offset pushes everything off it.
    private readonly int _firstX;
    private readonly int _endX;
    private readonly int _firstY;
    private readonly int _endY;
    private readonly int _shiftX;
    private readonly int _shiftY;

    // Margin only, see Inset. _columnSamples holds, sample by sample, the source offset
    // (native x * xStep) each visible inset column reads; _rowStart/_rowEnd the native rows each
    // inset row covers. The rest is per-frame scratch.
    private readonly int[] _columnSamples = [];
    private readonly int[] _rowStart = [];
    private readonly int[] _rowEnd = [];
    private readonly uint[] _keys = [];
    private readonly uint[] _across = [];
    private readonly uint[] _down = [];

    public Rgb565Composer(
        int nativeWidth,
        int nativeHeight,
        DeviceOrientationTransform transform,
        int margin,
        int offsetX,
        int offsetY)
    {
        if (nativeWidth <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(nativeWidth));
        }

        if (nativeHeight <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(nativeHeight));
        }

        if (transform.LogicalWidth <= 0 || transform.LogicalHeight <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(transform),
                "Orientation transform needs positive logical dimensions.");
        }

        if (!Enum.IsDefined(transform.PixelRotation))
        {
            throw new ArgumentOutOfRangeException(
                nameof(transform),
                $"Unknown pixel rotation {(int)transform.PixelRotation}.");
        }

        (int Width, int Height) outputSize = Rgb565.OutputSize(
            transform.LogicalWidth,
            transform.LogicalHeight,
            (int)transform.PixelRotation);
        if (outputSize != (nativeWidth, nativeHeight))
        {
            throw new ArgumentException(
                $"Orientation transform produces {outputSize.Width}x{outputSize.Height}, " +
                $"not the requested native size {nativeWidth}x{nativeHeight}.",
                nameof(transform));
        }

        this._nativeWidth = nativeWidth;
        this._nativeHeight = nativeHeight;
        this._sourceBytes = checked(transform.LogicalWidth * transform.LogicalHeight * 4);
        this._panelBytes = checked(nativeWidth * nativeHeight * 2);

        int logicalWidth = transform.LogicalWidth;
        int logicalHeight = transform.LogicalHeight;
        (this._sourceBase, this._sourceXStep, this._sourceYStep) = transform.PixelRotation switch
        {
            PixelRotation.Clockwise90 => ((logicalHeight - 1) * logicalWidth, -logicalWidth, 1),
            PixelRotation.Clockwise180 => (logicalWidth * logicalHeight - 1, -1, -logicalWidth),
            PixelRotation.Clockwise270 => (logicalWidth - 1, logicalWidth, -1),
            _ => (0, 1, logicalWidth),
        };

        // Offsets are screen space; the rotation decides which native edge each one pushes from.
        // Long, so an absurd offset cannot wrap around onto the panel.
        (long shiftX, long shiftY) = transform.PixelRotation switch
        {
            PixelRotation.Clockwise90 => (-(long)offsetY, (long)offsetX),
            PixelRotation.Clockwise180 => (-(long)offsetX, -(long)offsetY),
            PixelRotation.Clockwise270 => ((long)offsetY, -(long)offsetX),
            _ => ((long)offsetX, (long)offsetY),
        };

        this._margin = Math.Max(0, margin);
        long innerWidth = nativeWidth - 2L * this._margin;
        long innerHeight = nativeHeight - 2L * this._margin;
        this._clear = this._margin > 0 || shiftX != 0 || shiftY != 0;
        if (innerWidth <= 0 || innerHeight <= 0)
        {
            return;
        }

        long firstX = Math.Max(this._margin, -shiftX);
        long endX = Math.Min(this._margin + innerWidth, nativeWidth - shiftX);
        long firstY = Math.Max(this._margin, -shiftY);
        long endY = Math.Min(this._margin + innerHeight, nativeHeight - shiftY);
        if (endX <= firstX || endY <= firstY)
        {
            return;
        }

        this._firstX = (int)firstX;
        this._endX = (int)endX;
        this._firstY = (int)firstY;
        this._endY = (int)endY;
        this._shiftX = (int)shiftX;
        this._shiftY = (int)shiftY;
        if (this._margin == 0)
        {
            return;
        }

        int visibleWidth = this._endX - this._firstX;
        int columnSpan = 0;
        for (int column = 0; column < innerWidth; column++)
        {
            (int start, int end) = InsetRange(nativeWidth, (int)innerWidth, column);
            columnSpan = Math.Max(columnSpan, end - start);
        }

        // A column covering fewer native columns than the widest repeats its last one: a repeat
        // never beats the original, and every column then reads the same number of samples.
        this._columnSamples = new int[columnSpan * visibleWidth];
        for (int x = 0; x < visibleWidth; x++)
        {
            (int start, int end) = InsetRange(nativeWidth, (int)innerWidth, this._firstX - this._margin + x);
            for (int sample = 0; sample < columnSpan; sample++)
            {
                this._columnSamples[sample * visibleWidth + x] = Math.Min(start + sample, end - 1) * this._sourceXStep;
            }
        }

        this._rowStart = new int[innerHeight];
        this._rowEnd = new int[innerHeight];
        for (int row = 0; row < innerHeight; row++)
        {
            (this._rowStart[row], this._rowEnd[row]) = InsetRange(nativeHeight, (int)innerHeight, row);
        }

        this._keys = new uint[logicalWidth * logicalHeight];
        this._across = new uint[nativeHeight * visibleWidth];
        this._down = new uint[visibleWidth];
    }

    /// <summary>
    /// Writes one frame. <paramref name="bgra"/> is the logical picture (B, G, R, A per pixel;
    /// alpha is ignored); <paramref name="destination"/> receives nativeWidth * nativeHeight * 2
    /// bytes, and anything past that is left alone.
    /// </summary>
    public void Compose(ReadOnlySpan<byte> bgra, Span<byte> destination)
    {
        if (bgra.Length < this._sourceBytes)
        {
            throw new ArgumentException(
                $"Source buffer too small: need {this._sourceBytes}, got {bgra.Length}.",
                nameof(bgra));
        }

        if (destination.Length < this._panelBytes)
        {
            throw new ArgumentException(
                "Destination buffer too small for RGB565 output.",
                nameof(destination));
        }

        // A BGRA pixel read as one uint and an RGB565 pixel written as one ushort match the byte
        // order the hardware expects on every little-endian machine the app runs on.
        ReadOnlySpan<uint> source = MemoryMarshal.Cast<byte, uint>(bgra[..this._sourceBytes]);
        Span<ushort> panel = MemoryMarshal.Cast<byte, ushort>(destination[..this._panelBytes]);
        if (this._clear)
        {
            panel.Clear();
        }

        if (this._endX <= this._firstX)
        {
            return;
        }

        if (this._margin == 0)
        {
            this.Rotate(source, panel);
            return;
        }

        this.ComputeKeys(source);
        this.ReduceAcross();
        this.ReduceDown(panel);
    }

    // No margin: every visible native pixel is one source pixel, converted.
    [MethodImpl(MethodImplOptions.AggressiveOptimization)]
    private void Rotate(ReadOnlySpan<uint> source, Span<ushort> panel)
    {
        int xStep = this._sourceXStep;
        for (int y = this._firstY; y < this._endY; y++)
        {
            Span<ushort> row = panel.Slice(
                (y + this._shiftY) * this._nativeWidth + this._firstX + this._shiftX,
                this._endX - this._firstX);
            int from = this._sourceBase + this._firstX * xStep + y * this._sourceYStep;
            for (int x = 0; x < row.Length; x++)
            {
                uint pixel = source[from];
                row[x] = (ushort)(((pixel >> 8) & 0xF800) | ((pixel >> 5) & 0x07E0) | ((pixel >> 3) & 0x001F));
                from += xStep;
            }
        }
    }

    // With a margin, each inset pixel takes the most visible native pixel of the area it covers,
    // the first one row by row on a tie (Rgb565.ApplyMargin's rule). The search is separable:
    // ReduceAcross reduces each native row over the columns an inset pixel covers, ReduceDown
    // reduces those results over the rows it covers. Both keep the earlier candidate on a tie, so
    // the row-by-row order survives. They compare keys (see Key) without branching: which pixel
    // wins is unpredictable, and a mispredicted branch per sample cost more than the work.

    // Keys in source order: contiguous whatever the rotation, so this pass vectorises.
    [MethodImpl(MethodImplOptions.AggressiveOptimization)]
    private void ComputeKeys(ReadOnlySpan<uint> source)
    {
        Span<uint> keys = this._keys;
        int at = 0;
        if (Vector.IsHardwareAccelerated)
        {
            for (; at <= keys.Length - Vector<uint>.Count; at += Vector<uint>.Count)
            {
                Key(new Vector<uint>(source[at..])).CopyTo(keys[at..]);
            }
        }

        for (; at < keys.Length; at++)
        {
            keys[at] = Key(source[at]);
        }
    }

    // Native row y, visible inset column x: the most visible of the row's samples for x.
    [MethodImpl(MethodImplOptions.AggressiveOptimization)]
    private void ReduceAcross()
    {
        ReadOnlySpan<uint> keys = this._keys;
        int visibleWidth = this._down.Length;
        for (int y = 0; y < this._nativeHeight; y++)
        {
            int rowBase = this._sourceBase + y * this._sourceYStep;
            Span<uint> across = this._across.AsSpan(y * visibleWidth, visibleWidth);
            ReadOnlySpan<int> samples = this._columnSamples.AsSpan(0, visibleWidth);
            for (int x = 0; x < across.Length; x++)
            {
                across[x] = keys[rowBase + samples[x]];
            }

            for (int from = visibleWidth; from < this._columnSamples.Length; from += visibleWidth)
            {
                samples = this._columnSamples.AsSpan(from, visibleWidth);
                for (int x = 0; x < across.Length; x++)
                {
                    across[x] = MoreVisible(across[x], keys[rowBase + samples[x]]);
                }
            }
        }
    }

    // Inset row by inset row: the most visible of its native rows' ReduceAcross results, whose
    // low 16 bits are the pixel.
    [MethodImpl(MethodImplOptions.AggressiveOptimization)]
    private void ReduceDown(Span<ushort> panel)
    {
        Span<uint> down = this._down;
        for (int y = this._firstY; y < this._endY; y++)
        {
            int insetRow = y - this._margin;
            this._across.AsSpan(this._rowStart[insetRow] * down.Length, down.Length).CopyTo(down);
            for (int from = this._rowStart[insetRow] + 1; from < this._rowEnd[insetRow]; from++)
            {
                ReadOnlySpan<uint> below = this._across.AsSpan(from * down.Length, down.Length);
                int x = 0;
                if (Vector.IsHardwareAccelerated)
                {
                    for (; x <= down.Length - Vector<uint>.Count; x += Vector<uint>.Count)
                    {
                        MoreVisible(new Vector<uint>(down[x..]), new Vector<uint>(below[x..])).CopyTo(down[x..]);
                    }
                }

                for (; x < down.Length; x++)
                {
                    down[x] = MoreVisible(down[x], below[x]);
                }
            }

            Span<ushort> row = panel.Slice(
                (y + this._shiftY) * this._nativeWidth + this._firstX + this._shiftX,
                down.Length);
            int pixel = 0;
            if (Vector.IsHardwareAccelerated)
            {
                for (; pixel <= row.Length - Vector<ushort>.Count; pixel += Vector<ushort>.Count)
                {
                    Vector.Narrow(
                        new Vector<uint>(down[pixel..]),
                        new Vector<uint>(down[(pixel + Vector<uint>.Count)..])).CopyTo(row[pixel..]);
                }
            }

            for (; pixel < row.Length; pixel++)
            {
                row[pixel] = (ushort)down[pixel];
            }
        }
    }

    // A pixel's key: its visibility (Rgb565's luma-weighted score, below 2^15) << 16 | its RGB565
    // value. Masking off the low half of one key and comparing it with another compares visibility.
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static uint Key(uint bgra)
    {
        uint rgb = ((bgra >> 8) & 0xF800) | ((bgra >> 5) & 0x07E0) | ((bgra >> 3) & 0x001F);
        uint visibility = (rgb >> 11) * 299 + (((rgb >> 5) & 0x3F) * 587 >> 1) + (rgb & 0x1F) * 114;
        return (visibility << 16) | rgb;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static Vector<uint> Key(Vector<uint> bgra)
    {
        Vector<uint> rgb = ((bgra >> 8) & new Vector<uint>(0xF800))
            | ((bgra >> 5) & new Vector<uint>(0x07E0))
            | ((bgra >> 3) & new Vector<uint>(0x001F));
        Vector<uint> visibility = (rgb >> 11) * 299u
            + ((((rgb >> 5) & new Vector<uint>(0x3F)) * 587u) >> 1)
            + (rgb & new Vector<uint>(0x1F)) * 114u;
        return (visibility << 16) | rgb;
    }

    // The candidate if it is strictly more visible, else first. Keys stay below 2^31, so the
    // signed difference is negative exactly when the candidate wins.
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static uint MoreVisible(uint first, uint candidate)
    {
        uint candidateWins = (uint)((int)(first - (candidate & 0xFFFF0000)) >> 31);
        return first ^ ((first ^ candidate) & candidateWins);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static Vector<uint> MoreVisible(Vector<uint> first, Vector<uint> candidate) =>
        Vector.ConditionalSelect(
            Vector.GreaterThan(candidate & new Vector<uint>(0xFFFF0000), first),
            candidate,
            first);

    // The native pixels [start, end) that inset pixel i covers along an axis of the given size:
    // floor(i * size / inset) up to ceil((i + 1) * size / inset), at least one.
    private static (int Start, int End) InsetRange(int size, int inset, int i)
    {
        int start = (int)((long)i * size / inset);
        int end = (int)Math.Min(size, Math.Max(start + 1, ((i + 1L) * size + inset - 1) / inset));
        return (start, end);
    }
}
