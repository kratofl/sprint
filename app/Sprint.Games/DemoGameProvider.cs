using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games;

/// <summary>
/// The in-process dev/test simulation as a game. It has no archive, no setup folder and no
/// schedule — nothing exists on disk for a simulation — so every optional capability stays
/// null and capability-gated UI hides itself while the demo is the active game.
/// </summary>
internal sealed class DemoGameProvider : IGameProvider
{
    public GameDescriptor Descriptor { get; } = new(
        Id: "demo",
        Name: "Sprint Demo",
        Transport: "in-process simulation",
        Available: true);

    public IResultsImporter? Results => null;

    public ISetupRepository? Setups => null;

    public IScheduleSource? Schedule => null;

    public ITelemetrySource CreateTelemetrySource()
    {
        return new DemoTelemetrySource();
    }
}
