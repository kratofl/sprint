namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// A zoned dash's zones and what may go where (<c>packages/dashboard/src/zones.ts</c>, which the
/// designer works with, holds the same). The grid is 11 x 9 cells: bar spots down both sides and
/// across the top, a 4 x 8 grid either side, and the centre column, whose top three rows are the
/// gear's. The renderer always draws the gear there, so no widget may cover it.
/// </summary>
public static class DashZones
{
    public const int Cols = 11;
    public const int Rows = 9;

    private static readonly DashZone BarLeft = new(0, 0, 1, 9, DashZoneKind.SideBar);
    private static readonly DashZone BarRight = new(10, 0, 1, 9, DashZoneKind.SideBar);
    private static readonly DashZone Top = new(1, 0, 9, 1, DashZoneKind.TopBar);
    private static readonly DashZone Left = new(1, 1, 4, 8, DashZoneKind.Grid);
    private static readonly DashZone Centre = new(5, 4, 1, 5, DashZoneKind.Grid);
    private static readonly DashZone Right = new(6, 1, 4, 8, DashZoneKind.Grid);

    private static readonly IReadOnlyList<DashZone> All = [BarLeft, BarRight, Top, Left, Centre, Right];

    /// <summary>Widgets with a bar look: the only ones a side bar spot takes.</summary>
    private static readonly HashSet<string> BarTypes = new(StringComparer.OrdinalIgnoreCase) { "bar", "rpm_bar" };

    /// <summary>Widgets small enough for the top bar spot, besides the bars.</summary>
    private static readonly HashSet<string> TopTypes = new(StringComparer.OrdinalIgnoreCase) { "position", "laps", "time_left", "flag" };

    /// <summary>
    /// Whether a widget of <paramref name="type"/> may sit at its cells: wholly in one zone that
    /// takes it (none covers the gear), a side bar spot filled whole.
    /// </summary>
    public static bool Fits(string type, int col, int row, int colSpan, int rowSpan)
    {
        if (colSpan <= 0 || rowSpan <= 0)
        {
            return false;
        }

        DashZone? zone = All.FirstOrDefault(candidate => candidate.Contains(col, row, colSpan, rowSpan));
        return zone?.Kind switch
        {
            DashZoneKind.SideBar => BarTypes.Contains(type) && zone.Equals(new DashZone(col, row, colSpan, rowSpan, DashZoneKind.SideBar)),
            DashZoneKind.TopBar => BarTypes.Contains(type) || TopTypes.Contains(type),
            DashZoneKind.Grid => true,
            _ => false,
        };
    }

    private enum DashZoneKind
    {
        SideBar,
        TopBar,
        Grid,
    }

    private sealed record DashZone(int Col, int Row, int ColSpan, int RowSpan, DashZoneKind Kind)
    {
        public bool Contains(int col, int row, int colSpan, int rowSpan) =>
            col >= this.Col && row >= this.Row && col + colSpan <= this.Col + this.ColSpan && row + rowSpan <= this.Row + this.RowSpan;
    }
}
