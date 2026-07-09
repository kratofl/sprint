using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashEditorControllerTests
{
    private static DashLayout NewLayout() => new()
    {
        Id = "edit-me",
        Name = "Edit Me",
        GridCols = 20,
        GridRows = 12,
        IdlePage = new DashPage { Id = "idle", Name = "Idle" },
        Pages = [new DashPage { Id = "main", Name = "Main" }],
    };

    [Fact]
    public void AddWidgetPlacesSelectsAndSaves()
    {
        var saves = 0;
        var controller = new DashEditorController(NewLayout(), _ => saves++);

        Assert.True(controller.AddWidget("gear_speed"));

        var widget = Assert.Single(controller.ActivePage!.Widgets);
        Assert.Equal("gear_speed", widget.Type);
        Assert.Equal(widget.Id, controller.SelectedWidgetId);
        Assert.Equal(1, saves);
    }

    [Fact]
    public void AddWidgetRejectsUnknownTypeWithoutSaving()
    {
        var saves = 0;
        var controller = new DashEditorController(NewLayout(), _ => saves++);

        Assert.False(controller.AddWidget("does_not_exist"));
        Assert.Empty(controller.ActivePage!.Widgets);
        Assert.Equal(0, saves);
    }

    [Fact]
    public void MoveSelectedClampsToGridAndSaves()
    {
        var saves = 0;
        var controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("fuel");
        saves = 0;

        Assert.True(controller.MoveSelected(100, 100)); // clamped into bounds
        var widget = controller.SelectedWidget!;
        Assert.True(widget.Col + widget.ColSpan <= 20);
        Assert.True(widget.Row + widget.RowSpan <= 12);
        Assert.Equal(1, saves);
    }

    [Fact]
    public void SetSelectedConfigStoresAndClearsStringValues()
    {
        var saves = 0;
        var controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("text");
        saves = 0;

        Assert.True(controller.SetSelectedConfig("content", "P1"));
        Assert.Equal("P1", controller.GetSelectedConfig("content"));
        Assert.Equal(1, saves);

        // Empty value clears the key; clearing the last key drops the config dictionary.
        Assert.True(controller.SetSelectedConfig("content", ""));
        Assert.Equal(string.Empty, controller.GetSelectedConfig("content"));
        Assert.Null(controller.SelectedWidget!.Config);
        Assert.Equal(2, saves);
    }

    [Fact]
    public void SetSelectedConfigWithoutSelectionIsNoOp()
    {
        var saves = 0;
        var controller = new DashEditorController(NewLayout(), _ => saves++);

        Assert.False(controller.SetSelectedConfig("content", "x"));
        Assert.Equal(0, saves);
    }

    [Fact]
    public void StyleOverridesSetAndCollapseToNullWhenEmptied()
    {
        var saves = 0;
        var controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("gear_speed");
        var widget = controller.SelectedWidget!;
        saves = 0;

        Assert.True(controller.SetSelectedTextColor("red"));
        Assert.True(controller.SetSelectedBorder(false));
        Assert.Equal("red", widget.Style!.TextColor);
        Assert.False(widget.Style!.Border);
        Assert.Equal(2, saves);

        // Clearing every override collapses the style back to null (no empty object persisted).
        Assert.True(controller.SetSelectedTextColor(null));
        Assert.True(controller.SetSelectedBorder(null));
        Assert.Null(widget.Style);
    }

    [Fact]
    public void ThemePresetAppliesAndResetClears()
    {
        var saves = 0;
        var controller = new DashEditorController(NewLayout(), _ => saves++);

        var ice = DashThemePresets.All.First(preset => preset.Name == "Ice").Theme;
        controller.ApplyThemePreset(ice);
        Assert.Equal("#1F7FE6", controller.Layout.Theme!.Primary);
        Assert.Equal("Ice", DashThemePresets.MatchName(controller.Layout.Theme));

        controller.SetThemeAccent("#FF6A00");
        Assert.Equal("#FF6A00", controller.Layout.Theme!.Accent);

        controller.ResetTheme();
        Assert.Null(controller.Layout.Theme);

        // The empty "Graphite" preset clears the theme rather than persisting an empty object.
        controller.ApplyThemePreset(DashThemePresets.All.First(preset => preset.Name == "Graphite").Theme);
        Assert.Null(controller.Layout.Theme);
    }

    [Fact]
    public void SuzukiThemePresetUsesPurplePrimary()
    {
        var suzuki = DashThemePresets.All.FirstOrDefault(preset => preset.Name == "Suzuki");

        Assert.NotNull(suzuki);
        Assert.Equal("#7C3AED", suzuki!.Theme.Primary);
        Assert.Equal("#B15CFF", suzuki.Theme.Accent);
    }

    [Fact]
    public void AddWidgetStackSelectsItAndClearsWidgetSelection()
    {
        var controller = new DashEditorController(NewLayout(), _ => { });
        controller.AddWidget("fuel");
        Assert.NotNull(controller.SelectedWidgetId);

        Assert.True(controller.AddWidgetStack());
        Assert.NotNull(controller.SelectedStackId);
        Assert.Null(controller.SelectedWidgetId);       // mutually exclusive
        Assert.NotNull(controller.ActiveLayer);          // active layer defaults to the stack's layer

        // Selecting a widget clears the stack selection.
        controller.SelectWidget(controller.ActivePage!.Widgets[0].Id);
        Assert.Null(controller.SelectedStackId);
    }

    [Fact]
    public void StackLayerEditingAddsWidgetsAndSwitchesActiveLayer()
    {
        var controller = new DashEditorController(NewLayout(), _ => { });
        Assert.True(controller.AddWidgetStack());
        var stack = controller.SelectedStack!;

        Assert.True(controller.AddWidgetToActiveLayer("gear_speed"));
        Assert.Single(controller.ActiveLayer!.Widgets);

        // A new layer becomes the active edit target; widgets land there.
        Assert.True(controller.AddStackLayer());
        Assert.Equal(2, stack.Layers.Count);
        Assert.Equal(stack.Layers[1].Id, controller.ActiveLayer!.Id);
        Assert.True(controller.AddWidgetToActiveLayer("fuel"));
        Assert.DoesNotContain(stack.Layers[0].Widgets, w => w.Type == "fuel"); // went to layer 2, not layer 1
        Assert.Single(stack.Layers[1].Widgets);

        Assert.True(controller.DeleteSelectedStack());
        Assert.Null(controller.SelectedStackId);
        Assert.Empty(controller.ActivePage!.WidgetStacks);
    }

    [Fact]
    public void MoveOntoAnotherWidgetIsRejected()
    {
        var controller = new DashEditorController(NewLayout(), _ => { });
        controller.AddWidget("fuel");     // slot 0,0
        var first = controller.SelectedWidget!;
        controller.AddWidget("lap_time"); // next free slot
        var second = controller.SelectedWidget!;

        // Move the second widget on top of the first: rejected, so it stays put.
        Assert.False(controller.MoveSelected(first.Col, first.Row));
        Assert.False(first.Col == second.Col && first.Row == second.Row);
    }

    [Fact]
    public void ResizeSelectedSaves()
    {
        var saves = 0;
        var controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("tyre_temp");
        saves = 0;

        Assert.True(controller.ResizeSelected(6, 4));
        Assert.Equal(6, controller.SelectedWidget!.ColSpan);
        Assert.Equal(4, controller.SelectedWidget!.RowSpan);
        Assert.Equal(1, saves);
    }

    [Fact]
    public void DeleteSelectedRemovesAndClearsSelection()
    {
        var controller = new DashEditorController(NewLayout(), _ => { });
        controller.AddWidget("delta");

        Assert.True(controller.DeleteSelected());
        Assert.Null(controller.SelectedWidgetId);
        Assert.Empty(controller.ActivePage!.Widgets);
    }

    [Fact]
    public void AddPageBecomesActiveAndClearsSelection()
    {
        var controller = new DashEditorController(NewLayout(), _ => { });
        controller.AddWidget("fuel");

        var page = controller.AddPage();
        Assert.Equal(page.Id, controller.ActivePageId);
        Assert.Null(controller.SelectedWidgetId);
        Assert.Contains(controller.PageTabs, t => t.Id == page.Id && !t.IsIdle);
    }

    [Fact]
    public void IdlePageIsAToggleableLockedTab()
    {
        var controller = new DashEditorController(NewLayout(), _ => { });
        var idle = Assert.Single(controller.PageTabs, t => t.IsIdle);

        Assert.True(controller.SelectPage(idle.Id));
        Assert.Equal(idle.Id, controller.ActivePageId);
        Assert.True(controller.AddWidget("text")); // widgets can be edited on the idle page
        Assert.Single(controller.Layout.IdlePage!.Widgets);

        // The idle page is not a deletable regular page.
        Assert.False(controller.DeletePage(idle.Id));
    }

    [Fact]
    public void DeleteActivePageReselectsAndSaves()
    {
        var saves = 0;
        var layout = NewLayout();
        var controller = new DashEditorController(layout, _ => saves++);
        var extra = controller.AddPage(); // "main" + new page
        controller.SelectPage(extra.Id);
        saves = 0;

        Assert.True(controller.DeletePage(extra.Id));
        Assert.NotEqual(extra.Id, controller.ActivePageId);
        Assert.Equal(1, saves);
    }

    [Fact]
    public void RenamePagePersists()
    {
        var controller = new DashEditorController(NewLayout(), _ => { });
        Assert.True(controller.RenamePage("main", "Race Trim"));
        Assert.Contains(controller.PageTabs, t => t.Name == "Race Trim");
    }

    [Fact]
    public void ActivePageUsesStrictLayoutEditorLookup()
    {
        var layout = NewLayout();
        var controller = new DashEditorController(layout, _ => { });

        Assert.Same(layout.Pages[0], DashLayoutEditor.FindPage(layout, controller.ActivePageId));
        Assert.Null(DashLayoutEditor.FindPage(layout, "missing-page"));
    }
}
