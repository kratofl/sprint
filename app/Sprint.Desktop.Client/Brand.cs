using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Controls.Shapes;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using Path = Avalonia.Controls.Shapes.Path;

namespace Sprint.Desktop;

/// <summary>
/// Sprint brand marks reconstructed from <c>Assets/Brand/*.svg</c>. The logo tile
/// is the two gradient swoosh paths rendered as filled geometry inside a rounded
/// tile; the wordmark is native Saira SemiCondensed text (the source SVG is itself
/// just Saira text), so both stay crisp at any size with no SVG dependency.
/// </summary>
internal static class Brand
{
    private const string RoadPath =
        "M 468.2 27.7 Q 475.2 29.7 475.7 34.2 Q 476.3 38.8 471.2 56.4 Q 466.2 74.0 397.8 98.6 Q 329.4 123.2 273.1 145.9 Q 216.8 168.5 195.7 179.1 Q 174.5 189.6 168.0 197.2 Q 161.5 204.7 162.0 210.2 Q 162.5 215.8 167.5 220.3 Q 172.5 224.8 223.8 246.4 Q 275.1 268.1 291.7 279.1 Q 308.3 290.2 318.4 300.8 Q 328.4 311.3 333.9 322.4 Q 339.5 333.4 340.5 344.0 Q 341.5 354.6 338.0 367.1 Q 334.4 379.7 324.9 394.3 Q 315.3 408.9 297.2 425.5 Q 279.1 442.1 259.5 455.1 Q 239.9 468.2 212.8 482.8 Q 185.6 497.4 153.9 510.9 Q 122.2 524.5 99.6 525.0 Q 77.0 525.5 56.9 518.0 Q 36.8 510.4 28.7 504.4 Q 20.7 498.4 11.1 487.3 Q 1.6 476.3 -0.5 472.2 Q -2.5 468.2 -1.5 464.2 Q -0.5 460.2 45.8 442.1 Q 92.1 424.0 128.3 407.4 Q 164.5 390.8 185.1 377.7 Q 205.7 364.6 210.7 358.6 Q 215.8 352.5 217.8 347.0 Q 219.8 341.5 217.3 331.9 Q 214.8 322.4 205.7 313.3 Q 196.7 304.3 180.1 295.2 Q 163.5 286.2 126.8 271.6 Q 90.1 257.0 76.5 246.4 Q 62.9 235.9 58.9 227.3 Q 54.9 218.8 54.9 211.2 Q 54.9 203.7 61.9 190.1 Q 68.9 176.5 88.0 161.5 Q 107.2 146.4 140.3 131.8 Q 173.5 117.2 230.9 98.6 Q 288.2 80.0 378.2 53.9 Q 468.2 27.7 471.7 28.7 Z";

    private const string TrackPath =
        "M 458.1 88.0 Q 464.2 88.0 465.7 90.6 Q 467.2 93.1 466.2 105.1 Q 465.2 117.2 462.7 120.2 Q 460.2 123.2 399.3 151.9 Q 338.5 180.6 328.9 187.6 Q 319.4 194.7 317.3 200.2 Q 315.3 205.7 317.9 209.2 Q 320.4 212.8 323.4 213.3 Q 326.4 213.8 332.9 205.7 Q 339.5 197.7 346.5 193.1 Q 353.6 188.6 398.8 165.5 Q 444.1 142.4 450.1 141.3 Q 456.1 140.3 457.6 142.9 Q 459.2 145.4 458.1 157.4 Q 457.1 169.5 425.5 189.1 Q 393.8 208.7 387.2 215.3 Q 380.7 221.8 379.7 226.8 Q 378.7 231.9 380.7 234.9 Q 382.7 237.9 385.2 237.9 Q 387.7 237.9 391.8 231.4 Q 395.8 224.8 401.3 220.3 Q 406.9 215.8 423.5 205.2 Q 440.0 194.7 446.6 192.6 Q 453.1 190.6 455.6 194.1 Q 458.1 197.7 459.2 205.7 Q 460.2 213.8 445.1 227.3 Q 430.0 240.9 427.5 245.4 Q 425.0 250.0 425.0 254.0 Q 425.0 258.0 428.0 260.0 Q 431.0 262.0 434.5 256.5 Q 438.0 251.0 447.1 243.9 Q 456.1 236.9 458.7 239.4 Q 461.2 241.9 461.7 253.5 Q 462.2 265.1 460.7 272.6 Q 459.2 280.1 463.2 287.2 Q 467.2 294.2 467.2 297.2 Q 467.2 300.3 459.2 317.3 Q 451.1 334.4 423.5 363.6 Q 395.8 392.8 384.7 401.8 Q 373.7 410.9 367.1 412.9 Q 360.6 414.9 361.1 411.4 Q 361.6 407.9 370.7 393.3 Q 379.7 378.7 383.7 363.6 Q 387.7 348.5 386.7 337.0 Q 385.7 325.4 380.7 314.3 Q 375.7 303.3 365.1 291.7 Q 354.6 280.1 344.0 272.6 Q 333.4 265.1 312.3 254.0 Q 291.2 242.9 265.6 232.4 Q 239.9 221.8 232.9 214.8 Q 225.8 207.7 227.3 200.7 Q 228.8 193.6 238.9 185.6 Q 249.0 177.6 297.7 155.4 Q 346.5 133.3 402.3 110.7 Q 458.1 88.0 461.2 88.0 Z";

