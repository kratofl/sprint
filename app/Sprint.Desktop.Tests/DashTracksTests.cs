using System.Text.Json;
using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashTracksTests
{
    [Fact]
    public void ADashTakesOnePositiveSizePerColumnAndRow()
    {
        Assert.True(DashLayoutValidator.IsValid(Layout()));

        DashLayout missing = Layout();
        missing.ColSizes!.RemoveAt(0);
        Assert.False(DashLayoutValidator.IsValid(missing));

        DashLayout zero = Layout();
        zero.RowSizes![3] = 0;
        Assert.False(DashLayoutValidator.IsValid(zero));

        DashLayout half = Layout();
        half.RowSizes = null;
        Assert.False(DashLayoutValidator.IsValid(half));
    }

    [Fact]
    public void AnyWidgetMaySitAnywhereOnTheGrid()
    {
        DashLayout layout = Layout();
        layout.Pages[0].Widgets.Add(new DashWidget { Id = "last", Type = "last_lap", Col = 0, Row = 0, ColSpan = 3, RowSpan = 1 });
        layout.Pages[0].Widgets.Add(new DashWidget { Id = "fuel", Type = "bar", Col = 9, Row = 0, ColSpan = 1, RowSpan = 9 });

        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void AZonedDashMovesOntoTheZonesTracksWithTheGearItUsedToDrawAndLosesOnlyWhatItDidNotDraw()
    {
        DashLayout layout = JsonSerializer.Deserialize<DashLayout>("""
            { "id": "z", "name": "Z", "zoned": true, "gridCols": 11, "gridRows": 9,
              "pages": [
                { "id": "both", "name": "Both", "widgets": [
                  { "id": "fuel", "type": "bar", "col": 0, "row": 0, "colSpan": 1, "rowSpan": 9 },
                  { "id": "rpm", "type": "rpm_bar", "col": 1, "row": 0, "colSpan": 9, "rowSpan": 1 } ] },
                { "id": "top", "name": "Top", "bars": "top", "widgets": [
                  { "id": "fuel", "type": "bar", "col": 0, "row": 0, "colSpan": 1, "rowSpan": 9 },
                  { "id": "rpm", "type": "rpm_bar", "col": 1, "row": 0, "colSpan": 9, "rowSpan": 1 },
                  { "id": "gear", "type": "tc", "col": 1, "row": 1, "colSpan": 1, "rowSpan": 1 } ] }
              ] }
            """)!;

        Assert.True(DashTracks.MigrateZoned(layout));

        Assert.Equal([40, 68, 68, 68, 68, 176, 68, 68, 68, 68, 40], layout.ColSizes);
        Assert.Equal(9, layout.RowSizes!.Count);
        Assert.Equal(["fuel", "rpm", "gear"], layout.Pages[0].Widgets.Select(widget => widget.Id));
        // The page that dropped its side bars loses the bar it did not draw; its gear gets a free id.
        Assert.Equal(["rpm", "gear", "gear-2"], layout.Pages[1].Widgets.Select(widget => widget.Id));
        DashWidget gear = layout.Pages[1].Widgets[^1];
        Assert.Equal(("gear", 5, 1, 1, 3), (gear.Type, gear.Col, gear.Row, gear.ColSpan, gear.RowSpan));
        Assert.True(DashLayoutValidator.IsValid(layout));

        string saved = JsonSerializer.Serialize(layout);
        Assert.DoesNotContain("zoned", saved);
        Assert.DoesNotContain("\"bars\"", saved);
        Assert.False(DashTracks.MigrateZoned(JsonSerializer.Deserialize<DashLayout>(saved)!));
    }

    private static DashLayout Layout() => new()
    {
        Id = "d",
        GridCols = DashTracks.Cols,
        GridRows = DashTracks.Rows,
        ColSizes = DashTracks.DefaultCols(),
        RowSizes = DashTracks.DefaultRows(),
        Pages = [new DashPage { Id = "main", Name = "Main", Widgets = [DashTracks.DefaultGear()] }],
    };
}
