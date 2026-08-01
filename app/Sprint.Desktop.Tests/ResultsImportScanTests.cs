using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The startup scan (#185): a ledger that makes a normal launch parse nothing, and a scan
/// that only ever proposes — nothing reaches the corpus without the driver saying yes.
/// </summary>
public sealed class ResultsImportScanTests
{
    private static readonly DateTimeOffset Stamp = new(2026, 8, 1, 18, 55, 11, TimeSpan.Zero);

    [Fact]
    public void ALaunchWithNothingNewParsesNoFiles()
    {
        WithLedger(ledger =>
        {
            var importer = new FakeResultsImporter(
                Entry("race.xml"),
                Entry("quali.xml"));
            ledger.MarkImported(importer.Entries);

            var found = new ResultsImportScanner(ledger).Scan(importer);

            // The whole point of the ledger: startup cost must not grow with the archive.
            Assert.True(found.IsEmpty);
            Assert.Equal(0, importer.Reads);
        });
    }

    [Fact]
    public void OnlyUnseenEntriesAreParsedAndOfferedWithAPerKindBreakdown()
    {
        WithLedger(ledger =>
        {
            var importer = new FakeResultsImporter(
                Entry("old-race.xml"),
                Entry("practice-1.xml"),
                Entry("practice-2.xml"),
                Entry("quali.xml"));
            importer.Kinds["practice-1.xml"] = ImportedSessionKind.Practice;
            importer.Kinds["practice-2.xml"] = ImportedSessionKind.Practice;
            importer.Kinds["quali.xml"] = ImportedSessionKind.Qualifying;
            ledger.MarkImported([Entry("old-race.xml")]);

            var found = new ResultsImportScanner(ledger).Scan(importer);

            Assert.False(found.IsEmpty);
            Assert.Equal(3, found.Entries.Count);
            // A blind "import 14 sessions?" is what the breakdown exists to replace.
            Assert.Equal(2, found.CountByKind[HistorySessionKind.Practice]);
            Assert.Equal(1, found.CountByKind[HistorySessionKind.Qualifying]);
            Assert.Equal("Practice 2, Qualifying 1", found.Summary);
            // The already-known entry was never opened.
            Assert.Equal(3, importer.Reads);
        });
    }

    [Fact]
    public void ADeclinedArchiveNeverPromptsAgain()
    {
        WithLedger(ledger =>
        {
            var importer = new FakeResultsImporter(Entry("race.xml"));
            var found = new ResultsImportScanner(ledger).Scan(importer);
            Assert.False(found.IsEmpty);

            ledger.MarkDeclined(found.Entries);

            Assert.True(new ResultsImportScanner(ledger).Scan(importer).IsEmpty);
        });
    }

    [Fact]
    public void TheManualEntryPointStillOffersADeclinedArchive()
    {
        WithLedger(ledger =>
        {
            var importer = new FakeResultsImporter(Entry("race.xml"));
            ledger.MarkDeclined(importer.Entries);
            var scanner = new ResultsImportScanner(ledger);

            // "Not now" silences the startup prompt, not the driver's ability to change
            // their mind from the planner header or settings.
            Assert.True(scanner.Scan(importer).IsEmpty);
            Assert.False(scanner.Scan(importer, includeDeclined: true).IsEmpty);
        });
    }

    [Fact]
    public void TheManualEntryPointDoesNotReofferWhatIsAlreadyImported()
    {
        WithLedger(ledger =>
        {
            var importer = new FakeResultsImporter(Entry("race.xml"));
            ledger.MarkImported(importer.Entries);

            Assert.True(new ResultsImportScanner(ledger).Scan(importer, includeDeclined: true).IsEmpty);
        });
    }

    [Fact]
    public void ADeclineIsNotAnImportSoTheManualPathCanStillTakeIt()
    {
        WithLedger(ledger =>
        {
            var entry = Entry("race.xml");
            ledger.MarkDeclined([entry]);

            // Declining silences the prompt; it must not mark the session as already in the
            // corpus, or a driver who changes their mind could never import it.
            Assert.True(ledger.IsSettled(entry));
            Assert.False(ledger.WasImported(entry));
        });
    }

    [Fact]
    public void AnEditedArchiveFileIsOfferedAgain()
    {
        WithLedger(ledger =>
        {
            var original = Entry("race.xml");
            ledger.MarkImported([original]);

            // Same path, new size and stamp: the sim rewrote it, so it is not the file the
            // ledger settled.
            var rewritten = original with { SizeBytes = original.SizeBytes + 40, LastWriteUtc = Stamp.AddHours(1) };

            Assert.False(ledger.IsSettled(rewritten));
        });
    }

    [Fact]
    public void TheLedgerSurvivesARestart()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var entry = Entry("race.xml");
            new ResultsImportLedger(root).MarkImported([entry]);

            Assert.True(new ResultsImportLedger(root).IsSettled(entry));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AMovedResultsFolderCostsOneReparseAndImportsNothingTwice()
    {
        var root = TestEnv.NewTempDataRoot();
        var corpus = new CollectingLapHistoryStore();
        try
        {
            var ledger = new ResultsImportLedger(root);
            var service = new LapHistoryImportService(corpus);
            var importer = new FakeResultsImporter(Entry("race.xml"));

            var first = new ResultsImportScanner(ledger).Scan(importer);
            service.Import(importer, first.Entries);
            ledger.MarkImported(first.Entries);
            Assert.Single(corpus.Sessions);

            // The archive moves: same sessions, different ids, so the ledger cannot know them
            // and they are parsed once more. The importer's natural key is what stops the
            // corpus gaining a duplicate.
            var moved = new FakeResultsImporter(Entry("backup/race.xml"));
            var second = new ResultsImportScanner(ledger).Scan(moved);
            Assert.False(second.IsEmpty);

            var report = service.Import(moved, second.Entries);

            Assert.Single(corpus.Sessions);
            Assert.Equal(0, report.ImportedCount);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static ResultsArchiveEntry Entry(string id) => new(id, 2048, Stamp);

    private static void WithLedger(Action<ResultsImportLedger> body)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            body(new ResultsImportLedger(root));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private sealed class FakeResultsImporter(params ResultsArchiveEntry[] entries) : IResultsImporter
    {
        public IReadOnlyList<ResultsArchiveEntry> Entries { get; } = entries;

        public Dictionary<string, ImportedSessionKind> Kinds { get; } = [];

        public int Reads { get; private set; }

        public string SourceDescription => "fake archive";

        public IReadOnlyList<ResultsArchiveEntry> ListEntries() => Entries;

        public ImportedSession? Read(ResultsArchiveEntry entry)
        {
            Reads++;
            var kind = Kinds.TryGetValue(entry.Id, out var stated) ? stated : ImportedSessionKind.Race;
            return new ImportedSession(
                Game: "Le Mans Ultimate",
                TrackCourse: "Spa-Francorchamps",
                CarModel: "Porsche 963",
                Kind: kind,
                SessionTimeUtc: Stamp,
                PlayerName: "Alpha Tester",
                Laps: [new ImportedLap(1, 131.0, [])]);
        }
    }

    private sealed class CollectingLapHistoryStore : ILapHistoryStore
    {
        private readonly Dictionary<string, LapHistorySession> _sessions = [];

        public IReadOnlyCollection<LapHistorySession> Sessions => _sessions.Values;

        public IReadOnlyList<LapHistorySession> LoadAll() => [.. _sessions.Values];

        public void Save(LapHistorySession session) => _sessions[session.Id] = session;

        public void Delete(string sessionId) => _sessions.Remove(sessionId);
    }
}
