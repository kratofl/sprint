namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Named layout themes offered by the editor's theme manager. Each preset is a
/// <see cref="DashTheme"/> of hex overrides drawn from the dash colors below — the
/// same values the dash renderer uses (<c>packages/dashboard/src/palette.ts</c>).
/// "Graphite" is the empty (default) theme; applying it clears the layout override.
/// </summary>
public static class DashThemePresets
{
    private const string OrangeHex = "#FF6A00";
    private const string GreenHex = "#16B566";
    private const string RedHex = "#F02744";
    private const string YellowHex = "#E0A30C";
    private const string BlueHex = "#1F7FE6";
    private const string TextHex = "#F5F5F7";
    private const string SuzukiPrimaryHex = "#7C3AED";
    private const string SuzukiAccentHex = "#B15CFF";
    private const string MonoPrimaryHex = "#F6F6F6";
    private const string MonoAccentHex = "#7A7A7A";

    public sealed record Preset(string Name, string AlertColorToken, DashTheme Theme)
    {
        public string SwatchColor => this.Theme.Primary ?? TextHex;
    }

    public static IReadOnlyList<Preset> All { get; } =
    [
        new Preset("Graphite", "auto", new DashTheme()), // default — neutral focal values plus functional racing colors
        new Preset("Ember", "ember", new DashTheme { Primary = OrangeHex, Accent = YellowHex }),
        new Preset("Ice", "ice", new DashTheme { Primary = BlueHex, Accent = GreenHex }),
        new Preset("Viper", "viper", new DashTheme { Primary = GreenHex, Accent = OrangeHex }),
        new Preset("Suzuki", "suzuki", new DashTheme { Primary = SuzukiPrimaryHex, Accent = SuzukiAccentHex }),
        new Preset("Crimson", "crimson", new DashTheme { Primary = RedHex, Accent = YellowHex }),
        new Preset("Mono", "mono", new DashTheme { Primary = MonoPrimaryHex, Accent = MonoAccentHex }),
    ];

    public static string CanonicalAlertColorToken(string? token)
    {
        string normalized = (token ?? string.Empty).Trim().ToLowerInvariant();
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
        string canonical = CanonicalAlertColorToken(token);
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
        DashTheme t = theme ?? new DashTheme();
        foreach (Preset preset in All)
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
