using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games;

/// <summary>
/// The dev/test entry point for the in-process simulation. Game selection and telemetry
/// creation live on <see cref="GameProviders"/>; asking for the demo by name stays a
/// separate, deliberate call so no default code path can reach synthetic data by accident.
/// </summary>
public static class GameTelemetryPackage
{
    public static ITelemetrySource CreateDemoSource()
    {
        return new DemoTelemetrySource();
    }
}
