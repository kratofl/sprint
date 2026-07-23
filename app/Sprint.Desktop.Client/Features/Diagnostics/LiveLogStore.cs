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
        _capacity = Math.Max(1, capacity);
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    public event EventHandler<LiveLogEntry>? EntryWritten;

    public IReadOnlyList<LiveLogEntry> Entries
    {
        get
        {
            lock (_gate)
            {
                return _entries.ToArray();
            }
        }
    }

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        var entry = new LiveLogEntry(_clock(), level, message, exception?.ToString());
        lock (_gate)
        {
            _entries.Enqueue(entry);
            while (_entries.Count > _capacity)
            {
                _entries.Dequeue();
            }
        }

        EntryWritten?.Invoke(this, entry);
    }

    public IReadOnlyList<LiveLogEntry> Filter(LogLevel minimumLevel, string? text = null)
    {
        var needle = text?.Trim();
        lock (_gate)
        {
            return _entries
                .Where(entry => entry.Level >= minimumLevel
                    && (string.IsNullOrEmpty(needle)
                        || entry.Message.Contains(needle, StringComparison.OrdinalIgnoreCase)
                        || (entry.Exception?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false)))
                .ToArray();
        }
    }
}

/// <summary>Forwards each record to all configured sinks.</summary>
internal sealed class CompositeLog(params ILog[] sinks) : ILog
{
    private readonly IReadOnlyList<ILog> _sinks = sinks;

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        foreach (var sink in _sinks)
        {
            sink.Write(level, message, exception);
        }
    }
}
