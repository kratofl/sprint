using SkiaSharp;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Reuses shaped <see cref="SKTextBlob"/> instances across frames. SkiaSharp's
/// string draw overload shapes the run and allocates a blob on every call, so a
/// wheel screen redrawing steady labels at 60 Hz turns unchanged text into
/// constant GC pressure. Keying on the text plus the exact typeface and size
/// makes a redraw of unchanged text allocation-free.
///
/// <para>Blobs that a frame did not touch are released in <see cref="EndFrame"/>.
/// A live screen whose values tick every frame therefore keeps the cache at the
/// size of a single frame's text instead of growing for the whole session.</para>
///
/// <para>Not thread-safe: it is owned by one <see cref="DashPainter"/>.</para>
/// </summary>
internal sealed class DashTextBlobCache : IDisposable
{
    private readonly Dictionary<Key, Entry> _entries = [];
    private readonly List<Key> _expired = [];
    private long _frame;
    private bool _disposed;

    /// <summary>Blobs currently held; the seam the eviction tests observe.</summary>
    public int Count => _entries.Count;

    /// <summary>
    /// The shaped blob for <paramref name="text"/> in the current state of
    /// <paramref name="font"/>, creating it on first use. Returns null when Skia
    /// cannot shape the run.
    /// </summary>
    public SKTextBlob? Get(string text, SKFont font)
    {
        ArgumentNullException.ThrowIfNull(text);
        ArgumentNullException.ThrowIfNull(font);
        ObjectDisposedException.ThrowIf(_disposed, this);

        var key = new Key(text, font.Typeface, font.Size);
        if (_entries.TryGetValue(key, out var entry))
        {
            entry.LastFrame = _frame;
            return entry.Blob;
        }

        var blob = SKTextBlob.Create(text, font);
        if (blob is null)
        {
            return null;
        }

        _entries[key] = new Entry(blob, _frame);
        return blob;
    }

    /// <summary>Releases every blob the frame just rendered did not draw.</summary>
    public void EndFrame()
    {
        if (_disposed)
        {
            return;
        }

        foreach (var pair in _entries)
        {
            if (pair.Value.LastFrame != _frame)
            {
                _expired.Add(pair.Key);
            }
        }

        foreach (var key in _expired)
        {
            if (_entries.Remove(key, out var entry))
            {
                entry.Blob.Dispose();
            }
        }

        _expired.Clear();
        _frame++;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        foreach (var pair in _entries)
        {
            pair.Value.Blob.Dispose();
        }

        _entries.Clear();
        _expired.Clear();
    }

    private readonly record struct Key(string Text, SKTypeface Typeface, float Size);

    private sealed class Entry(SKTextBlob blob, long lastFrame)
    {
        public SKTextBlob Blob { get; } = blob;

        public long LastFrame { get; set; } = lastFrame;
    }
}
