using Sprint.Desktop.Api.Games;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// What a scan found and is proposing to import. Nothing here has been written: the driver
/// answers first, because a first run would otherwise put hundreds of sessions behind every
/// fuel and lap-time figure with no consent and no traceable origin.
/// </summary>
public sealed record ResultsImportProposal(
    IReadOnlyList<ResultsArchiveEntry> Entries,
    IReadOnlyDictionary<HistorySessionKind, int> CountByKind)
{
    public static ResultsImportProposal Empty { get; } =
        new([], new Dictionary<HistorySessionKind, int>());

    public bool IsEmpty => Entries.Count == 0;

    /// <summary>
    /// The per-kind breakdown as one line ("Practice 9, Qualifying 3, Race 2"), in the order
    /// a weekend runs. A blind total is what this exists to replace.
    /// </summary>
    public string Summary => string.Join(
        ", ",
        Enum.GetValues<HistorySessionKind>()
            .Where(CountByKind.ContainsKey)
            .Select(kind => $"{kind} {CountByKind[kind]}"));
}

/// <summary>
/// The ledger-driven startup scan (#185). It lists the archive, drops everything the ledger
/// has already answered for, and only then parses what is left to build the breakdown the
/// prompt shows. An archive entry matching a session Sprint already recorded is settled in
/// the ledger and omitted, so later launches do not parse or offer it again.
/// </summary>
public sealed class ResultsImportScanner
{
    private readonly ResultsImportLedger _ledger;
    private readonly ILapHistoryStore? _history;

    public ResultsImportScanner(ResultsImportLedger ledger, ILapHistoryStore? history = null)
    {
        this._ledger = ledger ?? throw new ArgumentNullException(nameof(ledger));
        this._history = history;
    }

    /// <summary>
    /// Finds sessions that are both un-imported and not previously declined. It never writes
    /// the corpus. Entries already represented by a recorded session are marked imported in
    /// the ledger because the corpus already has their richer live-recorded form.
    /// </summary>
    /// <param name="includeDeclined">
    /// True for the manual entry point: "Not now" silences the startup prompt, not the
    /// driver's ability to change their mind later. Already-imported entries are still
    /// skipped either way — offering those would propose work with no effect.
    /// </param>
    public ResultsImportProposal Scan(IResultsImporter importer, bool includeDeclined = false)
    {
        ArgumentNullException.ThrowIfNull(importer);

        var candidates = importer.ListEntries()
            .Where(entry => includeDeclined ? !_ledger.WasImported(entry) : !_ledger.IsSettled(entry))
            .ToList();

        if (candidates.Count == 0)
        {
            return ResultsImportProposal.Empty;
        }

        // Only now is anything opened, and only the entries the driver has never answered for.
        IReadOnlyList<LapHistorySession> existing = this._history?.LoadAll() ?? [];
        Dictionary<HistorySessionKind, int> counts = [];
        List<ResultsArchiveEntry> readable = new(candidates.Count);
        List<ResultsArchiveEntry> alreadyRecorded = [];
        foreach (ResultsArchiveEntry entry in candidates)
        {
            ImportedSession? session = importer.Read(entry);
            if (session is null)
            {
                continue;
            }

            if (LapHistoryImportService.MatchesRecordedSession(session, entry, existing))
            {
                alreadyRecorded.Add(entry);
                continue;
            }

            readable.Add(entry);
            HistorySessionKind kind = LapHistoryImportService.MapKind(session.Kind);
            counts[kind] = counts.GetValueOrDefault(kind) + 1;
        }

        if (alreadyRecorded.Count > 0)
        {
            this._ledger.MarkImported(alreadyRecorded);
        }

        return readable.Count == 0
            ? ResultsImportProposal.Empty
            : new ResultsImportProposal(readable, counts);
    }
}
