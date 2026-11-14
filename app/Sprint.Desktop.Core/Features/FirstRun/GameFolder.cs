using Sprint.Games.LeMansUltimate;

namespace Sprint.Desktop.Features.FirstRun;

/// <summary>The Le Mans Ultimate install folder as the first-run setup shows it.</summary>
/// <param name="Folder">The folder in use, chosen or found; empty when none was found.</param>
/// <param name="Chosen">Whether the driver picked it rather than Sprint finding it.</param>
/// <param name="Found">Whether <paramref name="Folder"/> is a Le Mans Ultimate install.</param>
/// <param name="SetupCount">The <c>.svm</c> setup files under it.</param>
/// <param name="ResultsCount">The results <c>.xml</c> files under it.</param>
public sealed record GameFolderSummary(string Folder, bool Chosen, bool Found, int SetupCount, int ResultsCount);

/// <summary>
/// The Le Mans Ultimate install folder in use: points the provider at the driver's choice and
/// describes the folder for <c>/api/state</c>. The description counts files, so it is cached
/// and recounted only after a folder change or once it is <see cref="MaxAge"/> old — state is
/// polled far more often than a driver saves a setup.
/// </summary>
public sealed class GameFolder
{
    /// <summary>How long a summary is shown before the folder is counted again.</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromSeconds(10);

    private readonly LeMansUltimateGameProvider _provider;
    private readonly Lock _gate = new();
    private GameFolderSummary? _summary;
    private long _summarizedAt;

    public GameFolder(LeMansUltimateGameProvider provider)
    {
        this._provider = provider ?? throw new ArgumentNullException(nameof(provider));
    }

    /// <summary>
    /// Reads the game's setups and results from <paramref name="folder"/> from now on, or from
    /// the install found in the Steam libraries when null. Takes effect on the next read.
    /// </summary>
    public void Apply(string? folder)
    {
        this._provider.UseFolder(folder);
        lock (this._gate)
        {
            this._summary = null;
        }
    }

    /// <summary>The folder in use and what it holds, or null on a platform the game cannot run on.</summary>
    public GameFolderSummary? Summary()
    {
        if (!LmuInstall.Supported)
        {
            return null;
        }

        lock (this._gate)
        {
            if (this._summary is null || Environment.TickCount64 - this._summarizedAt > (long)MaxAge.TotalMilliseconds)
            {
                string folder = this._provider.Folder;
                bool found = LmuInstall.IsInstall(folder);
                this._summary = new GameFolderSummary(
                    folder,
                    this._provider.ChosenFolder is not null,
                    found,
                    found ? LmuInstall.CountSetups(folder) : 0,
                    found ? LmuInstall.CountResults(folder) : 0);
                this._summarizedAt = Environment.TickCount64;
            }

            return this._summary;
        }
    }
}
