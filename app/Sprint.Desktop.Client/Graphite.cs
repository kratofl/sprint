using Avalonia;
using Avalonia.Automation;
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

// Severity family for indicators, alerts, and toasts. Maps to the Figma
// badge/indicator tint triples (icon = *500, soft fill = *950/900, border = *700).
internal enum GraphiteIntent
{
    Neutral,
    Primary,
    Success,
    Danger,
    Info
}

internal static class Graphite
{
    public const string PointerOverBackgroundResourceKey = "Sprint.Graphite.PointerOverBackground";
    public const string AccentHex = "#FF6A00";
    public const string GreenHex = "#16B566";
    public const string RedHex = "#F02744";
    public const string YellowHex = "#E0A30C";
    public const string BlueHex = "#1F7FE6";
    public const string PurpleHex = "#A06BFF";
    public const string TextHex = "#F5F5F7";
    public const string DashThemeSuzukiPrimaryHex = "#7C3AED";
    public const string DashThemeSuzukiAccentHex = "#B15CFF";
    public const string DashThemeMonoPrimaryHex = "#F6F6F6";
    public const string DashThemeMonoAccentHex = "#7A7A7A";

    public static readonly Color Bg = Color.Parse("#0B0B0D");
    public static readonly Color Panel = Color.Parse("#101012");
    public static readonly Color Panel2 = Color.Parse("#141416");
    public static readonly Color Panel3 = Color.Parse("#1B1B1E");
    public static readonly Color Line = Color.Parse("#12FFFFFF");
    public static readonly Color Line2 = Color.Parse("#1FFFFFFF");
    public static readonly Color Text = Color.Parse(TextHex);
    public static readonly Color Text2 = Color.Parse("#A1A1AA");
    public static readonly Color Text3 = Color.Parse("#6F6F78");
    public static readonly Color Accent = Color.Parse(AccentHex);
    public static readonly Color Green = Color.Parse(GreenHex);
    public static readonly Color GreenBg = Color.Parse("#05281A");
    public static readonly Color GreenBorder = Color.Parse("#0E7445");
    public static readonly Color Red = Color.Parse(RedHex);
    public static readonly Color RedBg = Color.Parse("#3A0A10");
    public static readonly Color RedBorder = Color.Parse("#851727");
    public static readonly Color Yellow = Color.Parse(YellowHex);
    public static readonly Color Blue = Color.Parse(BlueHex);
    public static readonly Color Purple = Color.Parse(PurpleHex);
    public static readonly Color BlueBg = Color.Parse("#091D38");
    public static readonly Color BlueBorder = Color.Parse("#114F99");
    public static readonly Color AccentBg = Color.Parse("#421A02");
    public static readonly Color AccentBorder = Color.Parse("#BF4D00");
    public static readonly Color IconNeutral = Color.Parse("#A0A0A0"); // Neutral/300 — muted status icon
    public static readonly Color Panel2Hover = Color.Parse("#232327");
    public static readonly Color Panel3Hover = Color.Parse("#232327");
    public static readonly Color AccentHover = Brighten(Accent, 0.10);
    public static readonly Color OverlayChrome = Color.Parse("#E6101012");

    // Primary orange is intentionally flat. Gradient brushes remain dispatcher-owned
    // for the quieter selection and telemetry materials below.
    public static IBrush ActionMaterialBrush => AccentBrush;
    public static IBrush SelectionMaterialBrush => Material(
        ("#7A3204", 0d),
        ("#421A02", 1d));
    public static IBrush TelemetryMaterialBrush => Material(
        ("#FF9F0A", 0d),
        ("#FF6A00", 1d));

    public const int RadiusNested = 6;
    public const int RadiusControl = 8;
    public const int RadiusGroup = 12;
    public const int RadiusOverlay = 16;
    public const int RadiusPill = 999;

