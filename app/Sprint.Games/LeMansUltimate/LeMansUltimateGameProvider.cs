using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Games.LeMansUltimate.Results;
using Sprint.Games.LeMansUltimate.Setups;

namespace Sprint.Games.LeMansUltimate;

/// <summary>
/// Le Mans Ultimate as a game provider. The sim publishes its weekly schedule only to its own
/// in-game UI, so the schedule capability has nothing to read.
/// </summary>
internal sealed class LeMansUltimateGameProvider : IGameProvider
{
    // Resolved once, and not while the registry's static list is being built: locating the
    // archive touches the filesystem, and this is a property a caller may read repeatedly.
    private readonly Lazy<IResultsImporter?> _results = new(() =>
    {
        var directory = LmuResultsReader.DefaultResultsPath();

        // No Steam library on this platform at all, so there is no archive to read. A missing
        // folder inside an existing library is not this: that importer lists nothing and can
        // still say where it looked.
        return directory.Length == 0 ? null : new LmuResultsImporter(directory);
    });

    private readonly Lazy<ISetupRepository?> _setups = new(() =>
    {
        var directory = LmuSetupRepository.DefaultSetupsPath();

        // As with results: no Steam library on this platform means there is nothing to read.
        // A driver who has saved no setups yet has an empty folder, and that repository lists
        // nothing while still naming the root a watcher should observe.
        return directory.Length == 0 ? null : new LmuSetupRepository(directory);
    });

    public GameDescriptor Descriptor => LeMansUltimateGameData.Descriptor;

    public IResultsImporter? Results => _results.Value;

    public ISetupRepository? Setups => _setups.Value;

    public IScheduleSource? Schedule => null;

    public ITelemetrySource CreateTelemetrySource()
    {
        return new LeMansUltimateTelemetrySource();
    }
}
