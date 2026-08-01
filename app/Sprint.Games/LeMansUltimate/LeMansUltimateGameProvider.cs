using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Games.LeMansUltimate.Results;

namespace Sprint.Games.LeMansUltimate;

/// <summary>
/// Le Mans Ultimate as a game provider. Setups (#188) are implemented by their own ticket and
/// stay null until then; the sim publishes its weekly schedule only to its own in-game UI, so
/// the schedule capability has nothing to read.
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

    public GameDescriptor Descriptor => LeMansUltimateGameData.Descriptor;

    public IResultsImporter? Results => _results.Value;

    public ISetupRepository? Setups => null;

    public IScheduleSource? Schedule => null;

    public ITelemetrySource CreateTelemetrySource()
    {
        return new LeMansUltimateTelemetrySource();
    }
}
