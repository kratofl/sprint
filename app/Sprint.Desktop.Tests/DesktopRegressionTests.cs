using Avalonia.Controls;
using Sprint.Desktop;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Shell;
using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Behavior regression tests at the highest practical seams (PRD #107 testing
/// decisions): window-chrome drag policy, shell navigation/state, the
/// Games→Api telemetry mapping, and runtime preset-load + device persistence.
/// All pure/headless — no Avalonia application bootstrap required.
/// </summary>
public class DesktopRegressionTests
{
    [Fact]
    public void WindowChromeDragIgnoresButtonClicks()
    {
        Assert.False(WindowDragPolicy.ShouldBeginDrag(new Button()), "Button clicks must not start a window drag.");
        Assert.False(WindowDragPolicy.ShouldBeginDrag(new TextBox()), "Text input clicks must not start a window drag.");
        Assert.False(WindowDragPolicy.ShouldBeginDrag(new ComboBox()), "Select clicks must not start a window drag.");
        Assert.True(WindowDragPolicy.ShouldBeginDrag(new Border()), "Plain titlebar surface should still start a window drag.");
    }

    [Fact]
    public void ShellStateOwnsNavigationAndSidebarWidth()
    {
        var shell = new ShellState();
        Assert.Equal(AppView.Live, shell.View);
        Assert.Equal(220, shell.SidebarWidth);

        shell.ToggleSidebar();
        Assert.True(shell.SidebarCollapsed, "Sidebar should collapse after toggle.");
        Assert.Equal(62, shell.SidebarWidth);

        shell.Navigate(AppView.Devices);
        Assert.Equal(AppView.Devices, shell.View);
        Assert.Equal("Devices", shell.CurrentTitle);
    }

    [Fact]
    public void GamesPackageEmitsSharedTelemetryFormat()
    {
        using var source = GameTelemetryPackage.CreateDemoSource();
        var first = LiveTelemetryPresenter.ToSnapshot(source.Current);

        source.Connect();
        Assert.True(source.TryRead(out var frame), "A connected demo source should yield a fresh frame.");
        var second = LiveTelemetryPresenter.ToSnapshot(frame);

        Assert.True(second.SpeedKph != first.SpeedKph, "Telemetry simulator should advance speed.");
        Assert.True(second.Rpm > 0, "Telemetry simulator should produce RPM.");
        Assert.True(second.Gear is >= 1 and <= 6, "Telemetry simulator should clamp gear.");
    }

    [Fact]
    public void CompositionRootUsesRealTelemetrySourceByDefault()
    {
        using var source = CompositionRoot.CreateTelemetrySource();

        Assert.Equal("Le Mans Ultimate", source.Name);
        Assert.NotEqual("Sprint Demo", source.Name);
    }

    [Fact]
    public void DesktopRuntimePersistsDevices()
    {
        var presetRoot = TestEnv.PresetRoot;
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, presetRoot);
            Assert.True(runtime.Catalog.Count > 0, "Device catalog should load from presets.");
            Assert.True(runtime.DashLayouts.Count > 0, "Dash layouts should load from presets.");

            var saved = runtime.AddDevice(runtime.Catalog[0]);
            Assert.Single(runtime.Devices);
            Assert.True(saved.Width > 0 && saved.Height > 0, "Saved device should get concrete display dimensions.");

            var reloaded = new DesktopRuntime(dataRoot, presetRoot);
            Assert.Single(reloaded.Devices);
            Assert.Equal(saved.Id, reloaded.Devices[0].Id);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}
