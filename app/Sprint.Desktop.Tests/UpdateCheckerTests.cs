using Sprint.Desktop.Features.Updates;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class UpdateCheckerTests
{
    private static readonly ReleaseInfo[] Feed =
    [
        new ReleaseInfo("v0.1.0", "stable", "u/0.1.0"),
        new ReleaseInfo("v0.2.0", "stable", "u/0.2.0"),
        new ReleaseInfo("v0.3.0-beta.1", "pre-release", "u/0.3.0b1"),
        new ReleaseInfo("v0.4.0-alpha.1", "pre-release", "u/0.4.0a1"),
    ];

    [Theory]
    [InlineData("1.2.3", "1.2.4", -1)]
    [InlineData("v1.2.4", "1.2.3", 1)]
    [InlineData("1.2.3", "1.2.3", 0)]
    [InlineData("1.2.3-beta", "1.2.3", -1)] // pre-release is older than the release
    [InlineData("2.0.0", "1.9.9", 1)]
    public void CompareOrdersVersions(string a, string b, int expectedSign) =>
        Assert.Equal(expectedSign, Math.Sign(UpdateChecker.Compare(a, b)));

    [Fact]
    public void StableChannelOnlySeesStableReleases()
    {
        var result = UpdateChecker.Check("0.1.0", "stable", Feed);
        Assert.True(result.UpdateAvailable);
        Assert.Equal("v0.2.0", result.Latest!.Version);
    }

    [Fact]
    public void PreReleaseChannelSeesPreReleases()
    {
        var result = UpdateChecker.Check("0.1.0", "pre-release", Feed);
        Assert.True(result.UpdateAvailable);
        Assert.Equal("v0.4.0-alpha.1", result.Latest!.Version);
    }

    [Theory]
    [InlineData("beta")]
    [InlineData("alpha")]
    public void LegacyChannelAliasesBehaveLikePreRelease(string legacyChannel)
    {
        var result = UpdateChecker.Check("0.1.0", legacyChannel, Feed);
        Assert.True(result.UpdateAvailable);
        Assert.Equal("v0.4.0-alpha.1", result.Latest!.Version);
    }

    [Fact]
    public void NoUpdateWhenCurrentIsNewest()
    {
        var result = UpdateChecker.Check("9.9.9", "pre-release", Feed);
        Assert.False(result.UpdateAvailable);
        Assert.Null(result.Latest);
    }

    [Fact]
    public void BuildInfoReportsANonEmptyVersion()
    {
        Assert.False(string.IsNullOrWhiteSpace(BuildInfo.Version));
        Assert.Equal("beta", BuildInfo.DisplayChannel("BETA"));
        Assert.Equal("stable", BuildInfo.DisplayChannel(""));
    }
}
