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
}
