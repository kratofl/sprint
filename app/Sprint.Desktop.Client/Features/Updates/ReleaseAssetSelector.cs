namespace Sprint.Desktop.Features.Updates;

/// <summary>
/// Pure selection of the release archive that matches the running platform. The
/// desktop release workflow (<c>.github/workflows/desktop-release.yml</c>) uploads
/// one archive per RID: <c>sprint-&lt;tag&gt;-windows-amd64.zip</c> (win-x64) and
/// <c>sprint-&lt;tag&gt;-linux-amd64.tar.gz</c> (linux-x64), each containing the
/// self-contained binary plus <c>presets/</c> and <c>Assets/</c>. This maps a RID
/// to the matching asset so the installer downloads the right one; kept pure and
/// IO-free so it stays unit-testable with synthetic asset lists.
/// </summary>
public static class ReleaseAssetSelector
{
    /// <summary>
    /// Picks the asset whose name marks it as the archive for <paramref name="runtimeIdentifier"/>,
    /// or <c>null</c> when the release carries no matching archive.
    /// </summary>
    public static ReleaseAsset? Select(IReadOnlyList<ReleaseAsset> assets, string runtimeIdentifier)
    {
        ArgumentNullException.ThrowIfNull(assets);

        var marker = PlatformMarker(runtimeIdentifier);
        if (marker is null)
        {
            return null;
        }

        return assets.FirstOrDefault(asset =>
            asset.Name.Contains(marker, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>The asset-name substring that identifies the archive for a RID (label used by the release workflow).</summary>
    private static string? PlatformMarker(string? runtimeIdentifier) =>
        runtimeIdentifier?.Trim().ToLowerInvariant() switch
        {
            "win-x64" => "windows-amd64",
            "linux-x64" => "linux-amd64",
            _ => null,
        };
}
