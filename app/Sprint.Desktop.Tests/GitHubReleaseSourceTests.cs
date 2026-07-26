using System.Net;
using System.Text;
using Sprint.Desktop.Features.Updates;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Covers the JSON → <see cref="ReleaseInfo"/> mapping of the only networked updater
/// seam: two-channel mapping (<c>prerelease</c> → <c>pre-release</c>), asset
/// pass-through for the one-click install, draft filtering, and the never-crash
/// contract on a failing feed. The HTTP layer is stubbed, so no network is touched.
/// </summary>
public sealed class GitHubReleaseSourceTests
{
    private const string Feed = """
    [
      {
        "tag_name": "v0.3.0",
        "html_url": "https://github.com/kratofl/sprint/releases/tag/v0.3.0",
        "draft": false,
        "prerelease": false,
        "assets": [
          {
            "name": "sprint-v0.3.0-windows-amd64.zip",
            "browser_download_url": "https://example.test/sprint-v0.3.0-windows-amd64.zip"
          },
          {
            "name": "sprint-v0.3.0-linux-amd64.tar.gz",
            "browser_download_url": "https://example.test/sprint-v0.3.0-linux-amd64.tar.gz"
          },
          {
            "name": "no-url.zip",
            "browser_download_url": ""
          }
        ]
      },
      {
        "tag_name": "v0.4.0-beta.1",
        "html_url": "https://github.com/kratofl/sprint/releases/tag/v0.4.0-beta.1",
        "draft": false,
        "prerelease": true,
        "assets": []
      },
      {
        "tag_name": "v0.5.0",
        "draft": true,
        "prerelease": false
      }
    ]
    """;

    [Fact]
    public async Task FetchMapsChannelsAssetsAndSkipsDrafts()
    {
        var source = new GitHubReleaseSource(StubClient(HttpStatusCode.OK, Feed));

        var releases = await source.FetchAsync(GitHubReleaseSource.DefaultRepo);

        Assert.Equal(2, releases.Count);

        var stable = releases.Single(release => release.Version == "v0.3.0");
        Assert.Equal("stable", stable.Channel);
        Assert.Equal("https://github.com/kratofl/sprint/releases/tag/v0.3.0", stable.Url);

        // Assets without a download URL are dropped so the selector only ever sees
        // archives it can actually fetch.
        Assert.Equal(2, stable.Assets.Count);
        var windows = ReleaseAssetSelector.Select(stable.Assets, "win-x64");
        Assert.Equal("sprint-v0.3.0-windows-amd64.zip", windows!.Name);
        Assert.Equal("https://example.test/sprint-v0.3.0-windows-amd64.zip", windows.DownloadUrl);
        Assert.Equal("sprint-v0.3.0-linux-amd64.tar.gz", ReleaseAssetSelector.Select(stable.Assets, "linux-x64")!.Name);

        // GitHub's boolean prerelease flag is the only channel signal; it maps to the
        // canonical two-channel name (not the retired "beta").
        var pre = releases.Single(release => release.Version == "v0.4.0-beta.1");
        Assert.Equal("pre-release", pre.Channel);
        Assert.Empty(pre.Assets);

        Assert.DoesNotContain(releases, release => release.Version == "v0.5.0");
    }

    [Fact]
    public async Task PreReleaseFeedIsVisibleOnlyOnThePreReleaseChannel()
    {
        var source = new GitHubReleaseSource(StubClient(HttpStatusCode.OK, Feed));
        var releases = await source.FetchAsync(GitHubReleaseSource.DefaultRepo);

        Assert.Equal("v0.3.0", UpdateChecker.Check("0.1.0", "stable", releases).Latest!.Version);
        Assert.Equal("v0.4.0-beta.1", UpdateChecker.Check("0.1.0", "pre-release", releases).Latest!.Version);
    }

    [Fact]
    public async Task FailingFeedYieldsNoReleasesInsteadOfThrowing()
    {
        var source = new GitHubReleaseSource(StubClient(HttpStatusCode.ServiceUnavailable, "nope"));

        Assert.Empty(await source.FetchAsync(GitHubReleaseSource.DefaultRepo));
    }

    private static HttpClient StubClient(HttpStatusCode status, string body) =>
        new(new StubHandler(status, body));

    private sealed class StubHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            });
    }
}
