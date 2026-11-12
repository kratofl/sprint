using System.Text.Json;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.PitWall;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>The pit wall's commands: the layout reaches the store <c>/api/state</c> reads, a bad one is refused, and the share switch is remembered.</summary>
public sealed class PitWallCommandTests : IDisposable
{
    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Host.Tests", Guid.NewGuid().ToString("N"));
    private readonly DesktopRuntime _runtime;
    private readonly PitWallLayoutStore _layouts;
    private readonly RuntimeCoordinator _coordinator;

    public PitWallCommandTests()
    {
        Directory.CreateDirectory(this._dataRoot);
        this._runtime = new DesktopRuntime(this._dataRoot, PresetRoot);
        this._layouts = new PitWallLayoutStore(this._dataRoot);
        this._coordinator = new RuntimeCoordinator(this._runtime, pitWall: this._layouts);
    }

    public void Dispose() => Directory.Delete(this._dataRoot, recursive: true);

    [Fact]
    public void SaveLayout_ReplacesThePagesAndKeepsWhereTheMainWindowIs()
    {
        Assert.True(this.Execute("""{"type":"pitwall.placeWindow","kind":"main","bounds":{"x":0,"y":0,"width":1920,"height":1080}}""", out string error), error);

        Assert.True(this.Execute("""{"type":"pitwall.saveLayout","layout":{"pages":[{"id":"race","name":"Race","tiles":[{"id":"t1","layers":["timing","radar"],"x":0,"y":0,"w":7,"h":5,"cycleSeconds":8,"jumpRadar":true}]}]}}""", out error), error);

        PitWallTile tile = Assert.Single(Assert.Single(this._layouts.Layout.Pages).Tiles);
        Assert.Equal(new[] { "timing", "radar" }, tile.Layers);
        Assert.True(tile.JumpRadar);
        Assert.Equal(new PitWallBounds(0, 0, 1920, 1080), this._layouts.Layout.MainBounds);
        Assert.True(File.Exists(Path.Combine(this._dataRoot, PitWallLayoutStore.FileName)));
    }

    [Fact]
    public void SaveLayout_RefusesOverlappingTilesAndKeepsTheOldLayout()
    {
        bool ok = this.Execute("""{"type":"pitwall.saveLayout","layout":{"pages":[{"id":"a","name":"A","tiles":[{"id":"t1","layers":["timing"],"x":0,"y":0,"w":2,"h":2},{"id":"t2","layers":["track"],"x":1,"y":1,"w":2,"h":2}]}]}}""", out string error);

        Assert.False(ok);
        Assert.Contains("overlaps", error, StringComparison.Ordinal);
        Assert.Same(PitWallLayouts.Default, this._layouts.Layout);
    }

    [Fact]
    public void PlaceWindow_NeedsAKnownWindowAndUsableBounds()
    {
        Assert.False(this.Execute("""{"type":"pitwall.placeWindow","kind":"page","id":"nope","bounds":{"x":0,"y":0,"width":800,"height":600}}""", out string error));
        Assert.Contains("nope", error, StringComparison.Ordinal);
        Assert.False(this.Execute("""{"type":"pitwall.placeWindow","kind":"tile","id":"race-timing","bounds":{"x":0,"y":0,"width":0,"height":600}}""", out error));
        Assert.False(this.Execute("""{"type":"pitwall.placeWindow","kind":"dock","bounds":{"x":0,"y":0,"width":800,"height":600}}""", out error));

        Assert.True(this.Execute("""{"type":"pitwall.placeWindow","kind":"tile","id":"race-timing","bounds":{"x":2560,"y":40,"width":900,"height":600}}""", out error), error);
        Assert.Equal(new PitWallBounds(2560, 40, 900, 600), this._layouts.Layout.Pages.SelectMany(page => page.Tiles).Single(tile => tile.Id == "race-timing").Bounds);
    }

    [Fact]
    public void ResetLayout_GoesBackToTheDefaultPages()
    {
        Assert.True(this.Execute("""{"type":"pitwall.saveLayout","layout":{"pages":[{"id":"a","name":"A","tiles":[]}]}}""", out string error), error);

        Assert.True(this.Execute("""{"type":"pitwall.resetLayout"}""", out error), error);

        Assert.Equal(new[] { "race", "car", "traces" }, this._layouts.Layout.Pages.Select(page => page.Id));
    }

    [Fact]
    public void SharePlan_IsRememberedInTheSettings()
    {
        Assert.True(this._runtime.Settings.LiveLink.SharePlan);

        Assert.True(this.Execute("""{"type":"link.sharePlan","share":false}""", out string error), error);
        Assert.False(this.Execute("""{"type":"link.sharePlan"}""", out _));

        Assert.False(new DesktopRuntime(this._dataRoot, PresetRoot).Settings.LiveLink.SharePlan);
    }

    private bool Execute(string json, out string error)
    {
        using JsonDocument document = JsonDocument.Parse(json);
        return this._coordinator.Execute(document.RootElement, out error);
    }

    private static string PresetRoot
    {
        get
        {
            for (DirectoryInfo? dir = new(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            {
                string presets = Path.Combine(dir.FullName, "app", "Sprint.Desktop.Host", "presets");
                if (Directory.Exists(presets))
                    return presets;
            }

            throw new DirectoryNotFoundException("Could not find app/Sprint.Desktop.Host/presets.");
        }
    }
}
