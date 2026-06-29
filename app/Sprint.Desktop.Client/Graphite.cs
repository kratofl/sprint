using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sprint.Desktop;

internal enum ButtonTone
{
    Neutral,
    Primary,
    Ghost,
    Danger
}

internal static class Graphite
{
    public static readonly Color Bg = Color.Parse("#070707");
    public static readonly Color Panel = Color.Parse("#0D0D0D");
    public static readonly Color Panel2 = Color.Parse("#131313");
    public static readonly Color Panel3 = Color.Parse("#1B1B1B");
    public static readonly Color Line = Color.Parse("#1A1A1A");
    public static readonly Color Line2 = Color.Parse("#232323");
    public static readonly Color Text = Color.Parse("#ECECEC");
    public static readonly Color Text2 = Color.Parse("#9A9A9A");
    public static readonly Color Text3 = Color.Parse("#5C5C5C");
    public static readonly Color Accent = Color.Parse("#FF6A00");
    public static readonly Color Green = Color.Parse("#16B566");
    public static readonly Color Red = Color.Parse("#F5483D");
    public static readonly Color Yellow = Color.Parse("#F5C518");
    public static readonly Color Blue = Color.Parse("#4F9CFF");

    public static readonly IBrush BgBrush = Brush(Bg);
    public static readonly IBrush PanelBrush = Brush(Panel);
    public static readonly IBrush Panel2Brush = Brush(Panel2);
    public static readonly IBrush Panel3Brush = Brush(Panel3);
    public static readonly IBrush LineBrush = Brush(Line);
    public static readonly IBrush Line2Brush = Brush(Line2);
    public static readonly IBrush TextBrush = Brush(Text);
    public static readonly IBrush Text2Brush = Brush(Text2);
    public static readonly IBrush Text3Brush = Brush(Text3);
    public static readonly IBrush AccentBrush = Brush(Accent);
    public static readonly IBrush GreenBrush = Brush(Green);
    public static readonly IBrush RedBrush = Brush(Red);
    public static readonly IBrush YellowBrush = Brush(Yellow);
    public static readonly IBrush BlueBrush = Brush(Blue);

    public const string FontStack = "IBM Plex Sans, Segoe UI, Arial";

    public static IBrush Brush(Color color) => new SolidColorBrush(color);

    public static Border Card(Control child, Thickness? padding = null)
    {
        return new Border
        {
            Background = PanelBrush,
            BorderBrush = LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = padding ?? new Thickness(14),
            Child = child
        };
    }

    public static TextBlock TextBlock(
        string text,
        double size = 13,
        FontWeight? weight = null,
        IBrush? brush = null,
        TextWrapping wrapping = TextWrapping.NoWrap)
    {
        return new TextBlock
        {
            Text = text,
            FontFamily = FontStack,
            FontSize = size,
            FontWeight = weight ?? FontWeight.Normal,
            Foreground = brush ?? TextBrush,
            TextWrapping = wrapping
        };
    }

    public static TextBlock SectionLabel(string text)
    {
        return new TextBlock
        {
            Text = text.ToUpperInvariant(),
            FontFamily = FontStack,
            FontSize = 10,
            FontWeight = FontWeight.Bold,
            LetterSpacing = 1.8,
            Foreground = Text3Brush
        };
    }

    public static Button Button(string text, ButtonTone tone = ButtonTone.Neutral)
    {
        var background = tone switch
        {
            ButtonTone.Primary => AccentBrush,
            ButtonTone.Ghost => Brushes.Transparent,
            ButtonTone.Danger => RedBrush,
            _ => Panel2Brush
        };
        var foreground = tone == ButtonTone.Primary || tone == ButtonTone.Danger
            ? Brushes.Black
            : TextBrush;
        var border = tone == ButtonTone.Ghost ? Brushes.Transparent : Line2Brush;

        return new Button
        {
            Content = text,
            Background = background,
            Foreground = foreground,
            BorderBrush = border,
            BorderThickness = new Thickness(1),
            FontFamily = FontStack,
            FontSize = 12,
            FontWeight = FontWeight.SemiBold,
            Padding = new Thickness(12, 7),
            MinHeight = 31,
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center
        };
    }

    public static Border StatusPill(string text, IBrush? brush = null)
    {
        return new Border
        {
            Background = Panel2Brush,
            BorderBrush = Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(9, 4),
            Child = TextBlock(text.ToUpperInvariant(), 10, FontWeight.Bold, brush ?? Text2Brush)
        };
    }
}
