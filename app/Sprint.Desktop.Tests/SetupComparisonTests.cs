using Sprint.Desktop.Features.Setup;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class SetupComparisonTests
{
    [Fact]
    public void SetupCompareReturnsZeroForIdenticalPrograms()
    {
        SetupProgram a = new SetupProgram { Id = "a", Name = "A", Values = { ["fuelLoad"] = 40, ["rearWing"] = 6 } };
        SetupProgram b = new SetupProgram { Id = "b", Name = "B", Values = { ["fuelLoad"] = 40, ["rearWing"] = 6 } };

        SetupPrediction prediction = SetupComparison.Compare(a, b);
        Assert.Equal(0, prediction.LapDeltaSeconds);
        Assert.Empty(prediction.Contributions);
    }

    [Fact]
    public void SetupCompareMorefuelPredictsSlowerCandidate()
    {
        SetupProgram baseline = new SetupProgram { Id = "a", Name = "A", Values = { ["fuelLoad"] = 40 } };
        SetupProgram heavy = new SetupProgram { Id = "b", Name = "B", Values = { ["fuelLoad"] = 60 } };

        SetupPrediction prediction = SetupComparison.Compare(baseline, heavy);
        Assert.True(prediction.LapDeltaSeconds > 0, "More fuel should predict a slower (positive delta) candidate.");
        Assert.Equal("fuelLoad", Assert.Single(prediction.Contributions).Key);
    }
}
