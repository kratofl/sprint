namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The rules a page's widget groups add to the grid, mirrored from <c>groups.ts</c> in
/// <c>packages/dashboard</c>: whether the groups form a tree, and which widgets may share cells.
/// Widgets never overlap, except widgets in different layers (direct children) of one
/// one-at-a-time group, because the wheel draws only one of those layers.
/// </summary>
public static class DashWidgetGroups
{
    /// <summary>
    /// Whether the page's groups form a tree: ids are unique across groups and widgets, every
    /// parent and every widget's group exists, and no group sits inside itself.
    /// </summary>
    public static bool IsWellFormed(DashPage page)
    {
        HashSet<string> ids = new(StringComparer.Ordinal);
        foreach (DashWidgetGroup group in page.Groups)
        {
            if (string.IsNullOrWhiteSpace(group.Id) || !ids.Add(group.Id))
            {
                return false;
            }
        }

        Dictionary<string, DashWidgetGroup> groups = page.Groups.ToDictionary(group => group.Id, StringComparer.Ordinal);
        foreach (DashWidget widget in page.Widgets)
        {
            if (groups.ContainsKey(widget.Id) || (widget.Group is not null && !groups.ContainsKey(widget.Group)))
            {
                return false;
            }
        }

        foreach (DashWidgetGroup group in page.Groups)
        {
            // A walk up longer than the number of groups has gone round a cycle.
            int steps = 0;
            for (string? at = group.Parent; at is not null; at = groups[at].Parent)
            {
                if (!groups.ContainsKey(at) || ++steps > groups.Count)
                {
                    return false;
                }
            }
        }

        return true;
    }

    /// <summary>
    /// For a widget on a well-formed page: each one-at-a-time group above it, mapped to the id of
    /// that group's child the widget descends from (its layer there).
    /// </summary>
    public static Dictionary<string, string> StackLayers(DashPage page, DashWidget widget)
    {
        Dictionary<string, DashWidgetGroup> groups = page.Groups.ToDictionary(group => group.Id, StringComparer.Ordinal);
        Dictionary<string, string> layers = new(StringComparer.Ordinal);
        string below = widget.Id;
        for (string? at = widget.Group; at is not null && groups.TryGetValue(at, out DashWidgetGroup? group); at = group.Parent)
        {
            if (group.Mode == DashGroupMode.OneAtATime)
            {
                layers.TryAdd(at, below);
            }

            below = at;
        }

        return layers;
    }

    /// <summary>Whether two widgets may share cells: only when they sit in different layers of one stack.</summary>
    public static bool MayOverlap(IReadOnlyDictionary<string, string> first, IReadOnlyDictionary<string, string> second)
    {
        foreach (KeyValuePair<string, string> stack in first)
        {
            if (second.TryGetValue(stack.Key, out string? layer) && !string.Equals(layer, stack.Value, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
