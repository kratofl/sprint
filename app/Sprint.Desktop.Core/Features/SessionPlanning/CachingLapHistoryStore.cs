namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// An <see cref="ILapHistoryStore"/> that keeps the last read in memory and drops it on any
/// write. It exists because the two consumers have opposite shapes: the recorder writes about
/// once a minute, while the planner page reads the whole corpus on every repaint — and it
/// repaints at 1 Hz while a plan is tracking. Without this, every second would deserialise
/// every history file, reference curves included.
/// <para>
/// The cache is dropped rather than patched on write, so it can never disagree with what a
/// reader would find on disk: a stale target list is worse than a slow one. Wrapping the same
/// instance the recorder writes through is what makes that hold — a second, unwrapped store
/// would grow the corpus behind this one's back.
/// </para>
/// </summary>
public sealed class CachingLapHistoryStore : ILapHistoryStore
{
    private readonly ILapHistoryStore _inner;
    private readonly object _gate = new();

    private IReadOnlyList<LapHistorySession>? _cached;
    private IReadOnlyList<LapHistoryContext>? _cachedContexts;

    public CachingLapHistoryStore(ILapHistoryStore inner) =>
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));

    public IReadOnlyList<LapHistorySession> LoadAll()
    {
        lock (_gate)
        {
            // Held under the lock and only ever replaced wholesale, so a caller always
            // enumerates a complete snapshot even while the recorder is writing.
            return _cached ??= _inner.LoadAll();
        }
    }

    /// <summary>
    /// Cached separately from the full read: the creation sheet asks for contexts on every
    /// build, and answering that from a cached full read would still have paid for one.
    /// </summary>
    public IReadOnlyList<LapHistoryContext> LoadContexts()
    {
        lock (_gate)
        {
            return _cachedContexts ??= _inner.LoadContexts();
        }
    }

    public void Save(LapHistorySession session)
    {
        lock (_gate)
        {
            _inner.Save(session);
            _cached = null;
            _cachedContexts = null;
        }
    }

    public void Delete(string sessionId)
    {
        lock (_gate)
        {
            _inner.Delete(sessionId);
            _cached = null;
            _cachedContexts = null;
        }
    }
}
