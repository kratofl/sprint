#if DEBUG
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Development;
using Sprint.Desktop.Features.Diagnostics;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DevelopmentGameStateTests
{
    [Fact]
    public void GlobalSimulationCombinesGameConditionsAndCanReturnToLiveTelemetry()
    {
        var log = new LiveLogStore();
        var simulation = new DevelopmentGameState(log);
        var live = new TelemetryFrame
        {
            Session = new SessionInfo { Game = "LMU", InCar = true },
            Car = new CarState { SpeedMetersPerSecond = 12, Gear = 2, Rpm = 3200 },
        };

        Assert.Same(live, simulation.Resolve(live));

        simulation.ApplyPreset(DevelopmentGamePreset.Racing);
        simulation.Update(simulation.Values with
        {
            YellowFlag = true,
            TractionControlActive = true,
            DeltaSeconds = -0.35,
        });

        var simulated = simulation.Resolve(live);
        Assert.True(simulation.Enabled);
        Assert.Equal("Sprint Development Simulator", simulated.Session.Game);
        Assert.Equal(SessionType.Race, simulated.Session.SessionType);
        Assert.True(simulated.Session.InCar);
        Assert.InRange(simulated.Car.SpeedMetersPerSecond, 61.0f, 61.2f);
        Assert.Equal(5, simulated.Car.Gear);
        Assert.True(simulated.Flags.Yellow);
        Assert.True(simulated.Electronics.TractionControlActive);
        Assert.Equal(-0.35, simulated.Lap.Delta, precision: 2);

        simulation.SetEnabled(false);
        Assert.Same(live, simulation.Resolve(live));
        Assert.Contains(log.Entries, entry =>
            entry.Message.Contains("simulation disabled", StringComparison.OrdinalIgnoreCase));
    }
}
#endif
