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
}
