namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// A dash's own grid: <see cref="DashLayout.ColSizes"/> and <see cref="DashLayout.RowSizes"/> are
/// its column widths and row heights as shares (only their ratios count), so one dash fits every
/// screen and a screen profile never refits it. The renderer places widgets on them
/// (<c>track_rect</c> in <c>renderer/src/grid.rs</c>); the designer resizes them.
/// </summary>
public static class DashTracks
{
    public const int Cols = 10;
    public const int Rows = 9;

    /// <summary>The most tracks a side may have; far more than a wheel screen holds.</summary>
    public const int MaxTracks = 48;

    /// <summary>A new dash's columns at 800 px: narrow first and last (bars live there), eight even between.</summary>
    public static List<double> DefaultCols() => [40, 90, 90, 90, 90, 90, 90, 90, 90, 40];

    /// <summary>A new dash's rows at 480 px: a short top row (the RPM bar), eight even below.</summary>
    public static List<double> DefaultRows() => [36, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5];

    /// <summary>A new dash's gear: the middle two columns' top three rows.</summary>
    public static DashWidget DefaultGear() => new() { Id = "gear", Type = "gear", Col = 4, Row = 1, ColSpan = 2, RowSpan = 3 };

    /// <summary>Whether a layout's track sizes, when it has them, fit its grid: one positive size per column and row.</summary>
    public static bool AreValid(DashLayout layout)
    {
        ArgumentNullException.ThrowIfNull(layout);
        if (layout.ColSizes is null && layout.RowSizes is null)
        {
            return true;
        }

        return layout.ColSizes is { } cols && layout.RowSizes is { } rows &&
            cols.Count == layout.GridCols && rows.Count == layout.GridRows &&
            cols.Count <= MaxTracks && rows.Count <= MaxTracks &&
            cols.All(IsSize) && rows.All(IsSize);
    }

    private static bool IsSize(double size) => double.IsFinite(size) && size > 0;

    // The zoned grid dashes were saved on before they had track sizes: bar spots down both sides
    // and across the top, a 4 x 8 grid either side and a wide centre column whose top three rows
    // the renderer always drew the gear in.
    private static readonly double[] ZoneCols = [40, 68, 68, 68, 68, 176, 68, 68, 68, 68, 40];
    private static readonly double[] ZoneRows = [36, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5];

    /// <summary>
    /// Whether a widget on an old zoned dash sits in a bar spot: the first or last column, or the
    /// top row between them.
    /// </summary>
    public static bool InZonedBarSpot(DashWidget widget)
    {
        ArgumentNullException.ThrowIfNull(widget);
        return widget.Col == 0 || widget.Col == ZoneCols.Length - 1 || widget.Row == 0;
    }

    /// <summary>
    /// Moves a dash saved on the zoned grid onto track sizes of its own without moving a pixel: the
    /// zones' 11 x 9 tracks become its sizes, every page gets the gear the renderer used to draw by
    /// itself, and a widget in a bar spot its page dropped (it was not drawn) goes. Drops every
    /// page's bar setting. Reports whether anything changed so the caller re-persists the dash.
    /// </summary>
    public static bool MigrateZoned(DashLayout layout)
    {
        ArgumentNullException.ThrowIfNull(layout);
        IEnumerable<DashPage> pages = layout.IdlePage is null ? layout.Pages : layout.Pages.Prepend(layout.IdlePage);
        bool changed = false;
        foreach (DashPage page in pages)
        {
            if (layout.LegacyZoned == true)
            {
                page.Widgets.RemoveAll(widget => InDroppedSpot(widget, page.LegacyBars));
                page.Widgets.Add(new DashWidget { Id = FreeId(page, "gear"), Type = "gear", Col = 5, Row = 1, ColSpan = 1, RowSpan = 3 });
                changed = true;
            }

            changed |= page.LegacyBars is not null;
            page.LegacyBars = null;
        }

        if (layout.LegacyZoned == true)
        {
            layout.GridCols = ZoneCols.Length;
            layout.GridRows = ZoneRows.Length;
            layout.ColSizes = [.. ZoneCols];
            layout.RowSizes = [.. ZoneRows];
        }

        changed |= layout.LegacyZoned is not null;
        layout.LegacyZoned = null;
        return changed;
    }

    /// <summary>Whether a widget sat in a bar spot a page that kept <paramref name="bars"/> folded away.</summary>
    private static bool InDroppedSpot(DashWidget widget, string? bars)
    {
        string kept = bars?.ToLowerInvariant() ?? "both";
        bool side = widget.Col == 0 || widget.Col == ZoneCols.Length - 1;
        bool top = !side && widget.Row == 0;
        return (side && kept is "top" or "none") || (top && kept is "sides" or "none");
    }

    private static string FreeId(DashPage page, string id)
    {
        string candidate = id;
        for (int n = 2; page.Widgets.Any(widget => string.Equals(widget.Id, candidate, StringComparison.OrdinalIgnoreCase)); n++)
        {
            candidate = $"{id}-{n}";
        }

        return candidate;
    }
}