    // Compatibility aliases keep existing components coherent while call sites
    // migrate from size-based names to the semantic radius roles above.
    public const int RadiusXs = RadiusNested;
    public const int RadiusSm = RadiusControl;
    public const int RadiusMd = RadiusControl;
    public const int RadiusLg = RadiusGroup;
    public const int RadiusXl = RadiusOverlay;

    public const int IconSizeControl = 16;
    public const int IconSizeNavigation = 20;
    public const int IconSizeEmphasis = 24;
    public const int FocusThickness = 2;

    public static readonly TimeSpan FeedbackDuration = TimeSpan.Zero;
    public static readonly TimeSpan ContentFadeDuration = TimeSpan.FromMilliseconds(100);
    public static readonly TimeSpan SpatialDuration = TimeSpan.FromMilliseconds(160);

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

    public const int ToolbarHeight = 44;
    public const int CaptionButtonWidth = 46;
    public const int CaptionButtonCount = 3;
    public const int CaptionButtonSpacing = 2;
    public const int CaptionButtonsWidth =
        (CaptionButtonWidth * CaptionButtonCount) +
        (CaptionButtonSpacing * (CaptionButtonCount - 1));
    public const int SidebarExpandedWidth = 184;
    public const int SidebarCollapsedWidth = 52;

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
    public static readonly IBrush GreenBgBrush = Brush(GreenBg);
    public static readonly IBrush GreenBorderBrush = Brush(GreenBorder);
    public static readonly IBrush RedBrush = Brush(Red);
    public static readonly IBrush RedBgBrush = Brush(RedBg);
    public static readonly IBrush RedBorderBrush = Brush(RedBorder);
    public static readonly IBrush YellowBrush = Brush(Yellow);
    public static readonly IBrush BlueBrush = Brush(Blue);
    public static readonly IBrush BlueBgBrush = Brush(BlueBg);
    public static readonly IBrush BlueBorderBrush = Brush(BlueBorder);
    public static readonly IBrush AccentBgBrush = Brush(AccentBg);
    public static readonly IBrush AccentBorderBrush = Brush(AccentBorder);
    public static readonly IBrush IconNeutralBrush = Brush(IconNeutral);
    public static readonly IBrush Panel2HoverBrush = Brush(Panel2Hover);
    public static readonly IBrush Panel3HoverBrush = Brush(Panel3Hover);
    public static readonly IBrush AccentHoverBrush = Brush(AccentHover);
    public static readonly IBrush OverlayChromeBrush = Brush(OverlayChrome);

    // Inter is the single UI face. Brand artwork retains its own lettering, while
    // app chrome, labels, controls, and frequently-updating numbers share one calm
    // typographic voice.
    public const string FontStack = "avares://Sprint.Desktop.Client/Assets/Fonts#Inter";
    public const string FontStackMedium = "avares://Sprint.Desktop.Client/Assets/Fonts#Inter Medium";
    public const string FontStackSemiBold = "avares://Sprint.Desktop.Client/Assets/Fonts#Inter SemiBold";
    public const string CondensedFontStack = FontStack;
    public const string DisplayFontStack = FontStack;

    public static IBrush Brush(Color color) => new ImmutableSolidColorBrush(color);

    private static IBrush Material(params (string Color, double Offset)[] stops)
    {
        var brush = new LinearGradientBrush
        {
            StartPoint = new RelativePoint(0.5, 0, RelativeUnit.Relative),
            EndPoint = new RelativePoint(0.5, 1, RelativeUnit.Relative),
        };
        foreach (var (color, offset) in stops)
        {
            brush.GradientStops.Add(new GradientStop(Color.Parse(color), offset));
        }

        return brush;
    }

    private static Color Brighten(Color color, double amount)
    {
        byte Channel(byte value) => (byte)Math.Clamp(Math.Round(value + ((255 - value) * amount)), 0, 255);
        return Color.FromArgb(color.A, Channel(color.R), Channel(color.G), Channel(color.B));
    }

