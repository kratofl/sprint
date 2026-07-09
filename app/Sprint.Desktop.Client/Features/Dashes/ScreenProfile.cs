namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// A target wheel-screen size a dash is designed <em>for</em> (PRD #122 dash↔screen
/// model). The profile fixes the canvas resolution/aspect and the sensible grid a
/// user places widgets on, so what they design is pixel-faithful to the hardware
/// (US15/US16/US19). Sizes are drawn from the VoCore M-PRO / USBD480 NX families
/// documented in <c>docs/SCREEN_PROTOCOLS.md</c>.
/// </summary>
public sealed record ScreenProfile(string Id, string Name, int Width, int Height, int GridCols, int GridRows)
{
    public string Orientation =>
        Width > Height ? "Landscape" : Width < Height ? "Portrait" : "Square";

    /// <summary>Width ÷ height — the shape the editor canvas takes so the design is what-you-see-is-what-runs.</summary>
    public double AspectRatio => Height == 0 ? 1.0 : (double)Width / Height;

    /// <summary>Short "800 × 480" resolution label for chips/selectors.</summary>
    public string ResolutionLabel => $"{Width} × {Height}";
}

/// <summary>
/// The fixed set of common wheel-screen sizes a dash can target. Grids are chosen
/// per aspect (roughly one cell per ~40 px, kept even) and are not user-editable in
/// this version. The landscape 800×480 default keeps the historical 20×12 grid so
/// existing saved layouts normalize onto it without refitting.
/// </summary>
public static class ScreenProfileCatalog
{
    public const string DefaultId = "landscape-800x480";

    public static IReadOnlyList<ScreenProfile> All { get; } =
    [
        new("landscape-800x480", "Landscape 800 × 480", 800, 480, 20, 12),
        new("square-800x800", "Square 800 × 800", 800, 800, 16, 16),
        new("landscape-1024x600", "Landscape 1024 × 600", 1024, 600, 24, 14),
        new("portrait-480x854", "Portrait 480 × 854", 480, 854, 12, 20),
        new("portrait-480x800", "Portrait 480 × 800", 480, 800, 12, 20),
        new("portrait-720x1280", "Portrait 720 × 1280", 720, 1280, 12, 22),
    ];

    public static ScreenProfile Default => Find(DefaultId)!;

    public static ScreenProfile? Find(string? id) =>
        string.IsNullOrWhiteSpace(id)
            ? null
            : All.FirstOrDefault(profile => string.Equals(profile.Id, id, StringComparison.OrdinalIgnoreCase));

    /// <summary>The profile for an id, falling back to the default when blank/unknown (legacy normalization).</summary>
    public static ScreenProfile Resolve(string? id) => Find(id) ?? Default;

    /// <summary>The best-fit catalog profile for a raw grid, used when normalizing a legacy layout that has no stored profile.</summary>
    public static ScreenProfile MatchGrid(int cols, int rows)
    {
        var exact = All.FirstOrDefault(profile => profile.GridCols == cols && profile.GridRows == rows);
        if (exact is not null)
        {
            return exact;
        }

        if (cols <= 0 || rows <= 0)
        {
            return Default;
        }

        // Otherwise pick the profile whose aspect is closest to the raw grid's aspect.
        var gridAspect = (double)cols / rows;
        return All.OrderBy(profile => Math.Abs(profile.AspectRatio - gridAspect)).First();
    }
}
