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
    public void ThePlannerSettingsDescribeATraceDiskBudgetRatherThanACaptureRate()
    {
        // #101's 60 Hz time grid was rejected: the corpus is position-gridded, and two laps
        // sampled by time never share an x-axis. What is configurable is how much disk the
        // trace tier may use, not how fast it samples.
        var budget = new SessionPlannerSettings().TraceBudget();

        Assert.True(budget.MaxTotalBytes > 0);
        Assert.True(budget.ProtectedPerContext > 0);
        Assert.Equal(90, budget.MaxAgeDays);
    }

    [Fact]
    public void TheTraceBudgetIsExpressedInBytesFromTheStoredMegabytes()
    {
        var settings = new SessionPlannerSettings { TraceMaxTotalMegabytes = 2 };

        Assert.Equal(2L * 1024 * 1024, settings.TraceBudget().MaxTotalBytes);
    }

    [Fact]
    public void TurningRetentionDaysOffLeavesOnlyTheSizeCeiling()
    {
        var settings = new SessionPlannerSettings { TraceRetentionDays = 0 };

        Assert.Null(settings.TraceBudget().MaxAgeDays);
    }

    [Fact]
    public void EveryOfferedStorageBudgetIsSelectable()
    {
        // The settings combo picks by index, so a stored value outside the offered list would
        // leave the control showing nothing.
        Assert.Contains(
            new SessionPlannerSettings().TraceMaxTotalMegabytes,
            SessionPlannerSettings.TraceStorageBudgets);
    }
}
