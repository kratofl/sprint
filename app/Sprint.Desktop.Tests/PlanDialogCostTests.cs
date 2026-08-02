using System.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// What opening the creation sheet costs. The sheet asks for the game/car/track it knows on
/// every build, and the corpus it reads carries a reference curve per lap — the largest field
/// Sprint stores. These pin the cost so it cannot creep back.
/// </summary>
public sealed class PlanDialogCostTests
{
    private const int Sessions = 120;
    private const int LapsPerSession = 25;

    [Fact]
    public void ReadingTheContextsDoesNotDeserialiseEveryReferenceCurve()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var store = new LocalLapHistoryStore(root);
            Seed(store);

            // Warm the file system and the serialiser so the comparison is about the work, not
            // about first-call JIT.
            _ = store.LoadContexts();
            _ = store.LoadAll();

            var contexts = Measure(() => store.LoadContexts());
            var everything = Measure(() => store.LoadAll());

            Assert.Equal(Sessions, store.LoadContexts().Count);
            // The context read skips the laps entirely, so it must be a fraction of the full
            // read rather than the same work with a projection on the end.
            // Measured on a 120-session / 3,000-lap corpus: 9 ms against 128 ms.
            Assert.True(
                contexts < everything / 2,
                $"context read {contexts.TotalMilliseconds:F0} ms vs full read {everything.TotalMilliseconds:F0} ms");
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void TheSheetsOptionsComeFromTheCheapReadNotTheWholeCorpus()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var store = new CountingStore(new LocalLapHistoryStore(root));
            Seed(store.Inner);

            var options = PlanContextOptions.From(store, PlanContext.Empty);

            Assert.NotEmpty(options.Tracks);
            // Loading every lap (and every curve) to list distinct track names is what made the
            // dialog stall on a corpus with real mileage in it.
            Assert.Equal(0, store.FullReads);
            Assert.Equal(1, store.ContextReads);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static TimeSpan Measure(Action work)
    {
        var stopwatch = Stopwatch.StartNew();
        work();
        return stopwatch.Elapsed;
    }

    private static void Seed(ILapHistoryStore store)
    {
        for (var session = 0; session < Sessions; session++)
        {
            store.Save(new LapHistorySession
            {
                Id = $"hs-{session}",
                Kind = HistorySessionKind.Practice,
                Context = new LapHistoryContext
                {
                    Game = "Le Mans Ultimate",
                    TrackCourse = session % 2 == 0 ? "Spa-Francorchamps" : "Monza",
                    CarModel = "Porsche 963",
                },
                Laps =
                [
                    .. Enumerable.Range(0, LapsPerSession).Select(lap => new LapHistoryRecord
                    {
                        LapNumber = lap + 1,
                        LapTimeSeconds = 130 + lap,
                        // 201 points, the real shape: this is the payload that makes a full
                        // read expensive.
                        ReferenceCurve = new LapReferenceCurve
                        {
                            TimesSeconds = [.. Enumerable.Range(0, 201).Select(i => i * 0.65)],
                        },
                    }),
                ],
            });
        }
    }

    private sealed class CountingStore(LocalLapHistoryStore inner) : ILapHistoryStore
    {
        public LocalLapHistoryStore Inner { get; } = inner;

        public int FullReads { get; private set; }

        public int ContextReads { get; private set; }

        public IReadOnlyList<LapHistorySession> LoadAll()
        {
            FullReads++;
            return Inner.LoadAll();
        }

        public IReadOnlyList<LapHistoryContext> LoadContexts()
        {
            ContextReads++;
            return Inner.LoadContexts();
        }

        public void Save(LapHistorySession session) => Inner.Save(session);

        public void Delete(string sessionId) => Inner.Delete(sessionId);
    }
}
