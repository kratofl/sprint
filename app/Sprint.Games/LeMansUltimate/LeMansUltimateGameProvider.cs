using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games.LeMansUltimate;

/// <summary>
/// Le Mans Ultimate as a game provider. Results (#182) and setups (#188) are implemented by
/// their own tickets and stay null until then; the sim publishes its weekly schedule only to
/// its own in-game UI, so the schedule capability has nothing to read.
/// </summary>
internal sealed class LeMansUltimateGameProvider : IGameProvider
{
    public GameDescriptor Descriptor => LeMansUltimateGameData.Descriptor;

    public IResultsImporter? Results => null;

    public ISetupRepository? Setups => null;

    public IScheduleSource? Schedule => null;

    public ITelemetrySource CreateTelemetrySource()
    {
        return new LeMansUltimateTelemetrySource();
    }
}
