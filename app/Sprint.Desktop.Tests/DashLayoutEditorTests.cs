using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashLayoutEditorTests
{
    [Fact]
    public void MoveWidgetClampsToGridBounds()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 });

        bool moved = DashLayoutEditor.TryMoveWidget(layout, "main", "speed", 18, 11);

        Assert.True(moved);
        DashWidget widget = layout.Pages[0].Widgets.Single();
        Assert.Equal(15, widget.Col);
        Assert.Equal(9, widget.Row);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void MoveWidgetRejectsOverlapsAndLeavesWidgetInPlace()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 },
            new DashWidget { Id = "rpm", Type = "rpm_bar", Col = 8, Row = 0, ColSpan = 5, RowSpan = 2 });

        bool moved = DashLayoutEditor.TryMoveWidget(layout, "main", "speed", 8, 0);

        Assert.False(moved);
        DashWidget widget = layout.Pages[0].Widgets.Single(item => item.Id == "speed");
        Assert.Equal(0, widget.Col);
        Assert.Equal(0, widget.Row);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void ResizeWidgetClampsToGridBoundsAndMinimumSize()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 17, Row = 10, ColSpan = 2, RowSpan = 2 });

        bool resized = DashLayoutEditor.TryResizeWidget(layout, "main", "speed", 0, 8);

        Assert.True(resized);
        DashWidget widget = layout.Pages[0].Widgets.Single();
        Assert.Equal(1, widget.ColSpan);
        Assert.Equal(2, widget.RowSpan);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void ResizeWidgetRejectsOverlapsAndLeavesWidgetSizeInPlace()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 },
            new DashWidget { Id = "rpm", Type = "rpm_bar", Col = 6, Row = 0, ColSpan = 4, RowSpan = 2 });

        bool resized = DashLayoutEditor.TryResizeWidget(layout, "main", "speed", 7, 3);

        Assert.False(resized);
        DashWidget widget = layout.Pages[0].Widgets.Single(item => item.Id == "speed");
        Assert.Equal(5, widget.ColSpan);
        Assert.Equal(3, widget.RowSpan);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void DeleteWidgetRemovesOnlyMatchingWidget()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 },
            new DashWidget { Id = "rpm", Type = "rpm_bar", Col = 8, Row = 0, ColSpan = 5, RowSpan = 2 });

        bool deleted = DashLayoutEditor.TryDeleteWidget(layout, "main", "speed");

        Assert.True(deleted);
        DashWidget widget = Assert.Single(layout.Pages[0].Widgets);
        Assert.Equal("rpm", widget.Id);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void DeleteWidgetReturnsFalseForUnknownWidget()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 });

        bool deleted = DashLayoutEditor.TryDeleteWidget(layout, "main", "missing");

        Assert.False(deleted);
        Assert.Single(layout.Pages[0].Widgets);
    }

    [Fact]
    public void ClearPageRemovesAllWidgetsFromPage()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 },
            new DashWidget { Id = "rpm", Type = "rpm_bar", Col = 8, Row = 0, ColSpan = 5, RowSpan = 2 });

        bool cleared = DashLayoutEditor.TryClearPage(layout, "main");

        Assert.True(cleared);
        Assert.Empty(layout.Pages[0].Widgets);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void ClearPageReturnsFalseForUnknownPage()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "speed", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 5, RowSpan = 3 });

        bool cleared = DashLayoutEditor.TryClearPage(layout, "missing");

        Assert.False(cleared);
        Assert.Single(layout.Pages[0].Widgets);
    }

    [Fact]
    public void AddPageAppendsUniqueEmptyPage()
    {
        DashLayout layout = LayoutWithWidgets();

        DashPage page = DashLayoutEditor.AddPage(layout, "Main");

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
        DashLayout layout = LayoutWithWidgets();

        bool renamed = DashLayoutEditor.TryRenamePage(layout, "main", "Race");

        Assert.True(renamed);
        Assert.Equal("Race", layout.Pages[0].Name);
    }

    [Fact]
    public void RenamePageRejectsBlankName()
    {
        DashLayout layout = LayoutWithWidgets();

        bool renamed = DashLayoutEditor.TryRenamePage(layout, "main", " ");

        Assert.False(renamed);
        Assert.Equal("Main", layout.Pages[0].Name);
    }

    [Fact]
    public void DeletePageRemovesMatchingPageWhenAnotherRegularPageExists()
    {
        DashLayout layout = LayoutWithWidgets();
        layout.Pages.Add(new DashPage { Id = "qualifying", Name = "Qualifying" });

        bool deleted = DashLayoutEditor.TryDeletePage(layout, "main");

        Assert.True(deleted);
        DashPage page = Assert.Single(layout.Pages);
        Assert.Equal("qualifying", page.Id);
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void DeletePageRejectsLastRegularPage()
    {
        DashLayout layout = LayoutWithWidgets();

        bool deleted = DashLayoutEditor.TryDeletePage(layout, "main");

        Assert.False(deleted);
        Assert.Single(layout.Pages);
    }

    [Fact]
    public void AddWidgetPlacesKnownWidgetInFirstFreeSlot()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "existing", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 4, RowSpan = 2 });

        bool added = DashLayoutEditor.TryAddWidget(layout, "main", "gear_speed", out DashWidget? widget);

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
        DashLayout layout = LayoutWithWidgets();

        bool added = DashLayoutEditor.TryAddWidget(layout, "main", "unknown-widget", out DashWidget? widget);

        Assert.False(added);
        Assert.Null(widget);
        Assert.Empty(layout.Pages[0].Widgets);
    }

    [Fact]
    public void AddWidgetReturnsFalseWhenNoSpaceIsAvailable()
    {
        DashLayout layout = LayoutWithWidgets(
            new DashWidget { Id = "full", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 20, RowSpan = 12 });

        bool added = DashLayoutEditor.TryAddWidget(layout, "main", "gear_speed", out DashWidget? widget);

        Assert.False(added);
        Assert.Null(widget);
        Assert.Single(layout.Pages[0].Widgets);
    }

    [Fact]
    public void CountRefitLossesMatchesWhatApplyScreenProfileDropsWithoutTouchingTheLayout()
    {
        ScreenProfile portrait = ScreenProfileCatalog.Find("portrait-480x800") ?? throw new InvalidOperationException("No portrait profile.");
        DashLayout counted = CrowdedLandscapeLayout();
        DashLayout applied = CrowdedLandscapeLayout();
        int before = WidgetCount(applied);

        int lost = DashLayoutEditor.CountRefitLosses(counted, portrait);
        DashLayoutEditor.ApplyScreenProfile(applied, portrait);

        Assert.True(lost > 0);
        Assert.Equal(before - WidgetCount(applied), lost);
        Assert.Equal(before, WidgetCount(counted));
        Assert.Equal((20, 12, 19), (counted.GridCols, counted.GridRows, counted.Pages[0].Widgets[19].Col));
        Assert.Equal(0, DashLayoutEditor.CountRefitLosses(counted, ScreenProfileCatalog.Default));
    }

    [Fact]
    public void RefitLossesListOnlyLosingSizesAndFollowALayoutChange()
    {
        DashRefitLosses losses = new();
        DashLayout layout = CrowdedLandscapeLayout();

        IReadOnlyDictionary<string, int> crowded = losses.For([layout])["layout"];
        layout.IdlePage = null;
        layout.Pages[0].Widgets.RemoveRange(1, layout.Pages[0].Widgets.Count - 1);

        Assert.DoesNotContain(ScreenProfileCatalog.DefaultId, crowded.Keys);
        Assert.Contains("portrait-480x800", crowded.Keys);
        Assert.Empty(losses.For([layout]));
    }

    [Fact]
    public void RefitToABiggerGridKeepsEveryWidgetAndKeepsNeighboursTouching()
    {
        ScreenProfile bigger = ScreenProfileCatalog.Find("landscape-1024x600") ?? throw new InvalidOperationException("No 1024 × 600 profile.");
        // Rows of 1-, 2- and 3-cell widgets packed edge to edge: the old origin + span rounding
        // pushed neighbours into each other on the 24 × 14 grid and dropped some of them.
        DashLayout layout = LayoutWithWidgets(
            Enumerable.Range(0, 20).Select(col => new DashWidget { Id = $"a{col}", Type = "gear_speed", Col = col, Row = 0, ColSpan = 1, RowSpan = 1 })
                .Concat(Enumerable.Range(0, 10).Select(index => new DashWidget { Id = $"b{index}", Type = "gear_speed", Col = index * 2, Row = 1, ColSpan = 2, RowSpan = 3 }))
                .Concat(Enumerable.Range(0, 6).Select(index => new DashWidget { Id = $"c{index}", Type = "gear_speed", Col = index * 3, Row = 4, ColSpan = 3, RowSpan = 8 }))
                .ToArray());
        layout.ScreenProfileId = ScreenProfileCatalog.DefaultId;
        int before = WidgetCount(layout);

        Assert.Equal(0, DashLayoutEditor.CountRefitLosses(layout, bigger));
        DashLayoutEditor.ApplyScreenProfile(layout, bigger);

        Assert.Equal(before, WidgetCount(layout));
        Assert.True(DashLayoutValidator.IsValid(layout));
        List<DashWidget> second = layout.Pages[0].Widgets.Where(widget => widget.Id.StartsWith('b')).ToList();
        for (int index = 1; index < second.Count; index++)
        {
            Assert.Equal(second[index - 1].Col + second[index - 1].ColSpan, second[index].Col);
        }

        Assert.Equal(24, second[^1].Col + second[^1].ColSpan);
    }

    // A landscape 800 × 480 dash with a row of twenty 1×1 widgets on its page and its idle page:
    // twelve columns cannot hold them all.
    private static DashLayout CrowdedLandscapeLayout()
    {
        DashLayout layout = LayoutWithWidgets(Enumerable.Range(0, 20).Select(col => new DashWidget { Id = $"w{col}", Type = "speed", Col = col, Row = 0, ColSpan = 1, RowSpan = 1 }).ToArray());
        layout.ScreenProfileId = ScreenProfileCatalog.DefaultId;
        layout.IdlePage = new DashPage { Id = "idle", Name = "Idle", Widgets = Enumerable.Range(0, 20).Select(col => new DashWidget { Id = $"i{col}", Type = "speed", Col = col, Row = 0, ColSpan = 1, RowSpan = 1 }).ToList() };
        return layout;
    }

    private static int WidgetCount(DashLayout layout) => layout.Pages.Sum(page => page.Widgets.Count) + (layout.IdlePage?.Widgets.Count ?? 0);

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
