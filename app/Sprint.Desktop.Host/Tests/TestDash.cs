using Sprint.Desktop.Features.Dashes;

namespace Sprint.Desktop.Host.Tests;

/// <summary>A small dash the real renderer draws: two pages that draw differently, and an idle page.</summary>
internal static class TestDash
{
    public static DashLayout Layout(string id) => new()
    {
        Id = id,
        Name = id,
        GridCols = 20,
        GridRows = 12,
        IdlePage = Page("idle", "position"),
        Pages = [Page("main", "gear_speed"), Page("second", "rpm_bar")],
    };

    private static DashPage Page(string id, string widgetType) => new()
    {
        Id = id,
        Name = id,
        Widgets =
        [
            new DashWidget { Id = $"{id}-widget", Type = widgetType, Col = 0, Row = 0, ColSpan = 20, RowSpan = 12 },
        ],
    };
}
