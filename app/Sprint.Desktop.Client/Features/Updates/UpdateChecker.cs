using System.Globalization;

namespace Sprint.Desktop.Features.Updates;

/// <summary>A downloadable artifact attached to a release (platform archive).</summary>
public sealed record ReleaseAsset(string Name, string DownloadUrl);

/// <summary>A published release candidate (from GitHub releases or a test feed).</summary>
public sealed record ReleaseInfo(string Version, string Channel, string Url)
{
    /// <summary>Downloadable assets on the release (platform archives); empty when unknown.</summary>
    public IReadOnlyList<ReleaseAsset> Assets { get; init; } = [];
}

/// <summary>The result of a channel-aware update check.</summary>
public sealed record UpdateCheckResult(bool UpdateAvailable, ReleaseInfo? Latest, string CurrentVersion);

/// <summary>
/// Pure, channel-aware update-availability logic (matrix 4.9 US40), the .NET port
/// of the Go <c>updater.CheckLatest</c>. Given the current version, the user's
/// update channel, and the set of available releases, it picks the newest release
/// visible on that channel and reports whether it is newer than the running build.
/// Network fetching is separate (<see cref="GitHubReleaseSource"/>) so this stays
/// unit-testable with synthetic release data.
///
/// <para>Channel visibility: <c>stable</c> sees stable only; <c>pre-release</c>
/// sees stable + pre-release. Legacy <c>beta</c>/<c>alpha</c> strings are treated
/// as pre-release for backward compatibility with older releases and settings.</para>
/// </summary>
public static class UpdateChecker
{
    public static UpdateCheckResult Check(string currentVersion, string channel, IEnumerable<ReleaseInfo> releases)
    {
        ArgumentNullException.ThrowIfNull(releases);
        var maxRank = ChannelRank(channel);

        ReleaseInfo? best = null;
        foreach (var release in releases)
        {
            if (ChannelRank(release.Channel) > maxRank)
            {
                continue;
            }

            if (best is null || Compare(release.Version, best.Version) > 0)
            {
                best = release;
            }
        }

        var available = best is not null && Compare(best.Version, currentVersion) > 0;
        return new UpdateCheckResult(available, available ? best : null, Normalize(currentVersion));
    }

    private static int ChannelRank(string? channel) => channel?.Trim().ToLowerInvariant() switch
    {
        // pre-release (and the legacy beta/alpha aliases) sees prereleases; stable does not.
        "pre-release" or "prerelease" or "beta" or "alpha" => 1,
        _ => 0,
    };

    /// <summary>SemVer-ish compare of two versions. Returns &gt;0 if <paramref name="a"/> is newer, &lt;0 if older, 0 if equal.</summary>
    public static int Compare(string a, string b)
    {
        var (coreA, preA) = Split(a);
        var (coreB, preB) = Split(b);

        for (var i = 0; i < 3; i++)
        {
            var cmp = coreA[i].CompareTo(coreB[i]);
            if (cmp != 0)
            {
                return cmp;
            }
        }

        // A build with a pre-release tag is older than the same core without one.
        if (preA.Length == 0 && preB.Length == 0) return 0;
        if (preA.Length == 0) return 1;
        if (preB.Length == 0) return -1;
        return string.CompareOrdinal(preA, preB);
    }

    private static (int[] Core, string Pre) Split(string version)
    {
        var v = Normalize(version);
        var dash = v.IndexOf('-');
        var pre = dash >= 0 ? v[(dash + 1)..] : "";
        var core = dash >= 0 ? v[..dash] : v;

        var parts = core.Split('.');
        var numbers = new int[3];
        for (var i = 0; i < 3 && i < parts.Length; i++)
        {
            numbers[i] = int.TryParse(parts[i], NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : 0;
        }

        return (numbers, pre);
    }

    private static string Normalize(string version)
    {
        var v = (version ?? "").Trim();
        if (v.StartsWith('v') || v.StartsWith('V'))
        {
            v = v[1..];
        }

        var plus = v.IndexOf('+');
        return plus >= 0 ? v[..plus] : v;
    }
}
