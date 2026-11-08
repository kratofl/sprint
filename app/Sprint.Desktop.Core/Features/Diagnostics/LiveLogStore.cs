namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>One structured record retained for the live diagnostics window.</summary>
public sealed record LiveLogEntry(
    DateTimeOffset Timestamp,
    LogLevel Level,
    string Message,
    string? Exception);

/// <summary>
/// Thread-safe bounded log sink used by the diagnostics window. Filtering returns
/// snapshots so USB/background writers never contend with Avalonia rendering.
/// </summary>
public sealed class LiveLogStore : ILog
{
    private readonly int _capacity;
    private readonly Func<DateTimeOffset> _clock;
    private readonly object _gate = new();
    private readonly Queue<LiveLogEntry> _entries = new();

    public LiveLogStore(int capacity = 2_000, Func<DateTimeOffset>? clock = null)
    {
        this._capacity = Math.Max(1, capacity);
        this._clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    public event EventHandler<LiveLogEntry>? EntryWritten;

    public IReadOnlyList<LiveLogEntry> Entries
    {
        get
        {
            lock (this._gate)
            {
                return this._entries.ToArray();
            }
        }
    }

    /// <summary>
    /// The lowest level captured. Records below this are dropped at write time rather than
    /// stored and hidden by <see cref="Filter"/>, so a caller that lowers verbosity (e.g. the
    /// headless host's <c>diagnostics.setLogLevel</c> command) actually stops retaining them —
    /// not just stops showing them. Defaults to <see cref="LogLevel.Debug"/> (capture
    /// everything), matching every existing caller that never set a level.
    /// </summary>
    public LogLevel MinimumLevel { get; set; } = LogLevel.Debug;

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        if (level < this.MinimumLevel)
        {
            return;
        }

        LiveLogEntry entry = new LiveLogEntry(this._clock(), level, message, exception?.ToString());
        lock (this._gate)
        {
            this._entries.Enqueue(entry);
            while (this._entries.Count > this._capacity)
            {
                this._entries.Dequeue();
            }
        }

        EntryWritten?.Invoke(this, entry);
    }

    public IReadOnlyList<LiveLogEntry> Filter(LogLevel minimumLevel, string? text = null)
    {
        string? needle = text?.Trim();
        lock (this._gate)
        {
            return this._entries
                .Where(entry => entry.Level >= minimumLevel
                    && (string.IsNullOrEmpty(needle)
                        || entry.Message.Contains(needle, StringComparison.OrdinalIgnoreCase)
                        || (entry.Exception?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false)))
                .ToArray();
        }
    }
}

/// <summary>Forwards each record to all configured sinks.</summary>
public sealed class CompositeLog(params ILog[] sinks) : ILog
{
    private readonly IReadOnlyList<ILog> _sinks = sinks;

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        foreach (ILog sink in this._sinks)
        {
            sink.Write(level, message, exception);
        }
    }
}
