using SkiaSharp;
using AvaloniaColor = Avalonia.Media.Color;

namespace Sprint.Desktop.Features.Charts;

/// <summary>
/// The chart stack's colours, resolved from the canonical Graphite tokens rather than
/// restated as hex. Ember is the current/selected series and blue the explicit comparison
/// (ADR 0024); cursor chrome stays neutral so the only loud thing in a chart is its data.
/// </summary>
internal static class ChartPalette
{
    /// <summary>The chart surface. Matches the Graphite card the stack sits in.</summary>
    public static readonly SKColor Surface = From(Graphite.Panel2);

    /// <summary>
    /// The HUD surface: the same Graphite card, translucent, so the game reads through it.
    /// <para>
    /// Not fully transparent. Over a bright kerb or a white car the ember and blue lines would
    /// lose their contrast entirely, and a trace you cannot read mid-corner is worse than one
    /// that costs a little of the view. 200/255 keeps the track visible while giving every
    /// mark a stable ground to sit on — the legibility problem spec §5 flagged as unsolved for
    /// the Graphite stack.
    /// </para>
    /// </summary>
    public static readonly SKColor HudSurface = From(Graphite.Panel2).WithAlpha(200);

    /// <summary>Tooltip/readout fill and border — one step up from the surface, hairline edge.</summary>
    public static readonly SKColor Readout = From(Graphite.Panel3);

    public static readonly SKColor ReadoutBorder = From(Graphite.Line2);

    /// <summary>Grid lines: one step off the surface, hairline, solid, recessive.</summary>
    public static readonly SKColor Grid = From(Graphite.Line2);

    public static readonly SKColor Text = From(Graphite.Text);

    public static readonly SKColor TextSecondary = From(Graphite.Text2);

    public static readonly SKColor TextMuted = From(Graphite.Text3);

    /// <summary>The current or selected series.</summary>
    public static readonly SKColor Primary = From(Graphite.Accent);

    /// <summary>An explicit comparison series.</summary>
    public static readonly SKColor Comparison = From(Graphite.Blue);

    /// <summary>The crosshair. Chrome, not data, so it never wears a series colour.</summary>
    public static readonly SKColor Cursor = From(Graphite.Text3);

    /// <summary>A wash of the series colour under its line — never a saturated block.</summary>
    public static SKColor Area(SKColor series) => series.WithAlpha(28);

    public static SKColor Series(ChartSeriesRole role) =>
        role == ChartSeriesRole.Comparison ? Comparison : Primary;

    private static SKColor From(AvaloniaColor color) => new(color.R, color.G, color.B, color.A);
}
