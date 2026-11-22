using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Rewrites retired widget types on saved layouts so older dashes keep working after the catalog
/// drops them: each becomes the single-value widget that shows what its old setting picked (a
/// <c>lap_time</c> showing the last lap becomes <c>last_lap</c>), and the setting goes. Runs before
/// <see cref="DashLayoutValidator"/> (which rejects unknown types, and so the whole dash) on every
/// page, the idle page and the pit limiter's widgets, and reports whether anything changed so the
/// caller can re-persist the upgrade.
/// </summary>
public static class DashWidgetTypeMigration
{
    public static bool Apply(DashLayout layout)
    {
        bool changed = false;
        if (layout.IdlePage is not null)
        {
            changed |= ApplyToWidgets(layout.IdlePage.Widgets, layout.LegacyZoned == true);
        }

        foreach (DashPage page in layout.Pages)
        {
            changed |= ApplyToWidgets(page.Widgets, layout.LegacyZoned == true);
        }

        changed |= ApplyToPitLimiter(layout);
        return changed;
    }

    /// <summary>Runs after <see cref="DashWidgetStackMigration"/>, so every widget is in the page's own list.</summary>
    private static bool ApplyToWidgets(List<DashWidget> widgets, bool zoned)
    {
        bool changed = widgets.RemoveAll(widget => IsDropped(widget, zoned)) > 0;
        foreach (DashWidget widget in widgets)
        {
            changed |= ApplyToWidget(widget);
        }

        return changed;
    }

    /// <summary>
    /// The header has no successor, and the flag left the top bar spot (the flag bar shows flags
    /// now), where a zoned dash would otherwise no longer validate.
    /// </summary>
    private static bool IsDropped(DashWidget widget, bool zoned) =>
        string.Equals(widget.Type, "header", StringComparison.OrdinalIgnoreCase) ||
        (zoned &&
            string.Equals(widget.Type, "flag", StringComparison.OrdinalIgnoreCase) &&
            DashTracks.InZonedBarSpot(widget));

    private static bool ApplyToWidget(DashWidget widget)
    {
        (string? Type, string? RetiredKey) rewrite = widget.Type.ToLowerInvariant() switch
        {
            // The hybrid/ERS widget became the virtual-energy level; so did the budget widget.
            "ers" => ("ve_percent", null),
            "virtual_energy" => ("ve_percent", "mode"),
            "soc" => ("battery", null),
            "slip" => ("tc_slip", null),
            "cut" => ("tc2", null),
            "arb" => ("arb_front", null),
            "weather" => ("air_temp", null),
            "sector" => ("sectors", null),
            "lap_time" => (ConfigString(widget, "show") switch
            {
                "last" => "last_lap",
                "best" => "best_lap",
                "session" => "session_best",
                "class" => "class_best",
                // "current", and "all" (current, last and best stacked).
                _ => "current_lap",
            }, "show"),
            // "ahead", and "both".
            "gaps" => (ConfigString(widget, "side") == "behind" ? "gap_behind" : "gap_ahead", "side"),
            // The surface/core switch became two widgets.
            "tyre_temp" => (ConfigString(widget, "channel") == "core" ? "tyre_core_temp" : "tyre_temp", "channel"),
            _ => (null, null),
        };

        bool changed = false;
        if (rewrite.Type is not null && !string.Equals(rewrite.Type, widget.Type, StringComparison.Ordinal))
        {
            widget.Type = rewrite.Type;
            changed = true;
        }

        if (rewrite.RetiredKey is not null && widget.Config?.Remove(rewrite.RetiredKey) == true)
        {
            if (widget.Config.Count == 0)
            {
                widget.Config = null;
            }

            changed = true;
        }

        return changed;
    }

    private static string? ConfigString(DashWidget widget, string key) =>
        widget.Config?.TryGetValue(key, out JsonElement value) == true && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.ToLowerInvariant()
            : null;

    /// <summary>
    /// The pit limiter (<c>pitLimiter</c>) is the renderer's and the designer's; Core keeps it as
    /// raw JSON and reads only its widgets here. One that does not parse is left as it is.
    /// </summary>
    private static bool ApplyToPitLimiter(DashLayout layout)
    {
        if (layout.ExtensionData?.TryGetValue("pitLimiter", out JsonElement raw) != true || raw.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        PitLimiterWidgets? pitLimiter;
        try
        {
            pitLimiter = raw.Deserialize<PitLimiterWidgets>();
        }
        catch (JsonException)
        {
            return false;
        }

        if (pitLimiter?.Widgets is not { } widgets || !ApplyToWidgets(widgets, layout.LegacyZoned == true))
        {
            return false;
        }

        layout.ExtensionData["pitLimiter"] = JsonSerializer.SerializeToElement(pitLimiter);
        return true;
    }

    private sealed class PitLimiterWidgets
    {
        [JsonPropertyName("widgets")]
        public List<DashWidget>? Widgets { get; set; }

        [JsonExtensionData]
        public Dictionary<string, JsonElement>? ExtensionData { get; set; }
    }
}
