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

        foreach (var page in layout.Pages)
        {
            yield return page;
        }
    }

    private static bool PageIsValid(DashPage page, int cols, int rows)
    {
        var occupied = new HashSet<(int Col, int Row)>();
        foreach (var widget in page.Widgets)
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

            for (var col = widget.Col; col < widget.Col + widget.ColSpan; col++)
            {
                for (var row = widget.Row; row < widget.Row + widget.RowSpan; row++)
                {
                    if (!occupied.Add((col, row)))
                    {
                        return false;
                    }
                }
            }
        }

        return true;
    }
}
