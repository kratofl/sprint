using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games;

public static class GameTelemetryPackage
{
    public static IReadOnlyList<GameDescriptor> SupportedGames { get; } =
    [
        LeMansUltimate.LeMansUltimateGameData.Descriptor,
        new("demo", "Sprint Demo", "in-process simulation", true)
    ];

    public static ITelemetrySource CreateDemoSource()
    {
        return new DemoTelemetrySource();
    }
}
