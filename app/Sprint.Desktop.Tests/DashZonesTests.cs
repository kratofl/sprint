using System.Text.Json;
using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashZonesTests
{
    [Fact]
    public void AZonedDashTakesWidgetsOnlyWhereTheirZoneAllows()
    {
        Assert.True(IsValid(Widget("fuel", "bar", 0, 0, 1, 9)));
        Assert.True(IsValid(Widget("pos", "position", 1, 0, 2, 1)));
        Assert.True(IsValid(Widget("last", "last_lap", 5, 4, 1, 2)));
        Assert.True(IsValid(Widget("tc", "tc", 1, 1, 2, 2)));

        // A side bar spot takes only a bar, and only whole.
        Assert.False(IsValid(Widget("last", "last_lap", 0, 0, 1, 9)));
        Assert.False(IsValid(Widget("fuel", "bar", 0, 0, 1, 4)));
        // The top takes bars and small widgets.
        Assert.False(IsValid(Widget("last", "last_lap", 1, 0, 2, 1)));
        // Nothing covers the gear, and nothing straddles two zones.
        Assert.False(IsValid(Widget("last", "last_lap", 5, 2, 1, 2)));
        Assert.False(IsValid(Widget("last", "last_lap", 4, 1, 2, 1)));
    }

    [Fact]
    public void AZonedDashKeepsItsElevenByNineGrid()
    {
        DashLayout layout = Layout(Widget("tc", "tc", 1, 1, 2, 2));
        layout.GridCols = 20;
        layout.GridRows = 12;

        Assert.False(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void APageKeepsItsBarsAndAWidgetInADroppedSpotStaysValid()
    {
        DashLayout layout = Layout(Widget("fuel", "bar", 0, 0, 1, 9));
        layout.Pages[0].Bars = DashPageBars.Top;
        Assert.True(DashLayoutValidator.IsValid(layout));

        DashPage? page = JsonSerializer.Deserialize<DashPage>(JsonSerializer.Serialize(layout.Pages[0]));
        Assert.Equal(DashPageBars.Top, page?.Bars);

        // Both is the default and is not written; an unknown name reads as both.
        Assert.DoesNotContain("bars", JsonSerializer.Serialize(new DashPage { Id = "p", Name = "P" }));
        Assert.Equal(DashPageBars.Both, JsonSerializer.Deserialize<DashPage>("""{"id":"p","name":"P","bars":"left"}""")?.Bars);
    }

    private static DashWidget Widget(string id, string type, int col, int row, int colSpan, int rowSpan) =>
        new() { Id = id, Type = type, Col = col, Row = row, ColSpan = colSpan, RowSpan = rowSpan };

    private static bool IsValid(DashWidget widget) => DashLayoutValidator.IsValid(Layout(widget));

    private static DashLayout Layout(DashWidget widget) => new()
    {
        Id = "zoned",
        Zoned = true,
        GridCols = DashZones.Cols,
        GridRows = DashZones.Rows,
        Pages = [new DashPage { Id = "main", Name = "Main", Widgets = [widget] }],
    };
}
