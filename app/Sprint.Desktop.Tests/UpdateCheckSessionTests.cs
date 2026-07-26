using Sprint.Desktop.Features.Updates;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class UpdateCheckSessionTests
{
    [Fact]
    public async Task ReusesSuccessfulCheckForTheSameVersionAndChannel()
    {
        var fetchCount = 0;
        var releases = new[]
        {
            new ReleaseInfo("v0.1.2-alpha.5", "pre-release", "https://example.test/release"),
        };
        var session = new UpdateCheckSession(_ =>
        {
            fetchCount++;
            return Task.FromResult<IReadOnlyList<ReleaseInfo>>(releases);
        });

        var startupResult = await session.CheckAsync("0.0.1", "pre-release");
        var settingsResult = await session.CheckAsync("0.0.1", "pre-release");

        Assert.Equal(1, fetchCount);
        Assert.Same(startupResult, settingsResult);
        Assert.Equal("v0.1.2-alpha.5", settingsResult.Latest?.Version);
    }
}
