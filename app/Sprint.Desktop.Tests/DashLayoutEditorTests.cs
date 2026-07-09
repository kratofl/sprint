using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashLayoutEditorTests
{
    [Fact]
    public void MoveWidgetClampsToGridBounds()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 });

        var moved = DashLayoutEditor.TryMoveWidget(layout, "main", "speed", 18, 11);

        Assert.True(moved);
        var widget = layout.Pages[0].Widgets.Single();
        Assert.Equal(15, widget.Col);
        Assert.Equal(9, widget.Row);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void MoveWidgetRejectsOverlapsAndLeavesWidgetInPlace()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 },
            new DashWidget { Id = "rpm", Type = "rpm_bar", Col = 8, Row = 0, ColSpan = 5, RowSpan = 2 });

        var moved = DashLayoutEditor.TryMoveWidget(layout, "main", "speed", 8, 0);

        Assert.False(moved);
        var widget = layout.Pages[0].Widgets.Single(item => item.Id == "speed");
        Assert.Equal(0, widget.Col);
        Assert.Equal(0, widget.Row);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void ResizeWidgetClampsToGridBoundsAndMinimumSize()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 17, Row = 10, ColSpan = 2, RowSpan = 2 });

        var resized = DashLayoutEditor.TryResizeWidget(layout, "main", "speed", 0, 8);

        Assert.True(resized);
        var widget = layout.Pages[0].Widgets.Single();
        Assert.Equal(1, widget.ColSpan);
        Assert.Equal(2, widget.RowSpan);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void ResizeWidgetRejectsOverlapsAndLeavesWidgetSizeInPlace()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 },
            new DashWidget { Id = "rpm", Type = "rpm_bar", Col = 6, Row = 0, ColSpan = 4, RowSpan = 2 });

        var resized = DashLayoutEditor.TryResizeWidget(layout, "main", "speed", 7, 3);

        Assert.False(resized);
        var widget = layout.Pages[0].Widgets.Single(item => item.Id == "speed");
        Assert.Equal(5, widget.ColSpan);
        Assert.Equal(3, widget.RowSpan);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void DeleteWidgetRemovesOnlyMatchingWidget()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 },
            new DashWidget { Id = "rpm", Type = "rpm_bar", Col = 8, Row = 0, ColSpan = 5, RowSpan = 2 });

        var deleted = DashLayoutEditor.TryDeleteWidget(layout, "main", "speed");

        Assert.True(deleted);
        var widget = Assert.Single(layout.Pages[0].Widgets);
        Assert.Equal("rpm", widget.Id);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void DeleteWidgetReturnsFalseForUnknownWidget()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 });

        var deleted = DashLayoutEditor.TryDeleteWidget(layout, "main", "missing");

        Assert.False(deleted);
        Assert.Single(layout.Pages[0].Widgets);
    }

    [Fact]
    public void ClearPageRemovesAllWidgetsFromPage()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 },
            new DashWidget { Id = "rpm", Type = "rpm_bar", Col = 8, Row = 0, ColSpan = 5, RowSpan = 2 });

        var cleared = DashLayoutEditor.TryClearPage(layout, "main");

        Assert.True(cleared);
        Assert.Empty(layout.Pages[0].Widgets);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void ClearPageReturnsFalseForUnknownPage()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 });

        var cleared = DashLayoutEditor.TryClearPage(layout, "missing");

        Assert.False(cleared);
        Assert.Single(layout.Pages[0].Widgets);
    }

    [Fact]
    public void AddPageAppendsUniqueEmptyPage()
    {
        var layout = LayoutWithWidgets();

        var page = DashLayoutEditor.AddPage(layout, "Main");

        Assert.Equal("main-2", page.Id);
        Assert.Equal("Main 2", page.Name);
        Assert.Empty(page.Widgets);
        Assert.Equal(2, layout.Pages.Count);
        Assert.Same(page, layout.Pages[1]);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void RenamePageUpdatesMatchingPageName()
    {
        var layout = LayoutWithWidgets();

        var renamed = DashLayoutEditor.TryRenamePage(layout, "main", "Race");

        Assert.True(renamed);
        Assert.Equal("Race", layout.Pages[0].Name);
    }

    [Fact]
    public void RenamePageRejectsBlankName()
    {
        var layout = LayoutWithWidgets();

        var renamed = DashLayoutEditor.TryRenamePage(layout, "main", " ");

        Assert.False(renamed);
        Assert.Equal("Main", layout.Pages[0].Name);
    }

    [Fact]
    public void DeletePageRemovesMatchingPageWhenAnotherRegularPageExists()
    {
        var layout = LayoutWithWidgets();
        layout.Pages.Add(new DashPage { Id = "qualifying", Name = "Qualifying" });

        var deleted = DashLayoutEditor.TryDeletePage(layout, "main");

        Assert.True(deleted);
        var page = Assert.Single(layout.Pages);
        Assert.Equal("qualifying", page.Id);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void DeletePageRejectsLastRegularPage()
    {
        var layout = LayoutWithWidgets();

        var deleted = DashLayoutEditor.TryDeletePage(layout, "main");

        Assert.False(deleted);
        Assert.Single(layout.Pages);
    }

    [Fact]
    public void AddWidgetPlacesKnownWidgetInFirstFreeSlot()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "existing", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 4, RowSpan = 2 });

        var added = DashLayoutEditor.TryAddWidget(layout, "main", "gear_speed", out var widget);

        Assert.True(added);
        Assert.NotNull(widget);
        Assert.Equal("gear-speed", widget.Id);
        Assert.Equal("gear_speed", widget.Type);
        Assert.Equal(4, widget.Col);
        Assert.Equal(0, widget.Row);
        Assert.Equal(4, widget.ColSpan);
        Assert.Equal(2, widget.RowSpan);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void AddWidgetReturnsFalseForUnknownType()
    {
        var layout = LayoutWithWidgets();

        var added = DashLayoutEditor.TryAddWidget(layout, "main", "unknown-widget", out var widget);

        Assert.False(added);
        Assert.Null(widget);
        Assert.Empty(layout.Pages[0].Widgets);
    }

    [Fact]
    public void AddWidgetReturnsFalseWhenNoSpaceIsAvailable()
    {
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "full", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 20, RowSpan = 12 });

        var added = DashLayoutEditor.TryAddWidget(layout, "main", "gear_speed", out var widget);

        Assert.False(added);
        Assert.Null(widget);
        Assert.Single(layout.Pages[0].Widgets);
    }

    [Fact]
    public void AddWidgetStackPlacesRegionWithOneDefaultLayer()
    {
        var layout = LayoutWithWidgets();

        Assert.True(DashLayoutEditor.TryAddWidgetStack(layout, "main", out var stack));
        Assert.NotNull(stack);
        Assert.Single(layout.Pages[0].WidgetStacks);
        var layer = Assert.Single(stack!.Layers);
        Assert.Equal(layer.Id, stack.DefaultLayerId);
        Assert.True(stack.ColSpan is > 0 and <= 20 && stack.RowSpan is > 0 and <= 12);
    }

    [Fact]
    public void AddWidgetStackAvoidsExistingContent()
    {
        // Fill the top-left region so the stack must land elsewhere without overlapping.
        var layout = LayoutWithWidgets(
            new DashWidget { Id = "big", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 6, RowSpan = 4 });

        Assert.True(DashLayoutEditor.TryAddWidgetStack(layout, "main", out var stack));
        var overlapsWidget =
            stack!.Col < 6 && stack.Col + stack.ColSpan > 0 &&
            stack.Row < 4 && stack.Row + stack.RowSpan > 0;
        Assert.False(overlapsWidget, "Stack should not be placed over the existing widget.");
    }

    [Fact]
    public void AddWidgetToStackLayerStaysInsideSubGrid()
    {
        var layout = LayoutWithWidgets();
        DashLayoutEditor.TryAddWidgetStack(layout, "main", out var stack);

        Assert.True(DashLayoutEditor.TryAddWidgetToStackLayer(stack!, stack!.DefaultLayerId!, "gear_speed", out var widget));
        Assert.NotNull(widget);
        Assert.True(widget!.Col + widget.ColSpan <= stack.ColSpan);
        Assert.True(widget.Row + widget.RowSpan <= stack.RowSpan);
        Assert.Single(stack.Layers[0].Widgets);
    }

    [Fact]
    public void DeleteStackLayerKeepsOneAndReassignsDefault()
    {
        var layout = LayoutWithWidgets();
        DashLayoutEditor.TryAddWidgetStack(layout, "main", out var stack);
        DashLayoutEditor.TryAddStackLayer(stack!, out var second);
        Assert.True(DashLayoutEditor.TrySetDefaultStackLayer(stack!, second!.Id));

        // Deleting the default layer reassigns the default to a surviving layer.
        Assert.True(DashLayoutEditor.TryDeleteStackLayer(stack!, second.Id));
        Assert.Single(stack!.Layers);
        Assert.Equal(stack.Layers[0].Id, stack.DefaultLayerId);

        // The last remaining layer cannot be deleted.
        Assert.False(DashLayoutEditor.TryDeleteStackLayer(stack, stack.Layers[0].Id));
    }

    private static DashLayout LayoutWithWidgets(params DashWidget[] widgets)
    {
        return new DashLayout
        {
            Id = "layout",
            GridCols = 20,
            GridRows = 12,
            Pages =
            [
                new DashPage
                {
                    Id = "main",
                    Name = "Main",
                    Widgets = widgets.ToList()
                }
            ]
        };
    }
}
