using Avalonia;
using Avalonia.Controls;
using Avalonia.Styling;

namespace Sprint.Desktop;

internal static class SprintThemeResourceKeys
{
    public const string ButtonTheme = "Sprint.Component.Button.Theme";
    public const string ButtonMinHeight = "Sprint.Component.Button.MinHeight";
    public const string ButtonPadding = "Sprint.Component.Button.Padding";
}

internal sealed class SprintComponentTheme : Styles
{
    public SprintComponentTheme()
    {
        Resources[SprintThemeResourceKeys.ButtonTheme] = new ControlTheme(typeof(Button));
        Resources[SprintThemeResourceKeys.ButtonMinHeight] = 25d;
        Resources[SprintThemeResourceKeys.ButtonPadding] = new Thickness(14, 6);
    }
}
