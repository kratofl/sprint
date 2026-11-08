namespace Sprint.Desktop.Features.Dashes;

public static class DashLayoutEditor
{
    public const int DefaultWidgetColSpan = 4;
    public const int DefaultWidgetRowSpan = 2;

    public static DashPage AddPage(DashLayout layout, string name)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var baseName = string.IsNullOrWhiteSpace(name) ? "Page" : name.Trim();
        var page = new DashPage
        {
            Id = NextPageId(layout, Slug(baseName)),
            Name = NextPageName(layout, baseName)
        };

        layout.Pages.Add(page);
        return page;
    }

    public static bool TryRenamePage(DashLayout layout, string pageId, string name)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = FindPage(layout, pageId);
        if (page is null || string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        page.Name = name.Trim();
        return true;
    }

    public static bool TryDeletePage(DashLayout layout, string pageId)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = layout.Pages.FirstOrDefault(item => string.Equals(item.Id, pageId, StringComparison.OrdinalIgnoreCase));
        if (page is null || layout.Pages.Count <= 1)
        {
            return false;
        }

        layout.Pages.Remove(page);
        return true;
    }

    /// <summary>
    /// Retargets a layout to a new fixed grid (PRD #122 change-size / duplicate-to-size).
    /// Each widget's edges are scaled proportionally from the old grid to the new one, so
    /// widgets that touched still touch and a grid that grows in both directions keeps every
    /// widget; the rest are clamped into bounds and greedily kept in order — a widget that would fall out
    /// of bounds or overlap a kept one is shrunk to 1×1 and, failing that, dropped. This
    /// guarantees the result is a valid layout for the new aspect (layers of a stack still
    /// overlap only each other).
    /// </summary>
    public static void RefitLayoutToGrid(DashLayout layout, int newCols, int newRows)
    {
        ArgumentNullException.ThrowIfNull(layout);
        if (newCols <= 0 || newRows <= 0)
        {
            return;
        }

        int oldCols = Math.Max(1, layout.GridCols);
        int oldRows = Math.Max(1, layout.GridRows);
        layout.GridCols = newCols;
        layout.GridRows = newRows;

        if (layout.IdlePage is { } idle)
        {
            RefitPage(idle, oldCols, oldRows, newCols, newRows);
        }

        foreach (DashPage page in layout.Pages)
        {
            RefitPage(page, oldCols, oldRows, newCols, newRows);
        }
    }

    /// <summary>
    /// How many widgets <see cref="ApplyScreenProfile"/> would leave out of the layout, over
    /// every page including the idle page, without touching it. Zero when the layout already
    /// targets the profile (retargeting it is a no-op). Runs the same refit plan, so it never
    /// disagrees with what a change of size or a duplicate to that size actually drops.
    /// </summary>
    public static int CountRefitLosses(DashLayout layout, ScreenProfile profile)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(profile);
        if (TargetsProfile(layout, profile) || profile.GridCols <= 0 || profile.GridRows <= 0)
        {
            return 0;
        }

        int oldCols = Math.Max(1, layout.GridCols);
        int oldRows = Math.Max(1, layout.GridRows);
        int lost = 0;
        foreach (DashPage page in layout.IdlePage is { } idle ? layout.Pages.Prepend(idle) : layout.Pages)
        {
            lost += page.Widgets.Count - PlanRefit(page, oldCols, oldRows, profile.GridCols, profile.GridRows).Count;
        }

        return lost;
    }

    /// <summary>
    /// Retargets a layout to a screen profile: tags it with the profile id and refits
    /// its grid to the profile's fixed grid. The single shared primitive behind the
    /// runtime's change-size / duplicate-to-size and the editor's target-size selector.
    /// </summary>
    public static void ApplyScreenProfile(DashLayout layout, ScreenProfile profile)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(profile);
        layout.ScreenProfileId = profile.Id;
        RefitLayoutToGrid(layout, profile.GridCols, profile.GridRows);
    }

    /// <summary>Whether a layout already targets the given profile (same id and grid) — a retarget no-op.</summary>
    public static bool TargetsProfile(DashLayout layout, ScreenProfile profile)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(profile);
        return string.Equals(layout.ScreenProfileId, profile.Id, StringComparison.OrdinalIgnoreCase) &&
            layout.GridCols == profile.GridCols && layout.GridRows == profile.GridRows;
    }

    private static void RefitPage(DashPage page, int oldCols, int oldRows, int newCols, int newRows)
    {
        List<RefitPlacement> plan = PlanRefit(page, oldCols, oldRows, newCols, newRows);
        foreach (RefitPlacement placement in plan)
        {
            placement.Widget.Col = placement.Col;
            placement.Widget.Row = placement.Row;
            placement.Widget.ColSpan = placement.ColSpan;
            placement.Widget.RowSpan = placement.RowSpan;
        }

        page.Widgets = plan.Select(placement => placement.Widget).ToList();
    }

    /// <summary>Where a kept widget lands in a refit.</summary>
    private readonly record struct RefitPlacement(DashWidget Widget, int Col, int Row, int ColSpan, int RowSpan, Dictionary<string, string> Layers);

    /// <summary>
    /// The refit of one page, in page order, without touching it: each widget scaled and clamped
    /// into the new grid, shrunk to 1×1 if it would overlap a kept one, and left out (absent from
    /// the result) if even that overlaps. Layers of one stack may share cells, as the validator allows.
    /// </summary>
    private static List<RefitPlacement> PlanRefit(DashPage page, int oldCols, int oldRows, int newCols, int newRows)
    {
        List<RefitPlacement> kept = new(page.Widgets.Count);

        foreach (DashWidget widget in page.Widgets)
        {
            (int col, int colSpan) = ScaleCells(widget.Col, widget.ColSpan, oldCols, newCols);
            (int row, int rowSpan) = ScaleCells(widget.Row, widget.RowSpan, oldRows, newRows);
            Dictionary<string, string> layers = DashWidgetGroups.StackLayers(page, widget);

            bool Blocked(int width, int height)
            {
                foreach (RefitPlacement other in kept)
                {
                    if (Intersects(col, row, width, height, other.Col, other.Row, other.ColSpan, other.RowSpan) &&
                        !DashWidgetGroups.MayOverlap(layers, other.Layers))
                    {
                        return true;
                    }
                }

                return false;
            }

            if (Blocked(colSpan, rowSpan))
            {
                if (Blocked(1, 1))
                {
                    continue;
                }

                colSpan = 1;
                rowSpan = 1;
            }

            kept.Add(new RefitPlacement(widget, col, row, colSpan, rowSpan, layers));
        }

        return kept;
    }

    /// <summary>
    /// Scales one axis of a widget by its two edges rather than its origin and span apart: the
    /// edge scaling is monotonic, so two widgets that did not overlap still don't, and on a
    /// larger axis every span stays at least one cell. Scaling origin and span separately
    /// rounded neighbours into each other and dropped widgets even on bigger screens.
    /// </summary>
    private static (int Start, int Span) ScaleCells(int start, int span, int oldMax, int newMax)
    {
        int scaledStart = Math.Clamp(ScaleEdge(start, oldMax, newMax), 0, newMax - 1);
        int scaledEnd = Math.Clamp(ScaleEdge(start + span, oldMax, newMax), scaledStart + 1, newMax);
        return (scaledStart, scaledEnd - scaledStart);
    }

    private static int ScaleEdge(int edge, int oldMax, int newMax) =>
        (int)Math.Round((double)edge * newMax / oldMax, MidpointRounding.AwayFromZero);

    public static bool TryAddWidget(DashLayout layout, string pageId, string type, out DashWidget? widget)
    {
        ArgumentNullException.ThrowIfNull(layout);
        widget = null;

        var page = FindPage(layout, pageId);
        if (page is null || !DashWidgetCatalog.IsKnown(type) || !DashLayoutValidator.IsValid(layout))
        {
            return false;
        }

        var colSpan = Math.Min(DefaultWidgetColSpan, layout.GridCols);
        var rowSpan = Math.Min(DefaultWidgetRowSpan, layout.GridRows);
        for (var row = 0; row <= layout.GridRows - rowSpan; row++)
        {
            for (var col = 0; col <= layout.GridCols - colSpan; col++)
            {
                if (WouldOverlap(page, movingWidget: null, col, row, colSpan, rowSpan))
                {
                    continue;
                }

                widget = new DashWidget
                {
                    Id = NextWidgetId(page, Slug(type.Replace('_', '-'))),
                    Type = type,
                    Col = col,
                    Row = row,
                    ColSpan = colSpan,
                    RowSpan = rowSpan
                };
                page.Widgets.Add(widget);
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Add a widget at an explicit grid cell (drag-drop placement). The requested
    /// cell is clamped in-bounds; placement is rejected (no fallback) if it would
    /// overlap, so a drop onto an occupied cell fails rather than silently jumping.
    /// </summary>
    public static bool TryAddWidgetAt(DashLayout layout, string pageId, string type, int col, int row, out DashWidget? widget)
    {
        ArgumentNullException.ThrowIfNull(layout);
        widget = null;

        var page = FindPage(layout, pageId);
        if (page is null || !DashWidgetCatalog.IsKnown(type) || !DashLayoutValidator.IsValid(layout))
        {
            return false;
        }

        var colSpan = Math.Min(DefaultWidgetColSpan, layout.GridCols);
        var rowSpan = Math.Min(DefaultWidgetRowSpan, layout.GridRows);
        var c = Math.Clamp(col, 0, Math.Max(0, layout.GridCols - colSpan));
        var r = Math.Clamp(row, 0, Math.Max(0, layout.GridRows - rowSpan));
        if (WouldOverlap(page, movingWidget: null, c, r, colSpan, rowSpan))
        {
            return false;
        }

        widget = new DashWidget
        {
            Id = NextWidgetId(page, Slug(type.Replace('_', '-'))),
            Type = type,
            Col = c,
            Row = r,
            ColSpan = colSpan,
            RowSpan = rowSpan
        };
        page.Widgets.Add(widget);
        return true;
    }

    /// <summary>Non-mutating placement check for a not-yet-created widget (palette drag ghost).</summary>
    public static bool CanPlaceNewWidget(DashLayout layout, string pageId, int col, int row, int colSpan, int rowSpan)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = FindPage(layout, pageId);
        if (page is null || col < 0 || row < 0 || colSpan < 1 || rowSpan < 1)
        {
            return false;
        }

        if (col + colSpan > layout.GridCols || row + rowSpan > layout.GridRows)
        {
            return false;
        }

        return !WouldOverlap(page, movingWidget: null, col, row, colSpan, rowSpan);
    }

    /// <summary>
    /// Set a widget's full geometry in one operation. Needed for edge/corner resize
    /// from the top or left, which move the origin and change the span together.
    /// </summary>
    public static bool TrySetWidgetGeometry(DashLayout layout, string pageId, string widgetId, int col, int row, int colSpan, int rowSpan)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = FindPage(layout, pageId);
        var widget = page?.Widgets.FirstOrDefault(item => string.Equals(item.Id, widgetId, StringComparison.OrdinalIgnoreCase));
        if (page is null || widget is null || !DashLayoutValidator.IsValid(layout))
        {
            return false;
        }

        if (col < 0 || row < 0 || colSpan < 1 || rowSpan < 1 ||
            col + colSpan > layout.GridCols || row + rowSpan > layout.GridRows)
        {
            return false;
        }

        if (WouldOverlap(page, widget, col, row, colSpan, rowSpan))
        {
            return false;
        }

        widget.Col = col;
        widget.Row = row;
        widget.ColSpan = colSpan;
        widget.RowSpan = rowSpan;
        return true;
    }

    public static bool TryMoveWidget(DashLayout layout, string pageId, string widgetId, int col, int row)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = FindPage(layout, pageId);
        var widget = page?.Widgets.FirstOrDefault(item => string.Equals(item.Id, widgetId, StringComparison.OrdinalIgnoreCase));
        if (page is null || widget is null || !DashLayoutValidator.IsValid(layout))
        {
            return false;
        }

        var nextCol = Math.Clamp(col, 0, Math.Max(0, layout.GridCols - widget.ColSpan));
        var nextRow = Math.Clamp(row, 0, Math.Max(0, layout.GridRows - widget.RowSpan));
        if (WouldOverlap(page, widget, nextCol, nextRow))
        {
            return false;
        }

        widget.Col = nextCol;
        widget.Row = nextRow;
        return true;
    }

    /// <summary>
    /// Non-mutating placement check used by the editor to preview a live drag/resize
    /// ghost. Returns true when the widget could occupy the given cell rectangle:
    /// in-bounds, positive span, and no overlap with the page's other widgets.
    /// </summary>
    public static bool CanPlaceWidget(DashLayout layout, string pageId, string widgetId, int col, int row, int colSpan, int rowSpan)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = FindPage(layout, pageId);
        var widget = page?.Widgets.FirstOrDefault(item => string.Equals(item.Id, widgetId, StringComparison.OrdinalIgnoreCase));
        if (page is null || widget is null)
        {
            return false;
        }

        if (col < 0 || row < 0 || colSpan < 1 || rowSpan < 1)
        {
            return false;
        }

        if (col + colSpan > layout.GridCols || row + rowSpan > layout.GridRows)
        {
            return false;
        }

        return !WouldOverlap(page, widget, col, row, colSpan, rowSpan);
    }

    public static bool TryResizeWidget(DashLayout layout, string pageId, string widgetId, int colSpan, int rowSpan)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = FindPage(layout, pageId);
        var widget = page?.Widgets.FirstOrDefault(item => string.Equals(item.Id, widgetId, StringComparison.OrdinalIgnoreCase));
        if (page is null || widget is null || !DashLayoutValidator.IsValid(layout))
        {
            return false;
        }

        var nextColSpan = Math.Clamp(colSpan, 1, Math.Max(1, layout.GridCols - widget.Col));
        var nextRowSpan = Math.Clamp(rowSpan, 1, Math.Max(1, layout.GridRows - widget.Row));
        if (WouldOverlap(page, widget, widget.Col, widget.Row, nextColSpan, nextRowSpan))
        {
            return false;
        }

        widget.ColSpan = nextColSpan;
        widget.RowSpan = nextRowSpan;
        return true;
    }

    public static bool TryDeleteWidget(DashLayout layout, string pageId, string widgetId)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = FindPage(layout, pageId);
        var widget = page?.Widgets.FirstOrDefault(item => string.Equals(item.Id, widgetId, StringComparison.OrdinalIgnoreCase));
        if (page is null || widget is null || !DashLayoutValidator.IsValid(layout))
        {
            return false;
        }

        page.Widgets.Remove(widget);
        return true;
    }

    public static bool TryClearPage(DashLayout layout, string pageId)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var page = FindPage(layout, pageId);
        if (page is null || !DashLayoutValidator.IsValid(layout))
        {
            return false;
        }

        page.Widgets.Clear();
        page.Groups.Clear();
        return true;
    }

    public static DashPage? FindPage(DashLayout layout, string pageId)
    {
        ArgumentNullException.ThrowIfNull(layout);

        if (string.Equals(layout.IdlePage?.Id, pageId, StringComparison.OrdinalIgnoreCase))
        {
            return layout.IdlePage;
        }

        return layout.Pages.FirstOrDefault(page => string.Equals(page.Id, pageId, StringComparison.OrdinalIgnoreCase));
    }

    private static string NextPageId(DashLayout layout, string baseId)
    {
        if (!PageIdExists(layout, baseId))
        {
            return baseId;
        }

        for (var index = 2; ; index++)
        {
            var candidate = $"{baseId}-{index}";
            if (!PageIdExists(layout, candidate))
            {
                return candidate;
            }
        }
    }

    private static bool PageIdExists(DashLayout layout, string pageId)
    {
        return string.Equals(layout.IdlePage?.Id, pageId, StringComparison.OrdinalIgnoreCase) ||
            layout.Pages.Any(page => string.Equals(page.Id, pageId, StringComparison.OrdinalIgnoreCase));
    }

    private static string NextPageName(DashLayout layout, string baseName)
    {
        if (!PageNameExists(layout, baseName))
        {
            return baseName;
        }

        for (var index = 2; ; index++)
        {
            var candidate = $"{baseName} {index}";
            if (!PageNameExists(layout, candidate))
            {
                return candidate;
            }
        }
    }

    private static bool PageNameExists(DashLayout layout, string name)
    {
        return string.Equals(layout.IdlePage?.Name, name, StringComparison.OrdinalIgnoreCase) ||
            layout.Pages.Any(page => string.Equals(page.Name, name, StringComparison.OrdinalIgnoreCase));
    }

    private static string Slug(string value)
    {
        var words = value
            .Trim()
            .ToLowerInvariant()
            .Select(character => char.IsLetterOrDigit(character) ? character : '-')
            .ToArray();
        var slug = string.Join("-", new string(words).Split('-', StringSplitOptions.RemoveEmptyEntries));
        return string.IsNullOrWhiteSpace(slug) ? "page" : slug;
    }

    private static bool WouldOverlap(DashPage page, DashWidget movingWidget, int col, int row)
    {
        return WouldOverlap(page, movingWidget, col, row, movingWidget.ColSpan, movingWidget.RowSpan);
    }

    private static bool WouldOverlap(
        DashPage page,
        DashWidget? movingWidget,
        int col,
        int row,
        int colSpan,
        int rowSpan)
    {
        // A new widget sits on the page, where it may share no cell; a moving one keeps its layers.
        Dictionary<string, string> layers = movingWidget is null ? new Dictionary<string, string>() : DashWidgetGroups.StackLayers(page, movingWidget);
        foreach (DashWidget widget in page.Widgets)
        {
            if (movingWidget is not null && ReferenceEquals(widget, movingWidget))
            {
                continue;
            }

            if (Intersects(col, row, colSpan, rowSpan, widget.Col, widget.Row, widget.ColSpan, widget.RowSpan) &&
                !DashWidgetGroups.MayOverlap(layers, DashWidgetGroups.StackLayers(page, widget)))
            {
                return true;
            }
        }

        return false;
    }

    private static string NextWidgetId(DashPage page, string baseId)
    {
        if (!WidgetIdExists(page, baseId))
        {
            return baseId;
        }

        for (var index = 2; ; index++)
        {
            var candidate = $"{baseId}-{index}";
            if (!WidgetIdExists(page, candidate))
            {
                return candidate;
            }
        }
    }

    private static bool WidgetIdExists(DashPage page, string widgetId)
    {
        return page.Widgets.Any(widget => string.Equals(widget.Id, widgetId, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Whether two widgets share at least one grid cell.</summary>
    public static bool Intersects(DashWidget first, DashWidget second) =>
        Intersects(first.Col, first.Row, first.ColSpan, first.RowSpan, second.Col, second.Row, second.ColSpan, second.RowSpan);

    private static bool Intersects(
        int left,
        int top,
        int width,
        int height,
        int otherLeft,
        int otherTop,
        int otherWidth,
        int otherHeight)
    {
        return left < otherLeft + otherWidth &&
            left + width > otherLeft &&
            top < otherTop + otherHeight &&
            top + height > otherTop;
    }
}
