using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Media;
using Avalonia.Styling;

namespace Sprint.Desktop;

internal static class SprintThemeResourceKeys
{
    public const string ButtonTheme = "Sprint.Component.Button.Theme";
    public const string ButtonMinHeight = "Sprint.Component.Button.MinHeight";
    public const string ButtonPadding = "Sprint.Component.Button.Padding";
}

/// <summary>
/// App-wide Graphite control theming. Rather than a full ControlTheme per widget,
/// this overrides the Fluent resource brushes/metrics that the stock templates bind
/// to (via DynamicResource), so every TextBox/ComboBox/Button picks up the Figma
/// surfaces, ember focus, and 8px control radius at once. A base font style pins
/// Inter on all templated controls so inputs stop falling back to the OS face.
/// </summary>
internal sealed class SprintComponentTheme : Styles
{
    public SprintComponentTheme()
    {
        Resources[SprintThemeResourceKeys.ButtonTheme] = new ControlTheme(typeof(Button));
        Resources[SprintThemeResourceKeys.ButtonMinHeight] = 25d;
        Resources[SprintThemeResourceKeys.ButtonPadding] = new Thickness(14, 6);

        // Figma control radius (buttons/inputs/combos = 8; cards/panels set their own).
        Resources["ControlCornerRadius"] = new CornerRadius(Graphite.RadiusMd);

        // Button surfaces. Pointer-over is the same component state brightened by
        // 10%, not a distinct fill/border treatment.
        Set("ButtonBackground", Graphite.Panel2Brush);
        Set("ButtonBackgroundPointerOver", Graphite.Panel2HoverBrush);
        Set("ButtonBorderBrush", Graphite.LineBrush);
        Set("ButtonBorderBrushPointerOver", Graphite.LineBrush);

        // TextBox (input) surfaces + interaction states — see docs/FIGMA_COMPONENTS.md.
        Set("TextControlBackground", Graphite.Panel2Brush);
        Set("TextControlBackgroundPointerOver", Graphite.Panel2HoverBrush);
        Set("TextControlBackgroundFocused", Graphite.PanelBrush);
        Set("TextControlBackgroundDisabled", Graphite.PanelBrush);
        Set("TextControlBorderBrush", Graphite.Line2Brush);
        Set("TextControlBorderBrushPointerOver", Graphite.Line2Brush);
        Set("TextControlBorderBrushFocused", Graphite.AccentBrush);
        Set("TextControlBorderBrushDisabled", Graphite.LineBrush);
        Set("TextControlForeground", Graphite.TextBrush);
        Set("TextControlForegroundPointerOver", Graphite.TextBrush);
        Set("TextControlForegroundFocused", Graphite.TextBrush);
        Set("TextControlForegroundDisabled", Graphite.Text3Brush);
        Set("TextControlPlaceholderForeground", Graphite.Text3Brush);
        Set("TextControlPlaceholderForegroundFocused", Graphite.Text3Brush);

        // ComboBox surfaces.
        Set("ComboBoxBackground", Graphite.Panel2Brush);
        Set("ComboBoxBackgroundPointerOver", Graphite.Panel2HoverBrush);
        Set("ComboBoxBackgroundFocused", Graphite.PanelBrush);
        Set("ComboBoxBackgroundDisabled", Graphite.PanelBrush);
        Set("ComboBoxBorderBrush", Graphite.LineBrush);
        Set("ComboBoxBorderBrushPointerOver", Graphite.Line2Brush);
        Set("ComboBoxBorderBrushFocused", Graphite.AccentBrush);
        Set("ComboBoxForeground", Graphite.TextBrush);
        Set("ComboBoxDropDownBackground", Graphite.Panel2Brush);
        Set("ComboBoxDropDownBorderBrush", Graphite.LineBrush);

        // Base font: Inter on every templated control unless a helper overrides it.
        var baseFont = new Style(x => x.Is<TemplatedControl>());
        baseFont.Setters.Add(new Setter(TemplatedControl.FontFamilyProperty, new FontFamily(Graphite.FontStack)));
        baseFont.Setters.Add(new Setter(TemplatedControl.FontSizeProperty, 13d));
        Add(baseFont);
    }

    private void Set(string key, IBrush brush) => Resources[key] = brush;
}
