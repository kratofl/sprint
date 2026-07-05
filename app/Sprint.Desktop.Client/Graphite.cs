using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Immutable;

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
    public static readonly Color Bg = Color.Parse("#0A0A0A");
    public static readonly Color Panel = Color.Parse("#0F0F0F");
    public static readonly Color Panel2 = Color.Parse("#141414");
    public static readonly Color Panel3 = Color.Parse("#1A1A1A");
    public static readonly Color Line = Color.Parse("#2E2E2E");
    public static readonly Color Line2 = Color.Parse("#424242");
    public static readonly Color Text = Color.Parse("#F6F6F6");
    public static readonly Color Text2 = Color.Parse("#7A7A7A");
    public static readonly Color Text3 = Color.Parse("#5A5A5A");
    public static readonly Color Accent = Color.Parse("#FF6A00");
    public static readonly Color Green = Color.Parse("#16B566");
    public static readonly Color Red = Color.Parse("#F02744");
    public static readonly Color RedBg = Color.Parse("#3A0A10");
    public static readonly Color RedBorder = Color.Parse("#851727");
    public static readonly Color Yellow = Color.Parse("#E0A30C");
    public static readonly Color Blue = Color.Parse("#1F7FE6");

    public const int RadiusXs = 4;
    public const int RadiusSm = 6;
    public const int RadiusMd = 8;
    public const int RadiusLg = 10;
    public const int RadiusXl = 14;
    public const int RadiusPill = 999;

    public const int Space1 = 2;
    public const int Space2 = 4;
    public const int Space3 = 6;
    public const int Space4 = 8;
    public const int Space5 = 10;
    public const int Space6 = 14;
    public const int Space7 = 16;
    public const int Space8 = 18;
    public const int Space9 = 20;
    public const int Space10 = 22;
    public const int Space12 = 36;

    public const int TitlebarHeight = 32;
    public const int SidebarExpandedWidth = 220;
    public const int SidebarCollapsedWidth = 62;

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
    public static readonly IBrush RedBgBrush = Brush(RedBg);
    public static readonly IBrush RedBorderBrush = Brush(RedBorder);
    public static readonly IBrush YellowBrush = Brush(Yellow);
    public static readonly IBrush BlueBrush = Brush(Blue);

    // Figma typography, bundled under Assets/Fonts (see docs/FIGMA_COMPONENTS.md).
    // Inter is the UI/body face (Regular + Bold resolve by weight within "#Inter";
    // Medium/SemiBold ship as split families so they are referenced explicitly).
    // Saira SemiCondensed is the condensed motorsport face used for the wordmark,
    // section labels, segmented/tab items, chips, and numeric counters.
    // Space Grotesk is the display/brand glyph face.
    public const string FontStack = "avares://Sprint.Desktop.Client/Assets/Fonts#Inter";
    public const string FontStackMedium = "avares://Sprint.Desktop.Client/Assets/Fonts#Inter Medium";
    public const string FontStackSemiBold = "avares://Sprint.Desktop.Client/Assets/Fonts#Inter SemiBold";
    public const string CondensedFontStack = "avares://Sprint.Desktop.Client/Assets/Fonts#Saira SemiCondensed";
    public const string DisplayFontStack = "avares://Sprint.Desktop.Client/Assets/Fonts#Space Grotesk";

    public static IBrush Brush(Color color) => new ImmutableSolidColorBrush(color);

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
            FontFamily = CondensedFontStack,
            FontSize = 11,
            FontWeight = FontWeight.SemiBold,
            LetterSpacing = 1.5,
            Foreground = Text2Brush
        };
    }

    public static Button Button(string text, ButtonTone tone = ButtonTone.Neutral)
    {
        var background = tone switch
        {
            ButtonTone.Primary => AccentBrush,
            ButtonTone.Ghost => Brushes.Transparent,
            ButtonTone.Danger => RedBgBrush,
            _ => Panel2Brush
        };
        var foreground = tone switch
        {
            ButtonTone.Primary => Panel2Brush,
            ButtonTone.Danger => RedBrush,
            ButtonTone.Ghost => Text2Brush,
            _ => TextBrush
        };
        var border = tone switch
        {
            ButtonTone.Danger => RedBorderBrush,
            ButtonTone.Ghost => Brushes.Transparent,
            _ => LineBrush
        };

        return new Button
        {
            Content = text,
            Background = background,
            Foreground = foreground,
            BorderBrush = border,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(RadiusMd),
            FontFamily = FontStack,
            FontSize = 13,
            FontWeight = FontWeight.Bold,
            Padding = new Thickness(14, 6),
            MinHeight = 25,
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center
        };
    }

    // Reusable shared-state panel (empty/loading/disconnected/stale/… — WS11).
    // Feature slices compose this instead of re-inventing per-view state visuals.
    public static Control StatePanel(string title, string detail, IBrush accent)
    {
        var dot = new Border
        {
            Width = 10,
            Height = 10,
            CornerRadius = new CornerRadius(999),
            Background = accent,
            HorizontalAlignment = HorizontalAlignment.Center
        };

        var stack = new StackPanel
        {
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
        stack.Children.Add(dot);

        var heading = TextBlock(title, 16, FontWeight.Bold, TextBrush);
        heading.HorizontalAlignment = HorizontalAlignment.Center;
        heading.TextAlignment = TextAlignment.Center;
        stack.Children.Add(heading);

        if (!string.IsNullOrWhiteSpace(detail))
        {
            var body = TextBlock(detail, 12, FontWeight.Normal, Text3Brush, TextWrapping.Wrap);
            body.HorizontalAlignment = HorizontalAlignment.Center;
            body.TextAlignment = TextAlignment.Center;
            body.MaxWidth = 380;
            stack.Children.Add(body);
        }

        return new Border
        {
            Background = PanelBrush,
            BorderBrush = LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(28),
            MinHeight = 160,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            Child = stack
        };
    }

    // Figma Toggle: pill track, white knob; ON = green track, knob right (success
    // semantics — not ember). Disabled dims the whole control.
    public static Control Toggle(bool on, Action<bool> onChanged, bool enabled = true)
    {
        var knob = new Border
        {
            Width = 18,
            Height = 18,
            CornerRadius = new CornerRadius(999),
            Background = Brush(Color.Parse("#FFFFFF")),
            HorizontalAlignment = on ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(3, 0)
        };

        var track = new Border
        {
            Width = 44,
            Height = 24,
            CornerRadius = new CornerRadius(999),
            Background = on ? GreenBrush : Panel2Brush,
            BorderBrush = on ? GreenBrush : LineBrush,
            BorderThickness = new Thickness(1),
            Opacity = enabled ? 1.0 : 0.45,
            Cursor = enabled ? new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand) : Avalonia.Input.Cursor.Default,
            HorizontalAlignment = HorizontalAlignment.Left,
            Child = knob
        };

        if (enabled)
        {
            track.PointerPressed += (_, _) => onChanged(!on);
        }

        return track;
    }

    public static Border StatusPill(string text, IBrush? brush = null)
    {
        return new Border
        {
            Background = Panel2Brush,
            BorderBrush = Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(10, 4),
            // Pills are intrinsically sized; never stretch to fill a form cell.
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
            Child = new TextBlock
            {
                Text = text.ToUpperInvariant(),
                FontFamily = CondensedFontStack,
                FontSize = 11,
                FontWeight = FontWeight.SemiBold,
                LetterSpacing = 0.5,
                Foreground = brush ?? Text2Brush
            }
        };
    }

    // Outline chip/badge (Figma Chip): transparent fill, 1px colored border + same
    // color uppercase label in the condensed motorsport face, 4px radius.
    public static Border Chip(string text, IBrush? accent = null)
    {
        var brush = accent ?? Text2Brush;
        return new Border
        {
            Background = Brushes.Transparent,
            BorderBrush = brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(RadiusXs),
            Padding = new Thickness(10, 3),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
            Child = new TextBlock
            {
                Text = text.ToUpperInvariant(),
                FontFamily = CondensedFontStack,
                FontSize = 12,
                FontWeight = FontWeight.Bold,
                LetterSpacing = 0.5,
                Foreground = brush
            }
        };
    }
}
