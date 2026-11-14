using System.Diagnostics;

namespace Sprint.Desktop.Features.Hardware;

public enum LatestFrameReadResult
{
    Unavailable,
    Current,
    Copied,
}

/// <summary>
/// Single-producer, multi-consumer exchange for a device's latest logical BGRA
/// capture. The producer writes outside the lock into <see cref="ProducerBuffer"/>
/// and atomically swaps buffers on <see cref="Publish"/>. Consumers only copy the
/// immutable published buffer while holding the short exchange lock.
/// </summary>
public sealed class LatestBgraFrameExchange
{
    private readonly object _sync = new();
    private byte[] _working;
    private byte[] _published;
    private long _publishedAt;
    private long _version;

    public LatestBgraFrameExchange(int width, int height)
    {
        if (width <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(width));
        }

        if (height <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(height));
        }

        this.Width = width;
        this.Height = height;
        this._working = new byte[checked(width * height * 4)];
        this._published = new byte[this._working.Length];
    }

    public int Width { get; }

    public int Height { get; }

    /// <summary>The buffer exclusively owned by the hardware capture producer.</summary>
    public byte[] ProducerBuffer => this._working;

    public void Publish()
    {
        lock (this._sync)
        {
            (this._working, this._published) = (this._published, this._working);
            this._publishedAt = Stopwatch.GetTimestamp();
            this._version++;
        }
    }

    public LatestFrameReadResult TryCopyLatest(
        Span<byte> destination,
        ref long observedVersion,
        TimeSpan maxAge)
    {
        if (destination.Length < this._published.Length)
        {
            throw new ArgumentException(
                "Destination buffer is too small for the shared capture frame.",
                nameof(destination));
        }

        if (maxAge <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(maxAge));
        }

        lock (this._sync)
        {
            if (this._version == 0 || Stopwatch.GetElapsedTime(this._publishedAt) > maxAge)
            {
                return LatestFrameReadResult.Unavailable;
            }

            if (this._version == observedVersion)
            {
                return LatestFrameReadResult.Current;
            }

            this._published.CopyTo(destination);
            observedVersion = this._version;
            return LatestFrameReadResult.Copied;
        }
    }
}
