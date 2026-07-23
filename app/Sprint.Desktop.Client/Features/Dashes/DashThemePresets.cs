namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Named layout themes offered by the editor's theme manager. Each preset is a
/// <see cref="DashTheme"/> of hex overrides built from the Graphite/fig tokens
/// (see <c>docs/FIGMA_COMPONENTS.md</c>) so themes stay on-brand. "Graphite" is
/// the empty (default) theme; applying it clears the layout override.
/// </summary>
public static class DashThemePresets
{
    public sealed record Preset(string Name, string AlertColorToken, DashTheme Theme)
    {
        public string SwatchColor => Theme.Primary ?? Graphite.TextHex;
    }

    public static IReadOnlyList<Preset> All { get; } =
    [
        new Preset("Graphite", "auto", new DashTheme()), // default — neutral focal values plus functional racing colors
        new Preset("Ember", "ember", new DashTheme { Primary = Graphite.AccentHex, Accent = Graphite.YellowHex }),
        new Preset("Ice", "ice", new DashTheme { Primary = Graphite.BlueHex, Accent = Graphite.GreenHex }),
        new Preset("Viper", "viper", new DashTheme { Primary = Graphite.GreenHex, Accent = Graphite.AccentHex }),
        new Preset("Suzuki", "suzuki", new DashTheme
        {
            Primary = Graphite.DashThemeSuzukiPrimaryHex,
            Accent = Graphite.DashThemeSuzukiAccentHex,
        }),
        new Preset("Crimson", "crimson", new DashTheme { Primary = Graphite.RedHex, Accent = Graphite.YellowHex }),
        new Preset("Mono", "mono", new DashTheme
        {
            Primary = Graphite.DashThemeMonoPrimaryHex,
            Accent = Graphite.DashThemeMonoAccentHex,
        }),
    ];

    public static string CanonicalAlertColorToken(string? token)
    {
        var normalized = (token ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "blue" => "ice",
            "green" => "viper",
            "purple" => "suzuki",
            "red" => "crimson",
            "white" => "mono",
            "primary" => "ember",
            _ => normalized,
        };
    }

    public static Preset? FindByAlertColorToken(string? token)
    {
        var canonical = CanonicalAlertColorToken(token);
        return All.FirstOrDefault(preset =>
            string.Equals(preset.AlertColorToken, canonical, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>The preset whose output matches the layout's effective color system, or null for a custom Styled theme.</summary>
    public static string? MatchName(DashLayout layout)
    {
        ArgumentNullException.ThrowIfNull(layout);
        return layout.EffectiveColorSystem == DashColorSystem.Functional
            ? "Graphite"
            : MatchName(layout.Theme);
    }

    /// <summary>The name of the preset whose complete override set matches <paramref name="theme"/>, or null for a custom theme.</summary>
    public static string? MatchName(DashTheme? theme)
    {
        var t = theme ?? new DashTheme();
        foreach (var preset in All)
        {
            if (Same(preset.Theme, t))
            {
                return preset.Name;
            }
        }

        return null;
    }

    private static bool Same(DashTheme a, DashTheme b) =>
        SameColor(a.Neutral, b.Neutral) &&
        SameColor(a.GoodOnTarget, b.GoodOnTarget) &&
        SameColor(a.ColdLow, b.ColdLow) &&
        SameColor(a.AssistActive, b.AssistActive) &&
        SameColor(a.Critical, b.Critical) &&
        SameColor(a.Fault, b.Fault) &&
        SameColor(a.TimingFastestOverall, b.TimingFastestOverall) &&
        SameColor(a.TimingPersonalBest, b.TimingPersonalBest) &&
        SameColor(a.Primary, b.Primary) &&
        SameColor(a.Accent, b.Accent) &&
        SameColor(a.Foreground, b.Foreground) &&
        SameColor(a.Surface, b.Surface) &&
        SameColor(a.Border, b.Border) &&
        SameColor(a.Success, b.Success) &&
        SameColor(a.Warning, b.Warning) &&
        SameColor(a.Danger, b.Danger);

    private static bool SameColor(string? a, string? b) =>
        string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
}
