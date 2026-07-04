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
