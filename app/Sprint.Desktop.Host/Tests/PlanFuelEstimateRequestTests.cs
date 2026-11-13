using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// The plan dialogs' fuel calculator (<c>POST /api/planner/fuel-estimate</c>) takes only what
/// <c>plan.create</c> would: its inputs are rebuilt on every keystroke, so an absurd figure is
/// refused with the reason rather than worked out.
/// </summary>
public sealed class PlanFuelEstimateRequestTests
{
    [Fact]
    public void A_request_becomes_the_calculators_inputs()
    {
        PlanFuelEstimateRequest request = new(" Le Mans Ultimate ", "Porsche 963", "Spa", "TimeBased", 60, FuelReserveLaps: null, AvgLapTimeSeconds: 125.4, FuelPerLapLiters: null);

        Assert.True(request.TryGetInputs(defaultReserveLaps: 2, out PlanFuelInputs inputs, out string error), error);

        Assert.Equal(new PlanContext("Le Mans Ultimate", "Porsche 963", "Spa"), inputs.Context);
        Assert.Equal(RaceLengthFormat.TimeBased, inputs.RaceLengthFormat);
        Assert.Equal(60, inputs.RaceLengthValue);
        // No reserve sent: the planner's default, as a new plan takes it.
        Assert.Equal(2, inputs.FuelReserveLaps);
        Assert.Equal(125.4, inputs.AvgLapTimeSeconds);
        Assert.Null(inputs.FuelPerLapLiters);
    }

    [Fact]
    public void A_race_length_not_known_yet_is_still_a_request()
    {
        PlanFuelEstimateRequest request = new("Le Mans Ultimate", "Porsche 963", "Spa", RaceLengthFormat: null, RaceLengthValue: null, 1, null, null);

        Assert.True(request.TryGetInputs(defaultReserveLaps: 1, out PlanFuelInputs inputs, out _));
        Assert.Equal(RaceLengthFormat.Unknown, inputs.RaceLengthFormat);
    }

    [Theory]
    [InlineData("Laps", 30.0, 1.0, null, null, "raceLengthFormat")]
    [InlineData("1", 30.0, 1.0, null, null, "raceLengthFormat")]
    [InlineData("LapBased", 3000.0, 1.0, null, null, "laps")]
    [InlineData("TimeBased", 60.0, 1.5, null, null, "fuelReserveLaps")]
    [InlineData("TimeBased", 60.0, 11.0, null, null, "fuelReserveLaps")]
    [InlineData("TimeBased", 60.0, 1.0, 5.0, null, "avgLapTimeSeconds")]
    [InlineData("TimeBased", 60.0, 1.0, null, 0.0, "fuelPerLapLiters")]
    [InlineData("TimeBased", 60.0, 1.0, null, 150.0, "fuelPerLapLiters")]
    public void Figures_no_race_could_have_are_refused(string format, double length, double reserve, double? lapTime, double? perLap, string named)
    {
        PlanFuelEstimateRequest request = new("Le Mans Ultimate", "Porsche 963", "Spa", format, length, reserve, lapTime, perLap);

        Assert.False(request.TryGetInputs(defaultReserveLaps: 1, out _, out string error));
        Assert.Contains(named, error, StringComparison.Ordinal);
    }
}
