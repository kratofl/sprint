using Sprint.Desktop.Features.Updates;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class ReleaseAssetSelectorTests
{
    private static readonly ReleaseAsset[] Assets =
    [
        new ReleaseAsset("sprint-v1.2.3-windows-amd64.zip", "https://dl/win.zip"),
        new ReleaseAsset("sprint-v1.2.3-linux-amd64.tar.gz", "https://dl/linux.tar.gz"),
    ];

    [Fact]
    public void SelectsWindowsArchiveForWinRid()
    {
        ReleaseAsset? asset = ReleaseAssetSelector.Select(Assets, "win-x64");
        Assert.Equal("sprint-v1.2.3-windows-amd64.zip", asset!.Name);
    }

    [Fact]
    public void SelectsLinuxArchiveForLinuxRid()
    {
        ReleaseAsset? asset = ReleaseAssetSelector.Select(Assets, "linux-x64");
        Assert.Equal("sprint-v1.2.3-linux-amd64.tar.gz", asset!.Name);
    }

    [Fact]
    public void ReturnsNullForUnknownRid()
    {
        Assert.Null(ReleaseAssetSelector.Select(Assets, "osx-arm64"));
    }

    [Fact]
    public void ReturnsNullWhenNoMatchingAsset()
    {
        ReleaseAsset[] onlyLinux = new[] { Assets[1] };
        Assert.Null(ReleaseAssetSelector.Select(onlyLinux, "win-x64"));
    }

    [Fact]
    public void ReturnsNullForEmptyAssetList()
    {
        Assert.Null(ReleaseAssetSelector.Select([], "win-x64"));
    }
}
