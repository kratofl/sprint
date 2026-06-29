using Avalonia.Controls;
using Sprint.Desktop;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Shell;
using Sprint.Games;

var tests = new (string Name, Action Run)[]
{
    ("Window chrome drag ignores button clicks", WindowChromeDragIgnoresButtonClicks),
    ("Shell state owns navigation and sidebar width", ShellStateOwnsNavigationAndSidebarWidth),
    ("Games package emits shared telemetry format for Live slice", GamesPackageEmitsSharedTelemetryFormat),
    ("Desktop runtime loads presets and persists devices outside AppData", DesktopRuntimePersistsDevices)
};

var failures = new List<string>();
foreach (var test in tests)
{
    try
    {
        test.Run();
        Console.WriteLine($"PASS {test.Name}");
    }
    catch (Exception ex)
    {
        failures.Add($"{test.Name}: {ex.Message}");
        Console.Error.WriteLine($"FAIL {test.Name}");
        Console.Error.WriteLine(ex);
    }
}

if (failures.Count > 0)
{
    Console.Error.WriteLine();
    Console.Error.WriteLine("Failures:");
    foreach (var failure in failures)
    {
        Console.Error.WriteLine($"- {failure}");
    }

    return 1;
}

return 0;

static void WindowChromeDragIgnoresButtonClicks()
{
    Assert.False(WindowDragPolicy.ShouldBeginDrag(new Button()), "Button clicks must not start a window drag.");
    Assert.False(WindowDragPolicy.ShouldBeginDrag(new TextBox()), "Text input clicks must not start a window drag.");
    Assert.False(WindowDragPolicy.ShouldBeginDrag(new ComboBox()), "Select clicks must not start a window drag.");
    Assert.True(WindowDragPolicy.ShouldBeginDrag(new Border()), "Plain titlebar surface should still start a window drag.");
}

static void DesktopRuntimePersistsDevices()
{
    var repoRoot = FindRepoRoot();
    var presetRoot = Path.Combine(repoRoot, "app", "Sprint.Desktop.Client", "presets");
    var dataRoot = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Tests", Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(dataRoot);

    try
    {
        var runtime = new DesktopRuntime(dataRoot, presetRoot);
        Assert.True(runtime.Catalog.Count > 0, "Device catalog should load from presets.");
        Assert.True(runtime.DashLayouts.Count > 0, "Dash layouts should load from presets.");

        var saved = runtime.AddDevice(runtime.Catalog[0]);
        Assert.True(runtime.Devices.Count == 1, "Adding a catalog device should add one saved device.");
        Assert.True(saved.Width > 0 && saved.Height > 0, "Saved device should get concrete display dimensions.");

        var reloaded = new DesktopRuntime(dataRoot, presetRoot);
        Assert.True(reloaded.Devices.Count == 1, "Saved devices should persist across runtime instances.");
        Assert.Equal(saved.Id, reloaded.Devices[0].Id, "Reloaded device should keep the saved ID.");
    }
    finally
    {
        Directory.Delete(dataRoot, recursive: true);
    }
}

static void ShellStateOwnsNavigationAndSidebarWidth()
{
    var shell = new ShellState();
    Assert.Equal(AppView.Live, shell.View, "Shell should start on Live.");
    Assert.Equal(208, shell.SidebarWidth, "Expanded sidebar should use the Graphite width.");

    shell.ToggleSidebar();
    Assert.True(shell.SidebarCollapsed, "Sidebar should collapse after toggle.");
    Assert.Equal(62, shell.SidebarWidth, "Collapsed sidebar should use icon-rail width.");

    shell.Navigate(AppView.Devices);
    Assert.Equal(AppView.Devices, shell.View, "Shell navigation should update current view.");
    Assert.Equal("Devices", shell.CurrentTitle, "Shell title should match current view.");
}

static void GamesPackageEmitsSharedTelemetryFormat()
{
    var source = GameTelemetryPackage.CreateDemoSource();
    var first = LiveTelemetryPresenter.ToSnapshot(source.Current);
    var second = LiveTelemetryPresenter.ToSnapshot(source.Advance());

    Assert.True(second.SpeedKph != first.SpeedKph, "Telemetry simulator should advance speed.");
    Assert.True(second.Rpm > 0, "Telemetry simulator should produce RPM.");
    Assert.True(second.Gear is >= 1 and <= 6, "Telemetry simulator should clamp gear.");
}

static string FindRepoRoot()
{
    for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
    {
        if (Directory.Exists(Path.Combine(dir.FullName, "app", "Sprint.Desktop.Client", "presets")))
        {
            return dir.FullName;
        }
    }

    throw new DirectoryNotFoundException("Could not find repository root containing app/Sprint.Desktop.Client/presets.");
}

internal static class Assert
{
    public static void True(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }

    public static void False(bool condition, string message)
    {
        True(!condition, message);
    }

    public static void Equal<T>(T expected, T actual, string message)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new InvalidOperationException($"{message} Expected {expected}, got {actual}.");
        }
    }
}