    public static Border Card(Control child, Thickness? padding = null)
    {
        return new Border
        {
            Background = Panel2Brush,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(RadiusGroup),
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
            Text = text,
            FontFamily = FontStackMedium,
            FontSize = 14,
            FontWeight = FontWeight.Medium,
            Foreground = TextBrush
        };
    }

    public static Button Button(string text, ButtonTone tone = ButtonTone.Neutral)
    {
        var background = tone switch
        {
            ButtonTone.Primary => ActionMaterialBrush,
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

        var button = new Button
        {
            Content = text,
            Background = background,
            Foreground = foreground,
            BorderBrush = border,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(RadiusMd),
            FontFamily = FontStack,
            FontSize = 13,
            FontWeight = FontWeight.Medium,
            Padding = new Thickness(12, 6),
            MinHeight = 30,
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
        };
        AttachPointerBrightness(button, background, tone == ButtonTone.Primary ? background : HoverBrushFor(background));
        return button;
    }

    public static Button IconButton(string iconName, string tooltip, Action? action = null)
    {
        var button = new Button
        {
            Content = Icons.Create(iconName, IconSizeControl, Text2Brush),
            Background = Panel2Brush,
            Foreground = Text2Brush,
            BorderBrush = LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(RadiusMd),
            Width = 28,
            MinHeight = 28,
            Padding = new Thickness(0),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
        };
        ToolTip.SetTip(button, tooltip);
        AutomationProperties.SetName(button, tooltip);
        if (action is not null)
        {
            button.Click += (_, _) => action();
        }

        AttachPointerBrightness(button, Panel2Brush, Panel2HoverBrush);
        return button;
    }

    public static Button ChromeIconButton(string iconName, string tooltip, Action? action = null)
    {
        var button = new Button
        {
            Content = Icons.Create(iconName, IconSizeControl, Text3Brush),
            Background = Brushes.Transparent,
            Foreground = Text3Brush,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(RadiusMd),
            Width = 28,
            MinHeight = 28,
            Padding = new Thickness(0),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
        };
        ToolTip.SetTip(button, tooltip);
        AutomationProperties.SetName(button, tooltip);
        if (action is not null)
        {
            button.Click += (_, _) => action();
        }

        AttachPointerBrightness(button, Brushes.Transparent, Brushes.Transparent);
        return button;
    }

    public static Button AccentIconButton(string iconName, string tooltip, Action? action = null)
    {
        var background = ActionMaterialBrush;
        var button = new Button
        {
            Content = Icons.Create(iconName, IconSizeControl, Panel2Brush),
            Background = background,
            Foreground = Panel2Brush,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(RadiusMd),
            Width = 30,
            MinHeight = 30,
            Padding = new Thickness(0),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
        };
        ToolTip.SetTip(button, tooltip);
        AutomationProperties.SetName(button, tooltip);
        if (action is not null)
        {
            button.Click += (_, _) => action();
        }

        AttachPointerBrightness(button, background, background);
        return button;
    }

    public static Button NavigationItem(string iconName, string label, bool active, bool collapsed)
    {
        var tint = active ? TextBrush : Text2Brush;
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = collapsed ? 0 : 8,
            VerticalAlignment = VerticalAlignment.Center,
        };
        row.Children.Add(new Border
        {
            Width = 2,
            Height = 18,
            CornerRadius = new CornerRadius(RadiusPill),
            Background = active ? AccentBrush : Brushes.Transparent,
        });
        row.Children.Add(Icons.Create(iconName, IconSizeNavigation, tint));
        if (!collapsed)
        {
            row.Children.Add(new TextBlock
            {
                Text = label,
                FontFamily = FontStackMedium,
                FontSize = 13,
                Foreground = tint,
                VerticalAlignment = VerticalAlignment.Center,
            });
        }

        var button = new Button
        {
            Content = row,
            Background = active ? Panel3Brush : Brushes.Transparent,
            Foreground = tint,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(RadiusSm),
            Padding = new Thickness(collapsed ? 0 : 8, 0),
            MinHeight = 36,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            HorizontalContentAlignment = collapsed ? HorizontalAlignment.Center : HorizontalAlignment.Left,
            VerticalContentAlignment = VerticalAlignment.Center,
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
        };
        ToolTip.SetTip(button, label);
        AutomationProperties.SetName(button, label);
        return button;
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
            Background = Panel2Brush,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(RadiusGroup),
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

    // A Graphite-styled dropdown: flat Panel2 fill, hairline border, tokenized text.
    // Callers attach SelectionChanged. Centralizes the combo chrome the toolbar
    // size/preview selectors and the dash-card duplicate-to-size picker all share.
    public static ComboBox ComboBox(IEnumerable<string> items, string? selected, double minWidth, string? placeholder = null)
    {
        return new ComboBox
        {
            ItemsSource = items.ToArray(),
            SelectedItem = selected,
            PlaceholderText = placeholder,
            Background = Panel2Brush,
            Foreground = TextBrush,
            BorderBrush = Line2Brush,
            MinWidth = minWidth,
            FontFamily = FontStack,
            FontSize = 12,
            VerticalAlignment = VerticalAlignment.Center,
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
            Padding = new Thickness(10, 4),
            // Pills are intrinsically sized; never stretch to fill a form cell.
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
            Child = new TextBlock
            {
                Text = text,
                FontFamily = FontStackMedium,
                FontSize = 11,
                FontWeight = FontWeight.Medium,
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
                Text = text,
                FontFamily = FontStackMedium,
                FontSize = 12,
                FontWeight = FontWeight.Medium,
                Foreground = brush
            }
        };
    }

    // The (icon, soft-fill, border) tint triple for a severity — the shared basis
    // of Indicator/Alert/Toast so a status colour is defined in exactly one place.
    private static (IBrush Icon, IBrush Fill, IBrush Border) IntentTint(GraphiteIntent intent) => intent switch
    {
        GraphiteIntent.Primary => (AccentBrush, AccentBgBrush, AccentBorderBrush),
        GraphiteIntent.Success => (GreenBrush, GreenBgBrush, GreenBorderBrush),
        GraphiteIntent.Danger => (RedBrush, RedBgBrush, RedBorderBrush),
        GraphiteIntent.Info => (BlueBrush, BlueBgBrush, BlueBorderBrush),
        _ => (IconNeutralBrush, Panel2Brush, LineBrush),
    };

    // Figma Indicator: a circular tinted disc with a status-coloured icon (green
    // bolt/check, red exclamation, ember/blue/neutral). Used standalone and as the
    // leading glyph of a Toast.
    public static Control Indicator(GraphiteIntent intent, string icon, double size = 25)
    {
        var (iconBrush, fill, border) = IntentTint(intent);
        return new Border
        {
            Width = size,
            Height = size,
            CornerRadius = new CornerRadius(RadiusPill),
            Background = fill,
            BorderBrush = border,
            BorderThickness = new Thickness(1.5),
            Child = Icons.Create(icon, size * 0.56, iconBrush, 2.2),
        };
    }

    // Figma Alert: a severity-tinted card (soft fill + border) with a leading
    // status icon, bold title, and muted message. Inline/banner surface.
    public static Control Alert(GraphiteIntent intent, string title, string message, string icon)
    {
        var (iconBrush, fill, border) = IntentTint(intent);
        return new Border
        {
            Background = fill,
            BorderBrush = border,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(RadiusLg),
            Padding = new Thickness(14, 12),
            Child = MessageRow(Icons.Create(icon, 22, iconBrush, 2.2), title, message),
        };
    }

    // Figma Toast: a raised neutral card with a circular Indicator, bold title, and
    // muted message. Transient notification surface (stacked bottom-right at runtime).
    // A live toast can carry trailing controls (an action button, a dismiss button);
    // they sit inside the card after the message so the whole notification stays one
    // surface. Static/preview usage passes no trailing content.
    public static Control Toast(
        GraphiteIntent intent,
        string title,
        string message,
        string icon,
        Control? trailing = null,
        Control? lifetimeProgress = null)
    {
        var row = MessageRow(Indicator(intent, icon, 38), title, message);
        Control content = row;
        if (trailing is not null)
        {
            // Message takes the free width, trailing controls pin to the card's right edge.
            trailing.VerticalAlignment = VerticalAlignment.Center;
            trailing.HorizontalAlignment = HorizontalAlignment.Right;
            var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
            Grid.SetColumn(row, 0);
            Grid.SetColumn(trailing, 1);
            grid.Children.Add(row);
            grid.Children.Add(trailing);
            content = grid;
        }

        var body = new Border
        {
            Padding = new Thickness(14, 12),
            Child = content,
        };
        lifetimeProgress ??= ToastLifetimeProgress(intent);
        var layout = new Grid { RowDefinitions = new RowDefinitions("*,Auto") };
        Grid.SetRow(body, 0);
        Grid.SetRow(lifetimeProgress, 1);
        layout.Children.Add(body);
        layout.Children.Add(lifetimeProgress);

        return new Border
        {
            Background = Panel3Brush,
            BorderBrush = LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(RadiusLg),
            ClipToBounds = true,
            MinWidth = 300,
            Child = layout,
        };
    }

    public static Border ToastLifetimeProgress(GraphiteIntent intent)
    {
        var (progressBrush, _, _) = IntentTint(intent);
        var fill = new Border
        {
            Background = progressBrush,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            RenderTransformOrigin = new RelativePoint(0, 0.5, RelativeUnit.Relative),
            RenderTransform = new ScaleTransform(1, 1),
            Tag = "toast-lifetime-progress-fill",
        };
        return new Border
        {
            Height = 3,
            Background = LineBrush,
            ClipToBounds = true,
            IsHitTestVisible = false,
            Child = fill,
            Tag = "toast-lifetime-progress",
        };
    }

    public static void SetToastLifetimeProgress(Border progress, double percent)
    {
        if (progress.Child is not Border { RenderTransform: ScaleTransform scale })
        {
            throw new ArgumentException(
                "The supplied control is not a Graphite toast lifetime indicator.",
                nameof(progress));
        }

        scale.ScaleX = Math.Clamp(percent / 100, 0, 1);
    }

    private static Grid MessageRow(Control leading, string title, string message)
    {
        leading.VerticalAlignment = VerticalAlignment.Center;

        var text = new StackPanel
        {
            Spacing = 1,
            Margin = new Thickness(12, 0, 0, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        text.Children.Add(TextBlock(title, 13, FontWeight.Bold, TextBrush));
        text.Children.Add(TextBlock(message, 11, FontWeight.Normal, Text2Brush, TextWrapping.Wrap));

        // A grid constrains the text to the available column. A horizontal
        // StackPanel measures its children at infinite width, which lets long toast
        // copy run underneath compact trailing action controls.
        var row = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*"),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(leading, 0);
        Grid.SetColumn(text, 1);
        row.Children.Add(leading);
        row.Children.Add(text);
        return row;
    }

    // Figma Tab View: a pill container (radius 999) whose selected item is a raised
    // pill with white text; unselected items are transparent + muted, separated by a
    // hairline divider. Distinct from the squared Segmented control below.
    public static Control TabView(IReadOnlyList<string> items, int selected, Action<int> onSelect)
    {
        var group = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 0, VerticalAlignment = VerticalAlignment.Center };
        for (var i = 0; i < items.Count; i++)
        {
            var isSelected = i == selected;
            // A hairline sits between two adjacent unselected tabs (matches the fig).
            if (i > 0 && !isSelected && (i - 1) != selected)
            {
                group.Children.Add(new Border
                {
                    Width = 1,
                    Height = 16,
                    Background = LineBrush,
                    Margin = new Thickness(2, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                });
            }

            var index = i;
            var button = new Button
            {
                Content = items[i],
                Background = isSelected ? ActionMaterialBrush : Brushes.Transparent,
                Foreground = isSelected ? Panel2Brush : Text2Brush,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                CornerRadius = new CornerRadius(RadiusMd),
                FontFamily = FontStack,
                FontSize = 14,
                FontWeight = isSelected ? FontWeight.Medium : FontWeight.Normal,
                Padding = new Thickness(14, 6),
                MinHeight = 30,
                HorizontalContentAlignment = HorizontalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
            };
            AttachPointerBrightness(button, button.Background, isSelected ? button.Background : Brushes.Transparent);
            button.Click += (_, _) => onSelect(index);
            group.Children.Add(button);
        }

        return new Border
        {
            Background = Panel2Brush,
            BorderBrush = LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(RadiusMd),
            Padding = new Thickness(2),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
            Child = group,
        };
    }

    // Compact desktop segmented control. Selection is neutral so adjacent choices
    // read as one control rather than competing with primary actions.
    public static Control Segmented(
        IReadOnlyList<string> items,
        int selected,
        Action<int> onSelect,
        bool stretch = false)
    {
        var group = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions(string.Join(",", Enumerable.Repeat(stretch ? "*" : "Auto", items.Count))),
            ColumnSpacing = 2,
            HorizontalAlignment = stretch ? HorizontalAlignment.Stretch : HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
        };
        for (var i = 0; i < items.Count; i++)
        {
            var isSelected = i == selected;
            var index = i;
            var button = new Button
            {
                Content = items[i],
                Background = isSelected ? Panel3Brush : Brushes.Transparent,
                Foreground = isSelected ? TextBrush : Text2Brush,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                CornerRadius = new CornerRadius(RadiusMd),
                FontFamily = FontStackMedium,
                FontSize = 13,
                FontWeight = isSelected ? FontWeight.Medium : FontWeight.Normal,
                Padding = new Thickness(14, 4),
                MinHeight = 30,
                HorizontalContentAlignment = HorizontalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
                HorizontalAlignment = stretch ? HorizontalAlignment.Stretch : HorizontalAlignment.Left,
            };
            AttachPointerBrightness(button, button.Background, isSelected ? button.Background : Panel2HoverBrush);
            button.Click += (_, _) => onSelect(index);
            Grid.SetColumn(button, i);
            group.Children.Add(button);
        }

        return new Border
        {
            Background = Panel2Brush,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(RadiusMd),
            Padding = new Thickness(2),
            HorizontalAlignment = stretch ? HorizontalAlignment.Stretch : HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
            Child = group,
        };
    }

    private static IBrush HoverBrushFor(IBrush background)
    {
        if (Equals(background, Panel3Brush))
        {
            return Panel3HoverBrush;
        }

        return Panel2HoverBrush;
    }

    private static void AttachPointerBrightness(Button button, IBrush normal, IBrush hover)
    {
        // Avalonia's Fluent button template resolves these dynamic resources while
        // pointer-over/pressed. Per-control values prevent the global neutral hover
        // brush from replacing an orange primary button with gray.
        button.Resources["ButtonBackgroundPointerOver"] = hover;
        button.Resources["ButtonBackgroundPressed"] = hover;
        button.Resources["ButtonBorderBrushPointerOver"] = button.BorderBrush;
        button.Resources["ButtonBorderBrushPressed"] = button.BorderBrush;
        button.Resources["ButtonForegroundPointerOver"] = button.Foreground;
        button.Resources["ButtonForegroundPressed"] = button.Foreground;
        button.Resources[PointerOverBackgroundResourceKey] = hover;
        button.PointerEntered += (_, _) => button.Background = hover;
        button.PointerPressed += (_, e) =>
        {
            if (e.GetCurrentPoint(button).Properties.IsLeftButtonPressed)
            {
                button.Opacity = 0.86;
            }
        };
        button.PointerReleased += (_, _) => button.Opacity = 1;
        button.PointerExited += (_, _) =>
        {
            button.Background = normal;
            button.Opacity = 1;
        };
    }
}
