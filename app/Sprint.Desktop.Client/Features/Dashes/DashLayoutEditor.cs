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
    /// Widget positions and spans are scaled proportionally from the old grid to the new
    /// one, clamped into bounds, and greedily kept in order — a widget that would fall out
    /// of bounds or overlap a kept one is shrunk to 1×1 and, failing that, dropped. This
    /// guarantees the result is a valid, non-overlapping layout for the new aspect.
    /// </summary>
    public static void RefitLayoutToGrid(DashLayout layout, int newCols, int newRows)
    {
        ArgumentNullException.ThrowIfNull(layout);
        if (newCols <= 0 || newRows <= 0)
        {
            return;
        }

        var oldCols = Math.Max(1, layout.GridCols);
        var oldRows = Math.Max(1, layout.GridRows);
        layout.GridCols = newCols;
        layout.GridRows = newRows;

        if (layout.IdlePage is { } idle)
        {
            RefitPage(idle, oldCols, oldRows, newCols, newRows);
        }

        foreach (var page in layout.Pages)
        {
            RefitPage(page, oldCols, oldRows, newCols, newRows);
        }
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
        var occupied = new bool[newCols, newRows];
        var kept = new List<DashWidget>(page.Widgets.Count);

        foreach (var widget in page.Widgets)
        {
            var col = ScaleClampOrigin(widget.Col, oldCols, newCols);
            var row = ScaleClampOrigin(widget.Row, oldRows, newRows);
            var colSpan = Math.Clamp(ScaleSpan(widget.ColSpan, oldCols, newCols), 1, newCols - col);
            var rowSpan = Math.Clamp(ScaleSpan(widget.RowSpan, oldRows, newRows), 1, newRows - row);

            if (!Occupies(occupied, col, row, colSpan, rowSpan))
            {
                Fill(occupied, col, row, colSpan, rowSpan);
                widget.Col = col;
                widget.Row = row;
                widget.ColSpan = colSpan;
                widget.RowSpan = rowSpan;
                kept.Add(widget);
            }
            else if (!Occupies(occupied, col, row, 1, 1))
            {
                Fill(occupied, col, row, 1, 1);
                widget.Col = col;
                widget.Row = row;
                widget.ColSpan = 1;
                widget.RowSpan = 1;
                kept.Add(widget);
            }
        }

        page.Widgets = kept;

        // Widget stacks are self-contained regions (not validity-checked against the page
        // grid), so scale + clamp their geometry for visual continuity without dropping any.
        foreach (var stack in page.WidgetStacks)
        {
            var col = ScaleClampOrigin(stack.Col, oldCols, newCols);
            var row = ScaleClampOrigin(stack.Row, oldRows, newRows);
            stack.Col = col;
            stack.Row = row;
            stack.ColSpan = Math.Clamp(ScaleSpan(stack.ColSpan, oldCols, newCols), 1, newCols - col);
            stack.RowSpan = Math.Clamp(ScaleSpan(stack.RowSpan, oldRows, newRows), 1, newRows - row);
        }
    }

    private static int ScaleClampOrigin(int value, int oldMax, int newMax) =>
        Math.Clamp((int)Math.Round((double)value * newMax / oldMax), 0, newMax - 1);

    private static int ScaleSpan(int span, int oldMax, int newMax) =>
        Math.Max(1, (int)Math.Round((double)span * newMax / oldMax));

    private static bool Occupies(bool[,] grid, int col, int row, int colSpan, int rowSpan)
    {
        for (var c = col; c < col + colSpan; c++)
        {
            for (var r = row; r < row + rowSpan; r++)
            {
                if (grid[c, r])
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static void Fill(bool[,] grid, int col, int row, int colSpan, int rowSpan)
    {
        for (var c = col; c < col + colSpan; c++)
        {
            for (var r = row; r < row + rowSpan; r++)
            {
                grid[c, r] = true;
            }
        }
    }

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
        page.WidgetStacks.Clear();
        return true;
    }

    // ── Widget stacks (multi-function regions) ────────────────────────────────

    public const int DefaultStackColSpan = 6;
    public const int DefaultStackRowSpan = 4;

    public static DashWidgetStack? FindStack(DashPage page, string stackId)
    {
        ArgumentNullException.ThrowIfNull(page);
        return page.WidgetStacks.FirstOrDefault(stack => string.Equals(stack.Id, stackId, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Adds a stack (with one empty layer) at the first free region of the page.</summary>
    public static bool TryAddWidgetStack(DashLayout layout, string pageId, out DashWidgetStack? stack)
    {
        ArgumentNullException.ThrowIfNull(layout);
        stack = null;

        var page = FindPage(layout, pageId);
        if (page is null || !DashLayoutValidator.IsValid(layout))
        {
            return false;
        }

        var colSpan = Math.Min(DefaultStackColSpan, layout.GridCols);
        var rowSpan = Math.Min(DefaultStackRowSpan, layout.GridRows);
        for (var row = 0; row <= layout.GridRows - rowSpan; row++)
        {
            for (var col = 0; col <= layout.GridCols - colSpan; col++)
            {
                if (RegionOccupied(page, col, row, colSpan, rowSpan))
                {
                    continue;
                }

                var layerId = "layer-1";
                stack = new DashWidgetStack
                {
                    Id = NextStackId(page, "stack"),
                    Name = NextStackName(page),
                    Col = col,
                    Row = row,
                    ColSpan = colSpan,
                    RowSpan = rowSpan,
                    DefaultLayerId = layerId,
                    Layers = [new DashWidgetStackLayer { Id = layerId, Name = "Layer 1" }],
                };
                page.WidgetStacks.Add(stack);
                return true;
            }
        }

        return false;
    }

    public static bool TryDeleteStack(DashPage page, string stackId)
    {
        ArgumentNullException.ThrowIfNull(page);
        var stack = FindStack(page, stackId);
        if (stack is null)
        {
            return false;
        }

        page.WidgetStacks.Remove(stack);
        return true;
    }

    public static bool TryRenameStack(DashPage page, string stackId, string name)
    {
        var stack = FindStack(page, stackId);
        if (stack is null || string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        stack.Name = name.Trim();
        return true;
    }

    public static bool TryMoveStack(DashLayout layout, string pageId, string stackId, int col, int row)
    {
        var page = FindPage(layout, pageId);
        var stack = page is null ? null : FindStack(page, stackId);
        if (stack is null)
        {
            return false;
        }

        stack.Col = Math.Clamp(col, 0, Math.Max(0, layout.GridCols - stack.ColSpan));
        stack.Row = Math.Clamp(row, 0, Math.Max(0, layout.GridRows - stack.RowSpan));
        return true;
    }

    public static bool TryResizeStack(DashLayout layout, string pageId, string stackId, int colSpan, int rowSpan)
    {
        var page = FindPage(layout, pageId);
        var stack = page is null ? null : FindStack(page, stackId);
        if (stack is null)
        {
            return false;
        }

        stack.ColSpan = Math.Clamp(colSpan, 1, Math.Max(1, layout.GridCols - stack.Col));
        stack.RowSpan = Math.Clamp(rowSpan, 1, Math.Max(1, layout.GridRows - stack.Row));
        return true;
    }

    public static bool TryAddStackLayer(DashWidgetStack stack, out DashWidgetStackLayer? layer)
    {
        ArgumentNullException.ThrowIfNull(stack);
        var id = NextLayerId(stack);
        layer = new DashWidgetStackLayer { Id = id, Name = NextLayerName(stack) };
        stack.Layers.Add(layer);
        stack.DefaultLayerId ??= id;
        return true;
    }

    public static bool TrySetDefaultStackLayer(DashWidgetStack stack, string layerId)
    {
        ArgumentNullException.ThrowIfNull(stack);
        if (stack.Layers.All(l => !string.Equals(l.Id, layerId, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        stack.DefaultLayerId = layerId;
        return true;
    }

    public static bool TryRenameStackLayer(DashWidgetStack stack, string layerId, string name)
    {
        ArgumentNullException.ThrowIfNull(stack);
        var layer = stack.Layers.FirstOrDefault(l => string.Equals(l.Id, layerId, StringComparison.OrdinalIgnoreCase));
        if (layer is null || string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        layer.Name = name.Trim();
        return true;
    }

    public static bool TryDeleteStackLayer(DashWidgetStack stack, string layerId)
    {
        ArgumentNullException.ThrowIfNull(stack);
        if (stack.Layers.Count <= 1)
        {
            return false;
        }

        var layer = stack.Layers.FirstOrDefault(l => string.Equals(l.Id, layerId, StringComparison.OrdinalIgnoreCase));
        if (layer is null)
        {
            return false;
        }

        stack.Layers.Remove(layer);
        if (string.Equals(stack.DefaultLayerId, layerId, StringComparison.OrdinalIgnoreCase))
        {
            stack.DefaultLayerId = stack.Layers.FirstOrDefault()?.Id;
        }

        return true;
    }

    /// <summary>Adds a widget to a stack layer at the first free cell of the stack's local sub-grid.</summary>
    public static bool TryAddWidgetToStackLayer(DashWidgetStack stack, string layerId, string type, out DashWidget? widget)
    {
        ArgumentNullException.ThrowIfNull(stack);
        widget = null;

        var layer = stack.Layers.FirstOrDefault(l => string.Equals(l.Id, layerId, StringComparison.OrdinalIgnoreCase));
        if (layer is null || !DashWidgetCatalog.IsKnown(type))
        {
            return false;
        }

        var colSpan = Math.Min(DefaultWidgetColSpan, stack.ColSpan);
        var rowSpan = Math.Min(DefaultWidgetRowSpan, stack.RowSpan);
        for (var row = 0; row <= stack.RowSpan - rowSpan; row++)
        {
            for (var col = 0; col <= stack.ColSpan - colSpan; col++)
            {
                if (LayerOccupied(layer, col, row, colSpan, rowSpan))
                {
                    continue;
                }

                widget = new DashWidget
                {
                    Id = NextLayerWidgetId(layer, Slug(type.Replace('_', '-'))),
                    Type = type,
                    Col = col,
                    Row = row,
                    ColSpan = colSpan,
                    RowSpan = rowSpan,
                };
                layer.Widgets.Add(widget);
                return true;
            }
        }

        return false;
    }

    public static bool TryDeleteStackLayerWidget(DashWidgetStack stack, string layerId, string widgetId)
    {
        ArgumentNullException.ThrowIfNull(stack);
        var layer = stack.Layers.FirstOrDefault(l => string.Equals(l.Id, layerId, StringComparison.OrdinalIgnoreCase));
        var widget = layer?.Widgets.FirstOrDefault(w => string.Equals(w.Id, widgetId, StringComparison.OrdinalIgnoreCase));
        if (layer is null || widget is null)
        {
            return false;
        }

        layer.Widgets.Remove(widget);
        return true;
    }

    private static bool RegionOccupied(DashPage page, int col, int row, int colSpan, int rowSpan)
    {
        foreach (var widget in page.Widgets)
        {
            if (Intersects(col, row, colSpan, rowSpan, widget.Col, widget.Row, widget.ColSpan, widget.RowSpan))
            {
                return true;
            }
        }

        foreach (var stack in page.WidgetStacks)
        {
            if (Intersects(col, row, colSpan, rowSpan, stack.Col, stack.Row, stack.ColSpan, stack.RowSpan))
            {
                return true;
            }
        }

        return false;
    }

    private static bool LayerOccupied(DashWidgetStackLayer layer, int col, int row, int colSpan, int rowSpan)
    {
        foreach (var widget in layer.Widgets)
        {
            if (Intersects(col, row, colSpan, rowSpan, widget.Col, widget.Row, widget.ColSpan, widget.RowSpan))
            {
                return true;
            }
        }

        return false;
    }

    private static string NextStackId(DashPage page, string baseId)
    {
        if (page.WidgetStacks.All(s => !string.Equals(s.Id, baseId, StringComparison.OrdinalIgnoreCase)))
        {
            return baseId;
        }

        for (var index = 2; ; index++)
        {
            var candidate = $"{baseId}-{index}";
            if (page.WidgetStacks.All(s => !string.Equals(s.Id, candidate, StringComparison.OrdinalIgnoreCase)))
            {
                return candidate;
            }
        }
    }

    private static string NextStackName(DashPage page) => $"Widget Stack {page.WidgetStacks.Count + 1}";

    private static string NextLayerId(DashWidgetStack stack)
    {
        for (var index = 1; ; index++)
        {
            var candidate = $"layer-{index}";
            if (stack.Layers.All(l => !string.Equals(l.Id, candidate, StringComparison.OrdinalIgnoreCase)))
            {
                return candidate;
            }
        }
    }

    private static string NextLayerName(DashWidgetStack stack) => $"Layer {stack.Layers.Count + 1}";

    private static string NextLayerWidgetId(DashWidgetStackLayer layer, string baseId)
    {
        if (layer.Widgets.All(w => !string.Equals(w.Id, baseId, StringComparison.OrdinalIgnoreCase)))
        {
            return baseId;
        }

        for (var index = 2; ; index++)
        {
            var candidate = $"{baseId}-{index}";
            if (layer.Widgets.All(w => !string.Equals(w.Id, candidate, StringComparison.OrdinalIgnoreCase)))
            {
                return candidate;
            }
        }
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
        foreach (var widget in page.Widgets)
        {
            if (movingWidget is not null && ReferenceEquals(widget, movingWidget))
            {
                continue;
            }

            if (Intersects(
                col,
                row,
                colSpan,
                rowSpan,
                widget.Col,
                widget.Row,
                widget.ColSpan,
                widget.RowSpan))
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
