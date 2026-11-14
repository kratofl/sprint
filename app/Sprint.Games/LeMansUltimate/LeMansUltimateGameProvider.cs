using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Games.LeMansUltimate.Results;
using Sprint.Games.LeMansUltimate.Setups;

namespace Sprint.Games.LeMansUltimate;

/// <summary>
/// Le Mans Ultimate as a game provider. The sim publishes its weekly schedule only to its own
/// in-game UI, so the schedule capability has nothing to read.
/// </summary>
/// <remarks>
/// Setups and results are both read from one install folder: the one the driver chose
/// (<see cref="UseFolder"/>), else the one <see cref="LmuInstall"/> finds. Changing it swaps
/// both capabilities at once, so a consumer that reads <see cref="Results"/>/<see cref="Setups"/>
/// per use (rather than keeping the instance) follows the change without a restart.
/// </remarks>
public sealed class LeMansUltimateGameProvider : IGameProvider
{
    private readonly Lock _gate = new();
    private string? _chosenFolder;

    // Resolved on first use, and not while the registry's static list is being built: finding
    // the install touches the filesystem, and these are properties a caller may read repeatedly.
    private Location? _location;

    public GameDescriptor Descriptor => LeMansUltimateGameData.Descriptor;

    public IResultsImporter? Results => this.Current().Results;

    public ISetupRepository? Setups => this.Current().Setups;

    public IScheduleSource? Schedule => null;

    /// <summary>The install folder the driver chose, or null to find it automatically.</summary>
    public string? ChosenFolder
    {
        get
        {
            lock (this._gate)
            {
                return this._chosenFolder;
            }
        }
    }

    /// <summary>
    /// The install folder in use: the chosen one, else the one found in the Steam libraries, or
    /// an empty string when neither exists.
    /// </summary>
    public string Folder => this.Current().Folder;

    /// <summary>
    /// Reads setups and results from <paramref name="folder"/> from now on, or finds the install
    /// again when null. The capabilities are rebuilt on the next read.
    /// </summary>
    public void UseFolder(string? folder)
    {
        lock (this._gate)
        {
            this._chosenFolder = folder;
            this._location = null;
        }
    }

    public ITelemetrySource CreateTelemetrySource()
    {
        return new LeMansUltimateTelemetrySource();
    }

    private Location Current()
    {
        lock (this._gate)
        {
            return this._location ??= Resolve(this._chosenFolder);
        }
    }

    private static Location Resolve(string? chosen)
    {
        string? found = chosen ?? LmuInstall.Find();

        // With no install found, the readers still point at the default library's place for the
        // game: a missing folder there is "nothing saved yet", and the reader can say where it
        // looked. No Steam library on this platform at all means there is nothing to read.
        string root = found ?? LmuInstall.DefaultFolder();
        return root.Length == 0
            ? new Location("", null, null)
            : new Location(
                found ?? "",
                new LmuResultsImporter(Path.Combine(root, LmuResultsReader.ResultsSubPath)),
                new LmuSetupRepository(Path.Combine(root, LmuSetupRepository.SetupsSubPath)));
    }

    /// <summary>The install folder in use and the capabilities rooted in it.</summary>
    private sealed record Location(string Folder, IResultsImporter? Results, ISetupRepository? Setups);
}
