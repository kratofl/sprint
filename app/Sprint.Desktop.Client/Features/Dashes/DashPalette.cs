using SkiaSharp;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The resolved on-wheel colour set for the dash painter. Values mirror the
/// canonical Graphite tokens in <c>Graphite.cs</c> / <c>docs/DESIGN.md</c>
/// (ember <c>#FF6A00</c> primary, <c>#4F9CFF</c> informational blue) but the
/// canvas is fixed black per the on-wheel display contract (matrix 4.5). This is
/// deliberately NOT the retired figma-flat palette (<c>#ff906c</c>/<c>#090907</c>)
/// that lived on the <c>feat/figma-flat-ui-theme</c> branch.
/// </summary>
public sealed record DashPalette
{
    public SKColor Background { get; init; } = new(0x00, 0x00, 0x00);   // canvas — fixed black
    public SKColor Surface { get; init; } = new(0x1B, 0x1B, 0x1B);      // bar track / container
    public SKColor Border { get; init; } = new(0x2A, 0x2A, 0x2A);       // panel outline
    public SKColor Foreground { get; init; } = new(0xFF, 0xFF, 0xFF);   // large values
    public SKColor Secondary { get; init; } = new(0xC8, 0xC8, 0xC8);    // secondary text
    public SKColor Muted { get; init; } = new(0x9A, 0x9A, 0x9A);        // labels
    public SKColor Primary { get; init; } = new(0xFF, 0x6A, 0x00);      // ember — driver/primary
    public SKColor Accent { get; init; } = new(0x4F, 0x9C, 0xFF);       // blue — comparison/system
    public SKColor Success { get; init; } = new(0x16, 0xB5, 0x66);
    public SKColor Warning { get; init; } = new(0xF5, 0xC5, 0x18);
    public SKColor Danger { get; init; } = new(0xF5, 0x48, 0x3D);
    public SKColor RpmRed { get; init; } = new(0xF5, 0x48, 0x3D);

    public static DashPalette Default { get; } = new();

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
}
