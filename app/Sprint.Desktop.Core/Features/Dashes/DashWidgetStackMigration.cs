namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Turns widget stacks saved before groups replaced them into groups, so older dashes (from disk,
/// a legacy import or a cloud download) keep drawing the same. Runs before
/// <see cref="DashLayoutValidator"/> and reports whether anything changed so the caller can
/// re-persist the upgrade.
/// </summary>
/// <remarks>
/// A stack becomes a one-at-a-time group showing its default layer; each layer a plain group inside
/// it, in order. A layer's widgets join the page's widget list in page coordinates: the stack's
/// origin plus their cell in its local grid, clipped to the stack as the old renderer clipped
/// them. A widget the old renderer could not draw (its cell outside the stack) is kept hidden.
/// Stacks, layers and layer widgets each had their own id space, so an id already taken on the
/// page gets a <c>-2</c>, <c>-3</c>… suffix. Nothing kept a stack and the page's widgets apart
/// after a screen-size refit; a layer widget that would now overlap a page widget is dropped,
/// because the validator would otherwise reject the whole dash.
/// </remarks>
public static class DashWidgetStackMigration
{
    public static bool Apply(DashLayout layout)
    {
        bool changed = false;
        if (layout.IdlePage is not null)
        {
            changed |= ApplyToPage(layout.IdlePage, layout.GridCols, layout.GridRows);
        }

        foreach (DashPage page in layout.Pages)
        {
            changed |= ApplyToPage(page, layout.GridCols, layout.GridRows);
        }

        return changed;
    }

    private static bool ApplyToPage(DashPage page, int cols, int rows)
    {
        if (page.LegacyWidgetStacks is not { } stacks)
        {
            return false;
        }

        page.LegacyWidgetStacks = null;
        HashSet<string> taken = new(page.Widgets.Select(widget => widget.Id).Concat(page.Groups.Select(group => group.Id)), StringComparer.Ordinal);
        string Claim(string id, string fallback)
        {
            string baseId = string.IsNullOrWhiteSpace(id) ? fallback : id;
            string candidate = baseId;
            for (int index = 2; !taken.Add(candidate); index++)
            {
                candidate = $"{baseId}-{index}";
            }

            return candidate;
        }

        foreach (LegacyDashWidgetStack stack in stacks)
        {
            int stackCols = Math.Max(1, stack.ColSpan);
            int stackRows = Math.Max(1, stack.RowSpan);
            DashWidgetGroup group = new()
            {
                Id = Claim(stack.Id, "stack"),
                Name = string.IsNullOrWhiteSpace(stack.Name) ? "Stack" : stack.Name,
                Mode = DashGroupMode.OneAtATime,
            };
            page.Groups.Add(group);

            bool defaultFound = false;
            foreach (LegacyDashWidgetStackLayer layer in stack.Layers)
            {
                DashWidgetGroup layerGroup = new()
                {
                    Id = Claim(layer.Id, "layer"),
                    Name = string.IsNullOrWhiteSpace(layer.Name) ? "Layer" : layer.Name,
                    Parent = group.Id,
                };
                page.Groups.Add(layerGroup);

                // The old renderer showed the first layer matching the default, else the first layer.
                if (!defaultFound && string.Equals(layer.Id, stack.DefaultLayerId, StringComparison.OrdinalIgnoreCase))
                {
                    group.ShownFirst = layerGroup.Id;
                    defaultFound = true;
                }
                else
                {
                    group.ShownFirst ??= layerGroup.Id;
                }

                foreach (DashWidget widget in layer.Widgets)
                {
                    int localCol = Math.Max(0, widget.Col);
                    int localRow = Math.Max(0, widget.Row);
                    widget.Hidden = widget.Hidden || localCol >= stackCols || localRow >= stackRows;
                    localCol = Math.Min(localCol, stackCols - 1);
                    localRow = Math.Min(localRow, stackRows - 1);
                    widget.Col = Math.Clamp(stack.Col + localCol, 0, cols - 1);
                    widget.Row = Math.Clamp(stack.Row + localRow, 0, rows - 1);
                    widget.ColSpan = Math.Clamp(Math.Min(stackCols - localCol, Math.Max(1, widget.ColSpan)), 1, cols - widget.Col);
                    widget.RowSpan = Math.Clamp(Math.Min(stackRows - localRow, Math.Max(1, widget.RowSpan)), 1, rows - widget.Row);
                    widget.Id = Claim(widget.Id, "widget");
                    widget.Group = layerGroup.Id;
                    if (!Collides(page, widget))
                    {
                        page.Widgets.Add(widget);
                    }
                }
            }
        }

        return true;
    }

    private static bool Collides(DashPage page, DashWidget widget)
    {
        Dictionary<string, string> layers = DashWidgetGroups.StackLayers(page, widget);
        return page.Widgets.Any(other =>
            DashLayoutEditor.Intersects(widget, other) && !DashWidgetGroups.MayOverlap(layers, DashWidgetGroups.StackLayers(page, other)));
    }
}
