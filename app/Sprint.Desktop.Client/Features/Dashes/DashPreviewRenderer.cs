namespace Sprint.Desktop.Features.Dashes;

public sealed record DashRenderBounds(double X, double Y, double Width, double Height);

public sealed record DashRenderWidget(
    string Id,
    string Type,
    string Label,
    DashRenderBounds Bounds,
    IReadOnlyDictionary<string, object?> Bindings);

public sealed record DashRenderPlan(int Width, int Height, IReadOnlyList<DashRenderWidget> Widgets);

public static class DashPreviewRenderer
{
    public static DashRenderPlan BuildPlan(
        DashLayout layout,
        DashBindingContext context,
        int width,
        int height,
        string? pageId = null)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(context);

        if (width <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(width), "Render width must be positive.");
        }

        if (height <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(height), "Render height must be positive.");
        }

        if (!DashLayoutValidator.IsValid(layout))
        {
            throw new ArgumentException("Dash layout is not valid.", nameof(layout));
        }

        var page = SelectPage(layout, pageId);
        if (page is null)
        {
            return new DashRenderPlan(width, height, []);
        }

        var cellWidth = width / (double)layout.GridCols;
        var cellHeight = height / (double)layout.GridRows;
        var widgets = page.Widgets
            .Select(widget => BuildWidget(widget, context, cellWidth, cellHeight))
            .ToArray();

        return new DashRenderPlan(width, height, widgets);
    }

    private static DashPage? SelectPage(DashLayout layout, string? pageId)
    {
        if (!string.IsNullOrWhiteSpace(pageId))
        {
            return layout.Pages.FirstOrDefault(page => string.Equals(page.Id, pageId, StringComparison.OrdinalIgnoreCase)) ??
                (string.Equals(layout.IdlePage?.Id, pageId, StringComparison.OrdinalIgnoreCase) ? layout.IdlePage : null);
        }

        return layout.Pages.FirstOrDefault() ?? layout.IdlePage;
    }

    private static DashRenderWidget BuildWidget(
        DashWidget widget,
        DashBindingContext context,
        double cellWidth,
        double cellHeight)
    {
        var definition = DashWidgetCatalog.Get(widget.Type);
        var bindings = definition.Bindings.ToDictionary(
            binding => binding,
            binding => DashBindingResolver.Resolve(context, binding),
            StringComparer.OrdinalIgnoreCase);

        return new DashRenderWidget(
            widget.Id,
            widget.Type,
            definition.Name,
            new DashRenderBounds(
                widget.Col * cellWidth,
                widget.Row * cellHeight,
                widget.ColSpan * cellWidth,
                widget.RowSpan * cellHeight),
            bindings);
    }
}
