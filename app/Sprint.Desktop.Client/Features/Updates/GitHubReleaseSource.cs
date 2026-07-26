using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Updates;

/// <summary>
/// Fetches published releases from the GitHub Releases API and maps them to
/// <see cref="ReleaseInfo"/> for <see cref="UpdateChecker"/> (matrix 4.9 US40).
/// This is the only networked part of the updater; it runs on an explicit user
/// "Check for updates" action and on the best-effort startup notice, and degrades
/// gracefully (returns an empty list on any failure) so a check never crashes the
/// app. Release assets are carried through so <see cref="ReleaseAssetSelector"/> can
/// pick the platform archive for the one-click install (see docs/RELEASE.md).
/// </summary>
public sealed class GitHubReleaseSource(HttpClient? httpClient = null)
{
    /// <summary>The GitHub <c>owner/repo</c> the desktop app publishes releases to.</summary>
    public const string DefaultRepo = "kratofl/sprint";

    private readonly HttpClient _http = httpClient ?? CreateClient();

    public async Task<IReadOnlyList<ReleaseInfo>> FetchAsync(string ownerRepo, CancellationToken ct = default)
    {
        try
        {
            var url = $"https://api.github.com/repos/{ownerRepo}/releases";
            var releases = await _http.GetFromJsonAsync<GitHubRelease[]>(url, ct).ConfigureAwait(false);
            if (releases is null)
            {
                return [];
            }

            return releases
                .Where(release => !release.Draft && !string.IsNullOrWhiteSpace(release.TagName))
                .Select(release => new ReleaseInfo(
                    release.TagName!,
                    release.Prerelease ? "pre-release" : "stable",
                    release.HtmlUrl ?? "")
                {
                    Assets = (release.Assets ?? [])
                        .Where(asset => !string.IsNullOrWhiteSpace(asset.Name)
                            && !string.IsNullOrWhiteSpace(asset.DownloadUrl))
                        .Select(asset => new ReleaseAsset(asset.Name!, asset.DownloadUrl!))
                        .ToArray(),
                })
                .ToArray();
        }
        catch (Exception)
        {
            // Network / parse failure → treat as "no releases"; the caller shows
            // "check failed" rather than crashing (US40 never-crash contract).
            return [];
        }
    }

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Sprint-Desktop-Updater");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return client;
    }

    private sealed record GitHubRelease
    {
        [JsonPropertyName("tag_name")]
        public string? TagName { get; init; }

        [JsonPropertyName("html_url")]
        public string? HtmlUrl { get; init; }

        [JsonPropertyName("draft")]
        public bool Draft { get; init; }

        [JsonPropertyName("prerelease")]
        public bool Prerelease { get; init; }

        [JsonPropertyName("assets")]
        public GitHubAsset[]? Assets { get; init; }
    }

    private sealed record GitHubAsset
    {
        [JsonPropertyName("name")]
        public string? Name { get; init; }

        [JsonPropertyName("browser_download_url")]
        public string? DownloadUrl { get; init; }
    }
}
