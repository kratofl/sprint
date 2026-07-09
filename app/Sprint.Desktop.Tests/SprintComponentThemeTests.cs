using Avalonia.Themes.Fluent;
using Sprint.Desktop;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class SprintComponentThemeTests
{
    [Fact]
    public void App_loads_sprint_component_theme_after_base_fluent_theme()
    {
        var app = new App();

        app.Initialize();

        Assert.IsType<FluentTheme>(app.Styles[0]);
        Assert.Contains(app.Styles, style => style.GetType().Name == "SprintComponentTheme");
    }

    [Fact]
    public void Component_theme_keeps_pointer_over_surfaces_as_brightened_base_not_new_state_colours()
    {
        var theme = new SprintComponentTheme();

        Assert.Equal(Graphite.Panel2HoverBrush, theme.Resources["ButtonBackgroundPointerOver"]);
        Assert.Equal(Graphite.Panel2HoverBrush, theme.Resources["TextControlBackgroundPointerOver"]);
        Assert.Equal(Graphite.LineBrush, theme.Resources["ButtonBorderBrushPointerOver"]);
        // Text-input borders rest on the stronger Line2 token and hold it on hover
        // (brightened base, not a new state colour); only focus escalates to accent.
        Assert.Equal(Graphite.Line2Brush, theme.Resources["TextControlBorderBrushPointerOver"]);
        Assert.Equal(Graphite.AccentBrush, theme.Resources["TextControlBorderBrushFocused"]);
    }

    [Fact]
    public void Component_theme_keeps_controls_on_graphite_surfaces()
    {
        var theme = new SprintComponentTheme();

        Assert.Equal(Graphite.Panel2Brush, theme.Resources["TextControlBackground"]);
        Assert.Equal(Graphite.Line2Brush, theme.Resources["TextControlBorderBrush"]);
        Assert.Equal(Graphite.TextBrush, theme.Resources["TextControlForeground"]);
        Assert.Equal(Graphite.AccentBrush, theme.Resources["TextControlBorderBrushFocused"]);
    }
}
