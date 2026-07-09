using SkiaSharp;
using AvaloniaColor = Avalonia.Media.Color;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The resolved on-wheel colour set for the dash painter. Values mirror the
/// canonical Graphite tokens in <c>Graphite.cs</c> / <c>docs/FIGMA_COMPONENTS.md</c>
/// (ember <c>#FF6A00</c> primary, <c>#1F7FE6</c> informational blue) but the
/// canvas is fixed black per the on-wheel display contract (matrix 4.5). This is
/// deliberately NOT the retired figma-flat palette (<c>#ff906c</c>/<c>#090907</c>)
/// that lived on the <c>feat/figma-flat-ui-theme</c> branch.
/// </summary>
public sealed record DashPalette
{
    public SKColor Background { get; init; } = FromGraphite(Graphite.Bg);
    public SKColor Surface { get; init; } = FromGraphite(Graphite.Panel3);      // bar track / container
    public SKColor Border { get; init; } = FromGraphite(Graphite.Line);         // panel outline
    public SKColor Foreground { get; init; } = FromGraphite(Graphite.Text);     // large values
    public SKColor Secondary { get; init; } = FromGraphite(Graphite.Text2);     // secondary text
    public SKColor Muted { get; init; } = FromGraphite(Graphite.Text3);         // labels
    public SKColor Primary { get; init; } = FromGraphite(Graphite.Accent);      // ember — driver/primary
    public SKColor Accent { get; init; } = FromGraphite(Graphite.Blue);         // blue — comparison/system
    public SKColor Success { get; init; } = FromGraphite(Graphite.Green);
    public SKColor Warning { get; init; } = FromGraphite(Graphite.Yellow);
    public SKColor Danger { get; init; } = FromGraphite(Graphite.Red);
    public SKColor RpmRed { get; init; } = FromGraphite(Graphite.Red);

    public static DashPalette Default { get; } = new();

    /// <summary>
    /// Resolves a layout <see cref="DashTheme"/> into a concrete palette: the
    /// Graphite default with each supplied hex override applied. Unparseable or
    /// missing values inherit the default. The RPM redline tracks the danger colour.
    /// </summary>
    public static DashPalette FromTheme(DashTheme? theme)
    {
        if (theme is null || theme.IsEmpty)
        {
            return Default;
        }

        var danger = Hex(theme.Danger);
        return Default with
        {
            Primary = Hex(theme.Primary) ?? Default.Primary,
            Accent = Hex(theme.Accent) ?? Default.Accent,
            Foreground = Hex(theme.Foreground) ?? Default.Foreground,
            Surface = Hex(theme.Surface) ?? Default.Surface,
            Border = Hex(theme.Border) ?? Default.Border,
            Success = Hex(theme.Success) ?? Default.Success,
            Warning = Hex(theme.Warning) ?? Default.Warning,
            Danger = danger ?? Default.Danger,
            RpmRed = danger ?? Default.RpmRed,
        };
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
        > 110 => Danger,
        > 100 => Warning,
        > 70 => Success,
        > 40 => Accent,
        _ => Muted,
    };

    /// <summary>Dim an RGB colour toward black (0..1 factor), preserving alpha — used for bar tracks/unlit segments.</summary>
    public static SKColor Dim(SKColor color, double factor) => new(
        (byte)(color.Red * factor),
        (byte)(color.Green * factor),
        (byte)(color.Blue * factor),
        color.Alpha);

    private static SKColor FromGraphite(AvaloniaColor color) => new(color.R, color.G, color.B, color.A);
}
