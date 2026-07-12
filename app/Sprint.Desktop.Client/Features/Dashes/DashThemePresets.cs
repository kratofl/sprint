namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Named layout themes offered by the editor's theme manager. Each preset is a
/// <see cref="DashTheme"/> of hex overrides built from the Graphite/fig tokens
/// (see <c>docs/FIGMA_COMPONENTS.md</c>) so themes stay on-brand. "Graphite" is
/// the empty (default) theme; applying it clears the layout override.
/// </summary>
public static class DashThemePresets
{
    public sealed record Preset(string Name, DashTheme Theme);

    public static IReadOnlyList<Preset> All { get; } =
    [
        new Preset("Graphite", new DashTheme()), // default — ember primary, blue accent
        new Preset("Ember", new DashTheme { Primary = "#FF6A00", Accent = "#E0A30C" }),
        new Preset("Ice", new DashTheme { Primary = "#1F7FE6", Accent = "#16B566" }),
        new Preset("Viper", new DashTheme { Primary = "#16B566", Accent = "#FF6A00" }),
        new Preset("Suzuki", new DashTheme { Primary = "#7C3AED", Accent = "#B15CFF" }),
        new Preset("Crimson", new DashTheme { Primary = "#F02744", Accent = "#E0A30C" }),
        new Preset("Mono", new DashTheme { Primary = "#F6F6F6", Accent = "#7A7A7A" }),
    ];

    /// <summary>The name of the preset whose overrides match <paramref name="theme"/>, or null for a custom/none theme.</summary>
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
        a.Primary == b.Primary && a.Accent == b.Accent && a.Foreground == b.Foreground &&
        a.Surface == b.Surface && a.Border == b.Border && a.Success == b.Success &&
        a.Warning == b.Warning && a.Danger == b.Danger;
}
