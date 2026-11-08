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
        bool changed = false;
        if (layout.IdlePage is not null)
        {
            changed |= ApplyToPage(layout.IdlePage);
        }

        foreach (DashPage page in layout.Pages)
        {
            changed |= ApplyToPage(page);
        }

        return changed;
    }

    /// <summary>Runs after <see cref="DashWidgetStackMigration"/>, so every widget is in the page's own list.</summary>
    private static bool ApplyToPage(DashPage page)
    {
        bool changed = false;
        foreach (DashWidget widget in page.Widgets)
        {
            changed |= ApplyToWidget(widget);
        }

        return changed;
    }

    private static bool ApplyToWidget(DashWidget widget)
    {
        if (!string.IsNullOrWhiteSpace(widget.Type) && Renames.TryGetValue(widget.Type, out string? renamed))
        {
            widget.Type = renamed;
            return true;
        }

        return false;
    }
}
