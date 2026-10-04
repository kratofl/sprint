using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Host;

/// <summary>How many offered sessions are of one kind — one row of the import prompt's breakdown.</summary>
public sealed record ResultsImportKindCount(HistorySessionKind Kind, int Count);

/// <summary>
/// What a scan of the game's results archive found and is offering to import. Nothing has been
/// written: the driver answers in the import dialog first (docs/internals/session-planner.md
/// "Results import"). <see cref="Entries"/> are the importer's opaque entry ids, handed back unchanged to
/// import or decline exactly what was offered.
/// </summary>
public sealed record ResultsImportOffer(
    IReadOnlyList<string> Entries,
    IReadOnlyList<ResultsImportKindCount> Counts)
{
    public static ResultsImportOffer Empty { get; } = new([], []);
}

/// <summary>The body of the import and decline endpoints: the offered entry ids, handed back unchanged.</summary>
public sealed record ResultsImportRequest(IReadOnlyList<string?>? Ids)
{
    /// <summary>False when the ids are missing or any of them is null — the boundary's one check.</summary>
    public bool TryGetIds(out IReadOnlyList<string> ids)
    {
        if (this.Ids is not { } raw || raw.Any(id => id is null))
        {
            ids = [];
            return false;
        }

        ids = [.. raw.OfType<string>()];
        return true;
    }
}

public enum ResultsImportOutcome
{
    /// <summary>The import ran; <see cref="ResultsImportResult.ImportedCount"/> sessions landed (zero is a real answer).</summary>
    Imported,

    /// <summary>The import failed and nothing more was written; <see cref="ResultsImportResult.Error"/> says why.</summary>
    Failed,
}

public sealed record ResultsImportResult(ResultsImportOutcome Outcome, int ImportedCount = 0, string? Error = null);

/// <summary>
/// The host side of the LMU results import (#185): scan the archive, import what the driver
/// accepted, and remember what they declined. It wires the Core pieces the deleted Avalonia
/// MainWindow wired (<see cref="ResultsImportScanner"/>, <see cref="LapHistoryImportService"/>,
/// <see cref="ResultsImportLedger"/>); the dialog's own phases live in the renderer.
/// <para>
/// One operation at a time: the startup scan and a manual import can overlap, and the ledger is
/// a plain dictionary that every one of them writes.
/// </para>
/// </summary>
public sealed class ResultsImports
{
    private readonly IResultsImporter? _importer;
    private readonly ResultsImportLedger _ledger;
    private readonly ResultsImportScanner _scanner;
    private readonly LapHistoryImportService _importService;

    // Never disposed: it lives as long as the host, and its wait handle is never requested.
    private readonly SemaphoreSlim _gate = new(1, 1);

    /// <param name="importer">The game's results archive, or null when the game has none Sprint can read.</param>
    public ResultsImports(IResultsImporter? importer, ILapHistoryStore history, ResultsImportLedger ledger, ILog? log = null)
    {
        ArgumentNullException.ThrowIfNull(history);
        this._importer = importer;
        this._ledger = ledger ?? throw new ArgumentNullException(nameof(ledger));
        this._scanner = new ResultsImportScanner(ledger, history);
        this._importService = new LapHistoryImportService(history, log);
    }

    /// <summary>False when the game archives nothing Sprint can read; the UI then offers no import at all.</summary>
    public bool Available => this._importer is not null;

    /// <summary>Where the sessions come from, phrased for a sentence ("the Le Mans Ultimate results folder"). Never a path.</summary>
    public string SourceName => this._importer?.SourceDescription ?? "";

    /// <summary>
    /// Finds sessions that are not imported yet. The startup prompt passes
    /// <paramref name="includeDeclined"/> false so "Not now" stays answered; the manual entry
    /// point passes true because declining silenced a prompt, not the laps.
    /// </summary>
    public async Task<ResultsImportOffer> ScanAsync(bool includeDeclined, CancellationToken ct)
    {
        if (this._importer is not { } importer)
        {
            return ResultsImportOffer.Empty;
        }

        await this._gate.WaitAsync(ct);
        try
        {
            // Parsing stays off the request thread: an archive can hold hundreds of files.
            ResultsImportProposal proposal = await Task.Run(() => this._scanner.Scan(importer, includeDeclined), ct);
            return proposal.IsEmpty
                ? ResultsImportOffer.Empty
                : new ResultsImportOffer(
                    [.. proposal.Entries.Select(entry => entry.Id)],
                    [.. Enum.GetValues<HistorySessionKind>()
                        .Where(proposal.CountByKind.ContainsKey)
                        .Select(kind => new ResultsImportKindCount(kind, proposal.CountByKind[kind]))]);
        }
        finally
        {
            this._gate.Release();
        }
    }

    /// <summary>
    /// Imports the offered entries and records them in the ledger. Ids the archive does not list
    /// are ignored, so the renderer can only ever name files the importer itself found. Once
    /// started it runs to the end — <paramref name="ct"/> only stops it from starting — because a
    /// half-written pass would leave sessions in the corpus the ledger does not know about.
    /// </summary>
    public async Task<ResultsImportResult> ImportAsync(IReadOnlyCollection<string> ids, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(ids);
        if (this._importer is not { } importer)
        {
            return new ResultsImportResult(ResultsImportOutcome.Failed, Error: "This game has no results archive Sprint can import.");
        }

        await this._gate.WaitAsync(ct);
        try
        {
            return await Task.Run(() =>
            {
                try
                {
                    IReadOnlyList<ResultsArchiveEntry> entries = Resolve(importer, ids);
                    LapHistoryImportReport report = this._importService.Import(importer, entries);
                    this._ledger.MarkImported(entries);
                    return new ResultsImportResult(ResultsImportOutcome.Imported, report.ImportedCount);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
                {
                    // The same failures ImportResultsController resolves inside the dialog.
                    return new ResultsImportResult(ResultsImportOutcome.Failed, Error: ex.Message);
                }
            }, CancellationToken.None);
        }
        finally
        {
            this._gate.Release();
        }
    }

    /// <summary>Records "Not now" for the offered entries so the startup prompt stops asking about them.</summary>
    public async Task DeclineAsync(IReadOnlyCollection<string> ids, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(ids);
        if (this._importer is not { } importer)
        {
            return;
        }

        await this._gate.WaitAsync(ct);
        try
        {
            IReadOnlyList<ResultsArchiveEntry> entries = await Task.Run(() => Resolve(importer, ids), ct);
            if (entries.Count > 0)
            {
                this._ledger.MarkDeclined(entries);
            }
        }
        finally
        {
            this._gate.Release();
        }
    }

    // Ids are matched against the archive's own listing rather than trusted: they arrive from the
    // renderer, and the ledger keys on the size and stamp the listing reports right now.
    private static IReadOnlyList<ResultsArchiveEntry> Resolve(IResultsImporter importer, IReadOnlyCollection<string> ids)
    {
        HashSet<string> wanted = new(ids, StringComparer.Ordinal);
        return [.. importer.ListEntries().Where(entry => wanted.Contains(entry.Id))];
    }
}
