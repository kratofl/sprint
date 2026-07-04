using System.Linq;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The <see cref="GameTelemetryPackage.CreateSource"/> factory: the registry advertises
/// games; this is the only place a descriptor becomes a live adapter (WS4/US15).
/// </summary>
public sealed class GameSourceFactoryTests
{
    [Fact]
    public void Creates_the_demo_source()
    {
        var demo = GameTelemetryPackage.SupportedGames.Single(g => g.Id == "demo");

        using var source = GameTelemetryPackage.CreateSource(demo);

        Assert.Equal("Sprint Demo", source.Name);
    }

    [Fact]
    public void Creates_the_lmu_adapter_which_idles_non_fatally_without_a_running_game()
    {
        var lmu = GameTelemetryPackage.SupportedGames.Single(g => g.Id == "lemansultimate");

        using var source = GameTelemetryPackage.CreateSource(lmu);
        Assert.Equal("Le Mans Ultimate", source.Name);

        // No LMU_Data shared memory exists in the test environment, so connecting must
        // land in a visible, non-fatal not-connected state — never Connected, never a crash.
        source.Connect();
        Assert.NotEqual(TelemetryConnectionState.Connected, source.Status.State);
        Assert.Contains(source.Status.State, new[]
        {
            TelemetryConnectionState.WaitingForGame, // Windows: shared memory not found
            TelemetryConnectionState.Unsupported     // non-Windows: provider not supported
        });
    }

    [Fact]
    public void Rejects_an_unregistered_game()
    {
        var unknown = new GameDescriptor("nope", "Nope", "none", Available: false);

        Assert.Throws<ArgumentException>(() => GameTelemetryPackage.CreateSource(unknown));
    }
}
