using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class AppSettingsChannelTests
{
    [Theory]
    [InlineData("stable", "stable")]
    [InlineData("STABLE", "stable")]
    [InlineData("pre-release", "pre-release")]
    [InlineData("prerelease", "pre-release")]
    [InlineData("beta", "pre-release")]
    [InlineData("alpha", "pre-release")]
    [InlineData("", "stable")]
    [InlineData(null, "stable")]
    [InlineData("nonsense", "stable")]
    public void NormalizeChannelFoldsToTwoChannels(string? input, string expected) =>
        Assert.Equal(expected, AppSettings.NormalizeChannel(input));

    [Fact]
    public void LapTelemetryIsKeptForGoodUntilTheDriverSetsAnAgeLimit()
    {
        LapTraceBudget kept = new SessionPlannerSettings().TraceBudget();
        LapTraceBudget limited = new SessionPlannerSettings { TraceExpiryDays = 90 }.TraceBudget();

        Assert.Null(kept.MaxAgeDays);
        Assert.True(kept.ProtectedPerContext > 0);
        Assert.Equal(90, limited.MaxAgeDays);
    }
}
