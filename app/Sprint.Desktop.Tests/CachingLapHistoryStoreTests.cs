using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The corpus is read on every planner repaint (the page rebuilds at 1 Hz while a plan is
/// tracking) and every read otherwise deserialises every history file, reference curves
/// included. These tests pin the caching decorator that makes that affordable without ever
/// serving a stale corpus.
/// </summary>
public sealed class CachingLapHistoryStoreTests
{
    [Fact]
    public void RepeatedReadsHitTheDiskOnce()
    {
        CountingLapHistoryStore inner = new CountingLapHistoryStore();
        CachingLapHistoryStore store = new CachingLapHistoryStore(inner);

        for (int i = 0; i < 10; i++)
        {
            Assert.Empty(store.LoadAll());
        }

        Assert.Equal(1, inner.Loads);
    }

    [Fact]
    public void AWriteIsVisibleToTheNextRead()
    {
        CountingLapHistoryStore inner = new CountingLapHistoryStore();
        CachingLapHistoryStore store = new CachingLapHistoryStore(inner);
        Assert.Empty(store.LoadAll());

        // The always-on recorder writes through this same instance while the page is reading
        // it. A stale target list would be worse than a slow one.
        store.Save(new LapHistorySession { Id = "hs-1" });

        LapHistorySession loaded = Assert.Single(store.LoadAll());
        Assert.Equal("hs-1", loaded.Id);
        Assert.Equal(2, inner.Loads);
    }

    [Fact]
    public void ADeleteIsVisibleToTheNextRead()
    {
        CountingLapHistoryStore inner = new CountingLapHistoryStore();
        CachingLapHistoryStore store = new CachingLapHistoryStore(inner);
        store.Save(new LapHistorySession { Id = "hs-1" });
        Assert.Single(store.LoadAll());

        store.Delete("hs-1");

        Assert.Empty(store.LoadAll());
    }

    [Fact]
    public async Task ConcurrentReadsAndWritesNeverObserveATornCorpus()
    {
        CountingLapHistoryStore inner = new CountingLapHistoryStore();
        CachingLapHistoryStore store = new CachingLapHistoryStore(inner);
        // The recorder persists off the frame thread while the UI thread reads for a repaint.
        Task writer = Task.Run(() =>
        {
            for (int i = 0; i < 200; i++)
            {
                store.Save(new LapHistorySession { Id = $"hs-{i}" });
            }
        });

        Task reader = Task.Run(() =>
        {
            for (int i = 0; i < 200; i++)
            {
                // Enumerating a snapshot that another thread is replacing must not throw.
                foreach (LapHistorySession session in store.LoadAll())
                {
                    Assert.NotNull(session.Id);
                }
            }
        });

        await Task.WhenAll(writer, reader).WaitAsync(TimeSpan.FromSeconds(30));
        Assert.Equal(200, store.LoadAll().Count);
    }

    private sealed class CountingLapHistoryStore : ILapHistoryStore
    {
        private readonly Dictionary<string, LapHistorySession> _sessions = [];

        public int Loads { get; private set; }

        public IReadOnlyList<LapHistorySession> LoadAll()
        {
            lock (this._sessions)
            {
                this.Loads++;
                return [.. this._sessions.Values];
            }
        }

        public void Save(LapHistorySession session)
        {
            lock (this._sessions)
            {
                this._sessions[session.Id] = session;
            }
        }

        public void Delete(string sessionId)
        {
            lock (this._sessions)
            {
                this._sessions.Remove(sessionId);
            }
        }
    }
}
