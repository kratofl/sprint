namespace Sprint.Desktop.Features.Dashes;

public static class DashLayoutValidator
{
    public static bool IsValid(DashLayout layout)
    {
        if (string.IsNullOrWhiteSpace(layout.Id) || layout.GridCols <= 0 || layout.GridRows <= 0)
        {
            return false;
        }

        return Pages(layout).All(page => PageIsValid(page, layout.GridCols, layout.GridRows));
    }

    private static IEnumerable<DashPage> Pages(DashLayout layout)
    {
        if (layout.IdlePage is not null)
        {
            yield return layout.IdlePage;
        }

        foreach (DashPage page in layout.Pages)
        {
            yield return page;
        }
    }

    /// <summary>
    /// Every widget is a known type inside the grid, the groups form a tree, and no two widgets
    /// share a cell unless they sit in different layers of one stack (<see cref="DashWidgetGroups"/>).
    /// </summary>
    private static bool PageIsValid(DashPage page, int cols, int rows)
    {
        foreach (DashWidget widget in page.Widgets)
        {
            if (string.IsNullOrWhiteSpace(widget.Id) ||
                string.IsNullOrWhiteSpace(widget.Type) ||
                !DashWidgetCatalog.IsKnown(widget.Type) ||
                widget.Col < 0 ||
                widget.Row < 0 ||
                widget.ColSpan <= 0 ||
                widget.RowSpan <= 0 ||
                widget.Col + widget.ColSpan > cols ||
                widget.Row + widget.RowSpan > rows)
            {
                return false;
            }
        }

        if (!DashWidgetGroups.IsWellFormed(page))
        {
            return false;
        }

        List<Dictionary<string, string>> layers = page.Widgets.Select(widget => DashWidgetGroups.StackLayers(page, widget)).ToList();
        for (int first = 0; first < page.Widgets.Count; first++)
        {
            for (int second = first + 1; second < page.Widgets.Count; second++)
            {
                if (DashLayoutEditor.Intersects(page.Widgets[first], page.Widgets[second]) && !DashWidgetGroups.MayOverlap(layers[first], layers[second]))
                {
                    return false;
                }
            }
        }

        return true;
    }
}
