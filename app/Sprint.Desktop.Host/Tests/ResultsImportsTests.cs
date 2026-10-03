using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// The host side of the results import behind <c>/api/results-import/*</c>: what the startup
/// prompt and the manual action are offered, that only archive-listed ids are ever imported or
/// declined, and that a failed write comes back as an answer rather than an exception.
/// </summary>
public sealed class ResultsImportsTests : IDisposable
{
    private static readonly DateTimeOffset Stamp = new(2026, 8, 1, 18, 0, 0, TimeSpan.Zero);

    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), "sprint-results-imports-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(this._dataRoot))
        {
            Directory.Delete(this._dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Scan_OffersEverySessionWithItsKindBreakdownInWeekendOrder()
    {
        FakeImporter importer = new(
            ("race.xml", ImportedSessionKind.Race),
            ("practice-1.xml", ImportedSessionKind.Practice),
            ("practice-2.xml", ImportedSessionKind.Practice),
            ("quali.xml", ImportedSessionKind.Qualifying));
        ResultsImports imports = this.NewImports(importer, out _);

        ResultsImportOffer offer = await imports.ScanAsync(includeDeclined: false, CancellationToken.None);

        Assert.Equal(4, offer.Entries.Count);
        Assert.Equal(
            [
                new ResultsImportKindCount(HistorySessionKind.Practice, 2),
                new ResultsImportKindCount(HistorySessionKind.Qualifying, 1),
                new ResultsImportKindCount(HistorySessionKind.Race, 1),
            ],
            offer.Counts);
    }

    [Fact]
    public async Task Decline_SilencesTheStartupPromptButNotTheManualAction()
    {
        FakeImporter importer = new(("race.xml", ImportedSessionKind.Race));
        ResultsImports imports = this.NewImports(importer, out _);

        await imports.DeclineAsync(["race.xml"], CancellationToken.None);

        Assert.Empty((await imports.ScanAsync(includeDeclined: false, CancellationToken.None)).Entries);
        Assert.Equal(["race.xml"], (await imports.ScanAsync(includeDeclined: true, CancellationToken.None)).Entries);
    }

    [Fact]
    public async Task Import_WritesOnlyArchiveListedIdsAndIsNotOfferedAgain()
    {
        FakeImporter importer = new(
            ("race.xml", ImportedSessionKind.Race),
            ("quali.xml", ImportedSessionKind.Qualifying));
        ResultsImports imports = this.NewImports(importer, out ILapHistoryStore history);

        // An id the archive does not list names nothing the host will open.
        ResultsImportResult result = await imports.ImportAsync(["race.xml", @"C:\elsewhere\secret.xml"], CancellationToken.None);

        Assert.Equal(new ResultsImportResult(ResultsImportOutcome.Imported, 1), result);
        Assert.Equal(["race.xml"], importer.ReadIds.Distinct());
        Assert.Single(history.LoadAll());
        Assert.Equal(["quali.xml"], (await imports.ScanAsync(includeDeclined: true, CancellationToken.None)).Entries);
    }

    [Fact]
    public async Task Import_ReportsAFailedWriteInsteadOfThrowing()
    {
        FakeImporter importer = new(("race.xml", ImportedSessionKind.Race));
        ResultsImports imports = new(importer, new FailingStore(), new ResultsImportLedger(this._dataRoot));

        ResultsImportResult result = await imports.ImportAsync(["race.xml"], CancellationToken.None);

        Assert.Equal(ResultsImportOutcome.Failed, result.Outcome);
        Assert.Equal("disk full", result.Error);
    }

    [Fact]
    public async Task AGameWithoutAnArchiveOffersNothingAndRefusesToImport()
    {
        ResultsImports imports = new(null, new LocalLapHistoryStore(this._dataRoot), new ResultsImportLedger(this._dataRoot));

        Assert.False(imports.Available);
        Assert.Empty((await imports.ScanAsync(includeDeclined: true, CancellationToken.None)).Entries);
        Assert.Equal(ResultsImportOutcome.Failed, (await imports.ImportAsync(["race.xml"], CancellationToken.None)).Outcome);
    }

    [Fact]
    public void Request_RejectsMissingOrNullIds()
    {
        Assert.False(new ResultsImportRequest(null).TryGetIds(out _));
        Assert.False(new ResultsImportRequest(["race.xml", null]).TryGetIds(out _));
        Assert.True(new ResultsImportRequest(["race.xml"]).TryGetIds(out IReadOnlyList<string> ids));
        Assert.Equal(["race.xml"], ids);
    }

    private ResultsImports NewImports(FakeImporter importer, out ILapHistoryStore history)
    {
        history = new LocalLapHistoryStore(Path.Combine(this._dataRoot, "lap-history"));
        return new ResultsImports(importer, history, new ResultsImportLedger(this._dataRoot));
    }

    /// <summary>An archive of one-lap sessions, each at its own time so none share a natural key.</summary>
    private sealed class FakeImporter : IResultsImporter
    {
        private readonly List<(ResultsArchiveEntry Entry, ImportedSessionKind Kind)> _sessions;

        public FakeImporter(params (string Id, ImportedSessionKind Kind)[] sessions)
        {
            this._sessions = [.. sessions.Select((session, index) => (new ResultsArchiveEntry(session.Id, 1024, Stamp.AddHours(index)), session.Kind))];
        }

        public List<string> ReadIds { get; } = [];

        public string SourceDescription => "the test archive";

        public IReadOnlyList<ResultsArchiveEntry> ListEntries() => [.. this._sessions.Select(session => session.Entry)];

        public ImportedSession? Read(ResultsArchiveEntry entry)
        {
            this.ReadIds.Add(entry.Id);
            (ResultsArchiveEntry Entry, ImportedSessionKind Kind) session = this._sessions.Single(candidate => candidate.Entry.Id == entry.Id);
            return new ImportedSession(
                "Le Mans Ultimate",
                "Spa-Francorchamps",
                "Porsche 963",
                session.Kind,
                session.Entry.LastWriteUtc,
                "Ada Lovelace",
                [new ImportedLap(1, 137.5, [])]);
        }
    }

    private sealed class FailingStore : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => [];

        public void Save(LapHistorySession session) => throw new IOException("disk full");

        public void Delete(string sessionId)
        {
        }
    }
}
