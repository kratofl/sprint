using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The import dialog's own state machine. Searching, the outcome of a search, importing and
/// its result all belong to the dialog: a toast is a transient aside, and neither "there is
/// nothing to import" nor "these sessions are now in your history" is an aside — they are the
/// answer to the thing the driver just asked for.
/// </summary>
public sealed class ImportResultsDialogTests
{
    private static readonly ResultsArchiveEntry Entry = new("race.xml", 2048, DateTimeOffset.UnixEpoch);

    [Fact]
    public async Task AManualImportSearchesFirstAndSaysWhenThereIsNothingNew()
    {
        var controller = Controller(search: () => ResultsImportProposal.Empty);

        Assert.Equal(ImportResultsPhase.Searching, controller.Phase);

        await controller.SearchAsync();

        // Not a toast: the driver asked a question and this is the answer, in the same place.
        Assert.Equal(ImportResultsPhase.NothingNew, controller.Phase);
        Assert.False(controller.CanImport);
    }

    [Fact]
    public async Task AManualImportOffersWhatItFound()
    {
        var controller = Controller(search: () => Proposal(practice: 9, qualifying: 3, race: 2));

        await controller.SearchAsync();

        Assert.Equal(ImportResultsPhase.Ready, controller.Phase);
        Assert.True(controller.CanImport);
        Assert.Equal("Practice 9, Qualifying 3, Race 2", controller.Proposal.Summary);
    }

    [Fact]
    public async Task TheStartupOfferSkipsTheSearchBecauseTheScanAlreadyRan()
    {
        var controller = Controller(offered: Proposal(race: 2));

        Assert.Equal(ImportResultsPhase.Ready, controller.Phase);
        Assert.True(controller.CanImport);
    }

    [Fact]
    public async Task ImportingReportsItsProgressAndThenItsResultInTheDialog()
    {
        using var release = new ManualResetEventSlim(false);
        var phaseWhileRunning = ImportResultsPhase.Ready;
        var controller = Controller(
            offered: Proposal(race: 2),
            import: _ =>
            {
                release.Wait(TimeSpan.FromSeconds(10));
                return 2;
            });
        controller.Changed += (_, _) => phaseWhileRunning = controller.Phase;

        var importing = controller.ImportAsync();
        // The button has to be able to show it is working, and must not be pressable twice.
        Assert.Equal(ImportResultsPhase.Importing, controller.Phase);
        Assert.False(controller.CanImport);
        release.Set();
        await importing;

        Assert.Equal(ImportResultsPhase.Imported, controller.Phase);
        Assert.Equal(2, controller.ImportedCount);
        Assert.Equal(ImportResultsPhase.Imported, phaseWhileRunning);
    }

    [Fact]
    public async Task AnImportThatAlreadyHadEverythingSaysSoRatherThanClaimingSuccess()
    {
        var controller = Controller(offered: Proposal(race: 2), import: _ => 0);

        await controller.ImportAsync();

        Assert.Equal(ImportResultsPhase.Imported, controller.Phase);
        Assert.Equal(0, controller.ImportedCount);
    }

    [Fact]
    public async Task AFailedImportStaysInTheDialogInsteadOfVanishing()
    {
        var controller = Controller(
            offered: Proposal(race: 2),
            import: _ => throw new IOException("the disk went away"));

        await controller.ImportAsync();

        Assert.Equal(ImportResultsPhase.Failed, controller.Phase);
        Assert.Contains("disk went away", controller.Error);
        // A failure the driver cannot see is a failure they will hit again.
        Assert.False(controller.IsFinished);
    }

    [Fact]
    public async Task ASuccessfulImportIsFinishedSoTheDialogCanOfferOnlyAWayOut()
    {
        var controller = Controller(offered: Proposal(race: 2), import: _ => 2);

        await controller.ImportAsync();

        Assert.True(controller.IsFinished);
        Assert.False(controller.CanImport);
    }

    [Fact]
    public async Task DecliningOnlyCountsWhileThereIsSomethingToDecline()
    {
        var declined = new List<ResultsArchiveEntry>();
        var controller = Controller(offered: Proposal(race: 2), decline: declined.AddRange);

        controller.Decline();
        Assert.Single(declined);

        // Closing after the import is done must not mark anything declined.
        var imported = Controller(offered: Proposal(race: 2), import: _ => 2, decline: declined.AddRange);
        await imported.ImportAsync();
        imported.Decline();

        Assert.Single(declined);
    }

    private static ImportResultsController Controller(
        Func<ResultsImportProposal>? search = null,
        ResultsImportProposal? offered = null,
        Func<ResultsImportProposal, int>? import = null,
        Action<IReadOnlyList<ResultsArchiveEntry>>? decline = null) =>
        new(
            "the Le Mans Ultimate results folder",
            offered,
            () => Task.FromResult(search?.Invoke() ?? ResultsImportProposal.Empty),
            // Task.Run, not Task.FromResult: the real import runs off the UI thread, and a
            // blocking stub evaluated inline would finish before ImportAsync even returned —
            // which would make the "shows it is working" assertion pass for the wrong reason.
            proposal => Task.Run(() => import?.Invoke(proposal) ?? 0),
            decline ?? (_ => { }));

    private static ResultsImportProposal Proposal(int practice = 0, int qualifying = 0, int race = 0)
    {
        var counts = new Dictionary<HistorySessionKind, int>();
        if (practice > 0)
        {
            counts[HistorySessionKind.Practice] = practice;
        }

        if (qualifying > 0)
        {
            counts[HistorySessionKind.Qualifying] = qualifying;
        }

        if (race > 0)
        {
            counts[HistorySessionKind.Race] = race;
        }

        return new ResultsImportProposal([Entry], counts);
    }
}
