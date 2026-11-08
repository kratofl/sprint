using Sprint.Desktop.Api.Games;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>Where the import dialog is in its own little lifecycle.</summary>
public enum ImportResultsPhase
{
    /// <summary>Looking through the archive. Only the manual entry point starts here.</summary>
    Searching,

    /// <summary>The archive holds nothing the corpus does not already have.</summary>
    NothingNew,

    /// <summary>Sessions were found and are being offered.</summary>
    Ready,

    /// <summary>Writing them into the corpus.</summary>
    Importing,

    /// <summary>Done, with the count that actually landed.</summary>
    Imported,

    /// <summary>The import failed and says why.</summary>
    Failed,
}

/// <summary>
/// The import dialog's state, kept out of Avalonia so every transition is a unit test.
/// <para>
/// Searching, "nothing new", success and failure all resolve <em>inside the dialog</em>. A
/// toast is a transient aside that can be missed and cannot be re-read; none of these are
/// asides — each is the answer to the thing the driver just asked for, so it belongs where
/// they are looking, and the dialog closes only once they have seen it.
/// </para>
/// </summary>
public sealed class ImportResultsController
{
    private readonly Func<Task<ResultsImportProposal>> _search;
    private readonly Func<ResultsImportProposal, Task<int>> _import;
    private readonly Action<IReadOnlyList<ResultsArchiveEntry>> _decline;

    /// <param name="sourceName">
    /// A short, human name for where the sessions come from ("the Le Mans Ultimate results
    /// folder"). Never a full path: it is the driver's own machine, and the path tells them
    /// nothing they do not know while making the sentence unreadable.
    /// </param>
    /// <param name="offered">
    /// A proposal the startup scan already produced. Present means the search has happened, so
    /// the dialog opens on the offer instead of searching a second time.
    /// </param>
    public ImportResultsController(
        string sourceName,
        ResultsImportProposal? offered,
        Func<Task<ResultsImportProposal>> search,
        Func<ResultsImportProposal, Task<int>> import,
        Action<IReadOnlyList<ResultsArchiveEntry>> decline)
    {
        this.SourceName = sourceName;
        this._search = search ?? throw new ArgumentNullException(nameof(search));
        this._import = import ?? throw new ArgumentNullException(nameof(import));
        this._decline = decline ?? throw new ArgumentNullException(nameof(decline));

        this.Proposal = offered ?? ResultsImportProposal.Empty;
        this.Phase = offered is null ? ImportResultsPhase.Searching : ImportResultsPhase.Ready;
    }

    public event EventHandler? Changed;

    public string SourceName { get; }

    public ImportResultsPhase Phase { get; private set; }

    public ResultsImportProposal Proposal { get; private set; }

    /// <summary>How many sessions actually landed. Zero is a real answer, not a failure.</summary>
    public int ImportedCount { get; private set; }

    public string Error { get; private set; } = "";

    /// <summary>Whether the primary action can be pressed — false while it is already running.</summary>
    public bool CanImport => this.Phase == ImportResultsPhase.Ready;

    /// <summary>Whether the work is done and the dialog only needs a way out.</summary>
    public bool IsFinished => this.Phase is ImportResultsPhase.NothingNew or ImportResultsPhase.Imported;

    public async Task SearchAsync()
    {
        this.Proposal = await this._search();
        this.Phase = this.Proposal.IsEmpty ? ImportResultsPhase.NothingNew : ImportResultsPhase.Ready;
        this.Raise();
    }

    public async Task ImportAsync()
    {
        if (this.Phase != ImportResultsPhase.Ready)
        {
            return;
        }

        // Announced before awaiting, so the button can show it is working from the first frame
        // and cannot be pressed a second time.
        this.Phase = ImportResultsPhase.Importing;
        this.Raise();

        try
        {
            this.ImportedCount = await this._import(this.Proposal);
            this.Phase = ImportResultsPhase.Imported;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            this.Error = ex.Message;
            this.Phase = ImportResultsPhase.Failed;
        }

        this.Raise();
    }

    /// <summary>
    /// Records "not now" for what is currently offered, so the startup prompt stops asking.
    /// Only meaningful while there is an unanswered offer: closing a dialog that has already
    /// imported must not mark those same files declined.
    /// </summary>
    public void Decline()
    {
        if (this.Phase == ImportResultsPhase.Ready && !this.Proposal.IsEmpty)
        {
            this._decline(this.Proposal.Entries);
        }
    }

    private void Raise() => Changed?.Invoke(this, EventArgs.Empty);
}
