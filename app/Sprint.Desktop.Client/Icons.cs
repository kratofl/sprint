using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Layout;
using Avalonia.Media;
using Path = Avalonia.Controls.Shapes.Path;

namespace Sprint.Desktop;

/// <summary>
/// Dependency-free renderer for the Figma icon set (Tabler outline, MIT). Each
/// glyph is the concatenated SVG path data from the 24x24 stroke-based source,
/// rendered as a stroked Avalonia <see cref="Path"/> inside a fixed 24x24 canvas
/// so every icon shares the same scale and optical weight. No SVG package needed.
/// </summary>
internal static class Icons
{
    // Tabler outline path data (viewBox 0 0 24 24, stroke-width 2, round caps/joins).
    private static readonly IReadOnlyDictionary<string, string> Data = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["activity"] = "M3 12h4l3 8l4 -16l3 8h4",
        ["adjustments"] = "M4 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M6 4v4 M6 12v8 M10 16a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M12 4v10 M12 18v2 M16 7a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M18 4v1 M18 9v11",
        ["alert-circle"] = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 8v4 M12 16h.01",
        ["alert-triangle"] = "M12 9v4 M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0 M12 16h.01",
        ["bolt"] = "M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11",
        ["check"] = "M5 12l5 5l10 -10",
        ["chevron-down"] = "M6 9l6 6l6 -6",
        ["chevron-left"] = "M15 6l-6 6l6 6",
        ["chevron-right"] = "M9 6l6 6l-6 6",
        ["chevron-up"] = "M6 15l6 -6l6 6",
        ["circle-check"] = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M9 12l2 2l4 -4",
        ["circle-x"] = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M10 10l4 4m0 -4l-4 4",
        ["device-desktop"] = "M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10 M7 20h10 M9 16v4 M15 16v4",
        ["clock"] = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 7v5l3 3",
        ["dots-vertical"] = "M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
        ["droplet"] = "M12 3l5 6a7 7 0 1 1 -10 0l5 -6",
        ["flag"] = "M5 5v16 M5 5h10l-1 4l1 4h-10",
        ["gauge"] = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M13.41 10.59l2.59 -2.59 M7 12a5 5 0 0 1 5 -5",
        ["help-circle"] = "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M12 16v.01 M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483",
        ["home"] = "M5 12l-2 0l9 -9l9 9l-2 0 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7 M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6",
        ["info-circle"] = "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M12 9h.01 M11 12h1v4h1",
        ["layout-dashboard"] = "M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1 M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1 M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1 M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1",
        ["layout-sidebar"] = "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12 M9 4l0 16",
        ["letter-case"] = "M4 20l4 -12l4 12 M6 15h4 M14 10a4 4 0 1 1 0 8h5 M19 14h-5",
        ["lock"] = "M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6 M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0 M8 11v-4a4 4 0 1 1 8 0v4",
        ["minus"] = "M5 12l14 0",
        ["pencil"] = "M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4 M13.5 6.5l4 4",
        ["plus"] = "M12 5l0 14 M5 12l14 0",
        ["search"] = "M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M21 21l-6 -6",
        ["route"] = "M6 19a3 3 0 1 0 0 -6a3 3 0 0 0 0 6 M18 11a3 3 0 1 0 0 -6a3 3 0 0 0 0 6 M8.5 14.5l7 -5",
        ["settings"] = "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065 M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
        ["square"] = "M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14",
        ["temperature"] = "M10 13.5a4 4 0 1 0 4 0v-8.5a2 2 0 0 0 -4 0v8.5 M10 9l4 0",
        ["tool"] = "M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5",
        ["trash"] = "M4 7l16 0 M10 11l0 6 M14 11l0 6 M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12 M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3",
        ["x"] = "M18 6l-12 12 M6 6l12 12",
    };

    public static bool Has(string name) => Data.ContainsKey(name);

    public static Geometry Geometry(string name) =>
        Avalonia.Media.Geometry.Parse(Data.TryGetValue(name, out var d) ? d : Data["help-circle"]);

    /// <summary>
    /// Build a stroked 16px-by-default icon control. The glyph is drawn in its
    /// native 24x24 space and uniformly scaled, so stroke weight stays optically
    /// consistent regardless of <paramref name="size"/>.
    /// </summary>
    public static Control Create(string name, double size = 16, IBrush? stroke = null, double strokeThickness = 2)
    {
        var path = new Path
        {
            Data = Geometry(name),
            Stroke = stroke ?? Graphite.Text2Brush,
            StrokeThickness = strokeThickness,
            StrokeLineCap = PenLineCap.Round,
            StrokeJoin = PenLineJoin.Round,
            Stretch = Stretch.None
        };

        var frame = new Canvas { Width = 24, Height = 24 };
        frame.Children.Add(path);

        return new Viewbox
        {
            Width = size,
            Height = size,
            Stretch = Stretch.Uniform,
            Child = frame,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
    }
}
