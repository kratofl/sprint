namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Rewrites renamed widget types on saved layouts so older dashes keep working after a
/// catalog rename. Runs before <see cref="DashLayoutValidator"/> (which rejects unknown
/// types) and reports whether anything changed so the caller can re-persist the upgrade.
/// </summary>
public static class DashWidgetTypeMigration
{
    private static readonly IReadOnlyDictionary<string, string> Renames =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            // The hybrid/ERS widget became the configurable Virtual Energy widget.
            ["ers"] = "virtual_energy",
        };

    public static bool Apply(DashLayout layout)
    {
        var changed = false;
        if (layout.IdlePage is not null)
        {
            changed |= ApplyToPage(layout.IdlePage);
        }

        foreach (var page in layout.Pages)
        {
            changed |= ApplyToPage(page);
        }

        return changed;
    }

    private static bool ApplyToPage(DashPage page)
    {
        var changed = false;
        foreach (var widget in page.Widgets)
        {
            changed |= ApplyToWidget(widget);
        }

        foreach (var stack in page.WidgetStacks)
        {
            foreach (var layer in stack.Layers)
            {
                foreach (var widget in layer.Widgets)
                {
                    changed |= ApplyToWidget(widget);
                }
            }
        }

        return changed;
    }

    private static bool ApplyToWidget(DashWidget widget)
    {
        if (!string.IsNullOrWhiteSpace(widget.Type) && Renames.TryGetValue(widget.Type, out var renamed))
        {
            widget.Type = renamed;
            return true;
        }

        return false;
    }
}
