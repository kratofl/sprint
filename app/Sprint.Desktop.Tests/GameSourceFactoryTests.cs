using Sprint.Desktop.Api.Telemetry;
using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Turning a registered game into a live adapter (WS4/US15). Provider identity and
/// capability discovery are covered by <see cref="GameProviderTests"/>; this pins the one
/// behaviour that only a real adapter can show — what happens with no game running.
/// </summary>
public sealed class GameSourceFactoryTests
{
    [Fact]
    public void Creates_the_lmu_adapter_which_idles_non_fatally_without_a_running_game()
    {
        var lmu = GameProviders.Find("lemansultimate");
        Assert.NotNull(lmu);

        using var source = lmu.CreateTelemetrySource();
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
}
