using Sprint.Desktop.Api.Telemetry;
using Sprint.Games.LeMansUltimate;

namespace Sprint.Games;

public static class GameTelemetryPackage
{
    public static IReadOnlyList<GameDescriptor> SupportedGames { get; } =
    [
        LeMansUltimateGameData.Descriptor,
        new("demo", "Sprint Demo", "in-process simulation", true)
    ];

    /// <summary>
    /// Instantiate the telemetry source for a supported game. This is the only place
    /// the registry's descriptors are turned into live adapters; the desktop
    /// composition root selects a descriptor and asks for its source here rather than
    /// newing an adapter (and leaking game knowledge) itself.
    /// </summary>
    /// <exception cref="ArgumentException">No adapter is registered for the descriptor.</exception>
    public static ITelemetrySource CreateSource(GameDescriptor descriptor)
    {
        ArgumentNullException.ThrowIfNull(descriptor);

        if (descriptor.Id == LeMansUltimateGameData.Descriptor.Id)
        {
            return new LeMansUltimateTelemetrySource();
        }

        if (descriptor.Id == "demo")
        {
            return new DemoTelemetrySource();
        }

        throw new ArgumentException($"No telemetry source is registered for game '{descriptor.Id}'.", nameof(descriptor));
    }

    public static ITelemetrySource CreateDemoSource()
    {
        return new DemoTelemetrySource();
    }
}