    private static IBrush SwooshBrush(params (double Offset, string Color)[] stops)
    {
        var brush = new LinearGradientBrush
        {
            StartPoint = new RelativePoint(0, 1, RelativeUnit.Relative),
            EndPoint = new RelativePoint(1, 0, RelativeUnit.Relative)
        };
        foreach (var (offset, color) in stops)
        {
            brush.GradientStops.Add(new GradientStop(Color.Parse(color), offset));
        }

        return brush;
    }

    /// <summary>The rounded logo tile with the ember swoosh, scaled to <paramref name="size"/>.</summary>
    public static Control LogoMark(double size = 30)
    {
        var frame = new Canvas { Width = 512, Height = 512 };
        frame.Children.Add(new Path
        {
            Data = Geometry.Parse(RoadPath),
            Fill = SwooshBrush((0, "#FF8636"), (0.55, "#FF6A00"), (1, "#D35200"))
        });
        frame.Children.Add(new Path
        {
            Data = Geometry.Parse(TrackPath),
            Fill = SwooshBrush((0, "#FFA24F"), (0.35, "#FF6A00"), (0.72, "#A8430A"), (1, "#5E2600"))
        });

        var tile = new Border
        {
            Width = 512,
            Height = 512,
            CornerRadius = new CornerRadius(92),
            Background = new ImmutableSolidColorBrush(Color.Parse("#0B0B0B")),
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(6),
            ClipToBounds = true,
            Child = frame
        };

        return new Viewbox
        {
            Width = size,
            Height = size,
            Stretch = Stretch.Uniform,
            Child = tile
        };
    }

    /// <summary>Full sidebar lockup: logo tile + "SPRINT" / "TELEMETRY SYSTEM".</summary>
    public static Control Wordmark(double markSize = 30)
    {
        var sprint = new TextBlock
        {
            Text = "SPRINT",
            FontFamily = Graphite.CondensedFontStack,
            FontSize = 22,
            FontWeight = FontWeight.Bold,
            Foreground = Graphite.AccentBrush,
            LetterSpacing = 1,
            VerticalAlignment = VerticalAlignment.Center
        };

        var sub = new TextBlock
        {
            FontFamily = Graphite.CondensedFontStack,
            FontSize = 9,
            FontWeight = FontWeight.Bold,
            LetterSpacing = 2,
            Inlines = new InlineCollection
            {
                new Run("TELEMETRY") { Foreground = Brush("#CDCDCD") },
                new Run(" SYSTEM") { Foreground = Graphite.GreenBrush }
            }
        };

        var text = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            Children = { sprint, sub }
        };

        return new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 10,
            Children = { LogoMark(markSize), text }
        };
    }

    private static IBrush Brush(string hex) => new ImmutableSolidColorBrush(Color.Parse(hex));
}
