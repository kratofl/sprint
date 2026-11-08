using Sprint.Desktop.Features.Updates;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class UpdateCheckSessionTests
{
    [Fact]
    public async Task ReusesSuccessfulCheckForTheSameVersionAndChannel()
    {
        int fetchCount = 0;
        ReleaseInfo[] releases = new[]
        {
            new ReleaseInfo("v0.1.2-alpha.5", "pre-release", "https://example.test/release"),
        };
        UpdateCheckSession session = new UpdateCheckSession(_ =>
        {
            fetchCount++;
            return Task.FromResult<IReadOnlyList<ReleaseInfo>>(releases);
        });

        UpdateCheckResult startupResult = await session.CheckAsync("0.0.1", "pre-release");
        UpdateCheckResult settingsResult = await session.CheckAsync("0.0.1", "pre-release");

        Assert.Equal(1, fetchCount);
        Assert.Same(startupResult, settingsResult);
        Assert.Equal("v0.1.2-alpha.5", settingsResult.Latest?.Version);
    }
}
