namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// A dash has one look: flat frames with its corners, edge and label spot in <c>chrome</c>, which
/// the renderer reads straight from the JSON. Older dashes chose a frame style (<c>dashStyle</c>:
/// panels, grid or label bars) and gave widgets their own colours and edges; they move to the flat
/// look, each widget keeping only where its label sits (never the band, which is the dash's alone).
/// Colours follow meaning in the renderer, not the widget.
/// </summary>
public static class DashLooks
{
    /// <summary>The label spots a widget may pick: off, in the edge, centred, left or right.</summary>
    public static readonly IReadOnlySet<string> WidgetLabels = new HashSet<string>(StringComparer.Ordinal) { "off", "on", "top", "left", "right" };

    /// <summary>Drops a saved frame style and every widget's look but its label spot; true when anything changed.</summary>
    public static bool Flatten(DashLayout layout)
    {
        bool changed = layout.ExtensionData?.Remove("dashStyle") == true;
        if (layout.IdlePage is not null)
        {
            changed |= FlattenWidgets(layout.IdlePage.Widgets);
        }

        foreach (DashPage page in layout.Pages)
        {
            changed |= FlattenWidgets(page.Widgets);
        }

        return changed;
    }

    private static bool FlattenWidgets(List<DashWidget> widgets)
    {
        bool changed = false;
        foreach (DashWidget widget in widgets)
        {
            if (widget.Style is null)
            {
                continue;
            }

            // Colours and edges are not read into the style at all; a label that is no widget spot goes too.
            if (widget.Style.Label is not null && !WidgetLabels.Contains(widget.Style.Label))
            {
                widget.Style.Label = null;
            }

            if (widget.Style.Label is null)
            {
                widget.Style = null;
                changed = true;
            }
        }

        return changed;
    }
}
