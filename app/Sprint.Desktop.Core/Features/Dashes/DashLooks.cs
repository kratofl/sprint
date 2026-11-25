using System.Text.Json;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Sprint draws one look on every dash: a 1-px edge with the label centred in it, and one group
/// frame. A widget may only turn its label or its frame off; a group's frame is on or off. Older
/// dashes chose their own look: a frame style (<c>dashStyle</c>), corners, edges and label spot
/// (<c>chrome</c>), per-widget colours, edges and label spots, and group frames with their own
/// edge, name style and alignment. They all move to Sprint's look: a widget keeps only a label
/// that was off, and a group that had any frame keeps Sprint's.
/// </summary>
public static class DashLooks
{
    /// <summary>The one value a widget's <see cref="DashWidgetStyle.Label"/> or <see cref="DashWidgetStyle.Frame"/> takes.</summary>
    public const string Off = "off";

    /// <summary>Drops every look Sprint no longer offers; true when anything changed.</summary>
    public static bool Flatten(DashLayout layout)
    {
        bool changed = layout.ExtensionData?.Remove("dashStyle") == true;
        changed |= layout.ExtensionData?.Remove("chrome") == true;
        if (layout.IdlePage is not null)
        {
            changed |= FlattenPage(layout.IdlePage);
        }

        foreach (DashPage page in layout.Pages)
        {
            changed |= FlattenPage(page);
        }

        return changed;
    }

    private static bool FlattenPage(DashPage page)
    {
        bool changed = false;
        foreach (DashWidget widget in page.Widgets)
        {
            changed |= FlattenWidget(widget);
        }

        foreach (DashWidgetGroup group in page.Groups)
        {
            changed |= FlattenGroup(group);
        }

        return changed;
    }

    private static bool FlattenWidget(DashWidget widget)
    {
        if (widget.Style is null)
        {
            return false;
        }

        // Colours and edge weights are not read into the style at all; a label spot or frame
        // value that is not "off" is Sprint's to place.
        bool changed = false;
        if (widget.Style.Label is not null && widget.Style.Label != Off)
        {
            widget.Style.Label = null;
            changed = true;
        }

        if (widget.Style.Frame is not null && widget.Style.Frame != Off)
        {
            widget.Style.Frame = null;
            changed = true;
        }

        if (widget.Style.Label is null && widget.Style.Frame is null)
        {
            widget.Style = null;
            changed = true;
        }

        return changed;
    }

    /// <summary>A group's own frame (<c>style: { border, label, align }</c>) becomes Sprint's when it drew anything.</summary>
    private static bool FlattenGroup(DashWidgetGroup group)
    {
        if (group.ExtensionData is null || !group.ExtensionData.Remove("style", out JsonElement style))
        {
            return false;
        }

        if (style.ValueKind == JsonValueKind.Object)
        {
            bool edge = style.TryGetProperty("border", out JsonElement border) && border.ValueKind == JsonValueKind.String && border.GetString() != "none";
            bool name = style.TryGetProperty("label", out JsonElement label) && label.ValueKind == JsonValueKind.String && label.GetString() != Off;
            group.Framed |= edge || name;
        }

        return true;
    }
}
