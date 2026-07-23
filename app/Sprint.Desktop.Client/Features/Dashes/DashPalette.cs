using SkiaSharp;
using AvaloniaColor = Avalonia.Media.Color;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The resolved on-wheel colour set for the dash painter. Values mirror the
/// canonical Graphite tokens in <c>Graphite.cs</c>. Functional dashboards keep
/// focal values neutral and reserve orange for warnings; styled themes may
/// replace optical accents. The canvas remains a near-black graphite surface.
/// </summary>
public sealed record DashPalette
{
    public SKColor Background { get; init; } = new(8, 8, 10);
    public SKColor Surface { get; init; } = FromGraphite(Graphite.Panel3);      // bar track / container
    public SKColor Border { get; init; } = FromGraphite(Graphite.Line2);         // wheel-instrument outline
    public SKColor Foreground { get; init; } = FromGraphite(Graphite.Text);     // large values
    public SKColor Secondary { get; init; } = FromGraphite(Graphite.Text2);     // secondary text
    public SKColor Muted { get; init; } = FromGraphite(Graphite.Text3);         // labels
    public SKColor Primary { get; init; } = FromGraphite(Graphite.Text);        // functional focal value
    public SKColor Accent { get; init; } = FromGraphite(Graphite.Blue);         // blue — comparison/system
    public SKColor Success { get; init; } = FromGraphite(Graphite.Green);
    public SKColor Warning { get; init; } = FromGraphite(Graphite.Accent);      // orange — attention required
    public SKColor Danger { get; init; } = FromGraphite(Graphite.Red);
    public SKColor RaceControlYellow { get; init; } = FromGraphite(Graphite.Yellow);
    public SKColor RpmNormal { get; init; } = FromGraphite(Graphite.Green);
    public SKColor RpmNearLimit { get; init; } = FromGraphite(Graphite.Red);
    public SKColor RpmShift { get; init; } = FromGraphite(Graphite.Blue);
    public SKColor Neutral { get; init; } = FromGraphite(Graphite.Text);
    public SKColor GoodOnTarget { get; init; } = FromGraphite(Graphite.Green);
    public SKColor ColdLow { get; init; } = FromGraphite(Graphite.Blue);
    public SKColor AssistActive { get; init; } = FromGraphite(Graphite.Blue);
    public SKColor Critical { get; init; } = FromGraphite(Graphite.Red);
    public SKColor Fault { get; init; } = FromGraphite(Graphite.Red);
    public SKColor TimingFastestOverall { get; init; } = FromGraphite(Graphite.Purple);
    public SKColor TimingPersonalBest { get; init; } = FromGraphite(Graphite.Green);

    public static DashPalette Default { get; } = new();

    /// <summary>
    /// Resolves a layout <see cref="DashTheme"/> into a concrete palette: the
    /// Graphite default with each supplied hex override applied. Unparseable or
    /// missing values inherit the default. Styled themes recolor the optical RPM
    /// endpoints while protected safety states remain functional.
    /// </summary>
    public static DashPalette FromTheme(
        DashTheme? theme,
        DashColorSystem colorSystem = DashColorSystem.Styled)
    {
        if (colorSystem == DashColorSystem.Functional || theme is null || theme.IsEmpty)
        {
            return Default;
        }

        return Default with
        {
            Primary = Hex(theme.Primary) ?? Default.Primary,
            Accent = Hex(theme.Accent) ?? Default.Accent,
            Foreground = Hex(theme.Foreground) ?? Default.Foreground,
            Surface = Hex(theme.Surface) ?? Default.Surface,
            Border = Hex(theme.Border) ?? Default.Border,
            Success = Hex(theme.Success) ?? Default.Success,
            Warning = Hex(theme.Warning) ?? Default.Warning,
            Danger = Default.Critical,
            RpmNormal = Hex(theme.Primary) ?? Default.RpmNormal,
            RpmNearLimit = Default.Critical,
            RpmShift = Hex(theme.Accent) ?? Default.RpmShift,
            Neutral = Hex(theme.Neutral) ?? Hex(theme.Foreground) ?? Default.Neutral,
            GoodOnTarget = Hex(theme.GoodOnTarget) ?? Hex(theme.Success) ?? Default.GoodOnTarget,
            ColdLow = Hex(theme.ColdLow) ?? Hex(theme.Accent) ?? Default.ColdLow,
            AssistActive = Hex(theme.AssistActive) ?? Hex(theme.Accent) ?? Default.AssistActive,
            Critical = Default.Critical,
            Fault = Default.Fault,
            TimingFastestOverall = Hex(theme.TimingFastestOverall) ?? Default.TimingFastestOverall,
            TimingPersonalBest = Hex(theme.TimingPersonalBest) ?? Hex(theme.Success) ?? Default.TimingPersonalBest,
        };
    }

    public static DashPalette FromLayout(DashLayout layout)
    {
        ArgumentNullException.ThrowIfNull(layout);
        return FromTheme(layout.Theme, layout.EffectiveColorSystem);
    }

    private static SKColor? Hex(string? value) =>
        !string.IsNullOrWhiteSpace(value) && SKColor.TryParse(value, out var color) ? color : null;

    /// <summary>
    /// Resolves a per-widget style colour token (see <see cref="DashWidgetStyle"/>)
    /// to a palette colour, or null when the token is empty/unrecognised (inherit).
    /// Tokens are on-brand Graphite names so widget styling can't invent off-palette colours.
    /// </summary>
    public SKColor? StyleColor(string? token) => token?.Trim().ToLowerInvariant() switch
    {
        "ember" or "primary" => Primary,
        "blue" or "info" => Accent,
        "green" or "success" => Success,
        "yellow" or "warning" => Warning,
        "red" or "danger" => Danger,
        "white" or "text" => Foreground,
        "muted" or "label" => Muted,
        _ => null,
    };

    /// <summary>The style-colour token names offered by the inspector (in swatch order).</summary>
    public static IReadOnlyList<string> StyleColorTokens { get; } =
        ["ember", "blue", "green", "yellow", "red", "white", "muted"];

    /// <summary>Temperature-coded colour for a tyre readout (Celsius), matching the Go painter thresholds.</summary>
    public SKColor TyreColor(double celsius) => celsius switch
    {
        > 110 => Critical,
        > 100 => Warning,
        > 70 => GoodOnTarget,
        _ => ColdLow,
    };

    /// <summary>Dim an RGB colour toward black (0..1 factor), preserving alpha — used for bar tracks/unlit segments.</summary>
    public static SKColor Dim(SKColor color, double factor) => new(
        (byte)(color.Red * factor),
        (byte)(color.Green * factor),
        (byte)(color.Blue * factor),
        color.Alpha);

    private static SKColor FromGraphite(AvaloniaColor color) => new(color.R, color.G, color.B, color.A);
}
