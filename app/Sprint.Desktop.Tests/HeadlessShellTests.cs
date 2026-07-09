using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Shell;
using Xunit;

// Points the Avalonia headless session at a headless AppBuilder. We drive the
// session manually (below) rather than via the Avalonia.Headless.XUnit [AvaloniaFact]
// attribute, because that integration package targets xunit v3 and collides with
// this project's xunit v2.
[assembly: AvaloniaTestApplication(typeof(Sprint.Desktop.Tests.HeadlessTestApp))]

namespace Sprint.Desktop.Tests;

internal static class HeadlessTestApp
{
    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UseSkia()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions
            {
                UseHeadlessDrawing = false
            });
}

/// <summary>
/// WS2 headless harness: exercises real Avalonia view construction without a
/// display. Proves the shell window builds, shows, and tears down cleanly under a
/// real Avalonia context — covering the WS3 Connect-on-load → status-presenter →
/// Live-page render path and Dispose-on-close, which pure tests cannot reach. A
/// recording source pins the lifecycle calls the window is supposed to make.
/// </summary>
public class HeadlessShellTests
{
    [Fact]
    public async Task ShellWindowConnectsOnLoadAndDisposesSourceOnClose()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        var telemetry = new RecordingTelemetrySource();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

                // Constructing the window runs Connect-on-load, the status presenter,
                // and a full Live-page render against a real visual tree.
                var window = new MainWindow(runtime, shell: new ShellState(), telemetrySource: telemetry);
                window.Show();

                Assert.Equal("Sprint", window.Title);
                Assert.NotNull(window.Content);
                Assert.True(telemetry.ConnectCount >= 1, "MainWindow should connect the telemetry source on load.");

                // Closing must stop the timer and dispose the telemetry source.
                window.Close();

                Assert.True(telemetry.IsDisposed, "Closing the window must dispose the telemetry source.");
                Assert.Equal(TelemetryConnectionState.Disconnected, telemetry.Status.State);
                Assert.Throws<ObjectDisposedException>(() => telemetry.TryRead(out _));
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task ShellRendersSingleTitlebarWithWindowControlsOnEveryPage()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, new ShellState(), telemetry);
                window.Show();

                // The shell is one column of two rows: a single Sprint-owned titlebar
                // above the sidebar + body (PRD #122). The window frame stays an opaque
                // rounded Border so the OS renders clean rounded corners, not black ones.
                var frame = Assert.IsType<Border>(window.Content);
                Assert.Equal(new CornerRadius(Graphite.RadiusXl), frame.CornerRadius);
                var root = Assert.IsType<Grid>(frame.Child);
                Assert.Equal(2, root.RowDefinitions.Count);
                Assert.Single(root.ColumnDefinitions);

                // The window controls live in that one shared titlebar, so they must be
                // present on every production page — not only the Dash Editor. Walk each
                // page and assert min / maximize / close survive the navigation.
                foreach (var view in new[] { AppView.Home, AppView.Dashes, AppView.Devices, AppView.Setups, AppView.RaceEngineer, AppView.Settings, AppView.Help })
                {
                    var nav = FindOptionalButton(window, NavLabel(view));
                    if (nav is not null)
                    {
                        nav.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                        window.CaptureRenderedFrame();
                    }

                    foreach (var tooltip in new[] { "Minimize", "Maximize / restore", "Close" })
                    {
                        Assert.Single(
                            window.GetVisualDescendants().OfType<Button>(),
                            b => string.Equals(ToolTip.GetTip(b) as string, tooltip, StringComparison.Ordinal));
                    }
                }

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static string NavLabel(AppView view) => view switch
    {
        AppView.Home => "Home",
        AppView.Dashes => "Dashes",
        AppView.Devices => "Devices",
        AppView.Setups => "Setups",
        AppView.RaceEngineer => "Race Engineer",
        AppView.Settings => "Settings",
        AppView.Help => "Help",
        _ => view.ToString()
    };

    [Fact]
    public async Task WindowActionButtonsUseBorderlessScreenshotTreatment()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                FindButton(window, "Edit").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                foreach (var tooltip in new[] { "Minimize", "Maximize / restore", "Close" })
                {
                    var button = window.GetVisualDescendants()
                        .OfType<Button>()
                        .Single(candidate => string.Equals(ToolTip.GetTip(candidate) as string, tooltip, StringComparison.Ordinal));
                    Assert.Equal(new Thickness(0), button.BorderThickness);
                    Assert.Equal(Brushes.Transparent, button.Background);
                }

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task ProductionSidebarContainsOnlyScreenshotNavigation()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                Assert.NotNull(FindOptionalButton(window, "Home"));
                Assert.NotNull(FindOptionalButton(window, "Dashes"));
                Assert.NotNull(FindOptionalButton(window, "Devices"));
                Assert.NotNull(FindOptionalButton(window, "Setups"));
                Assert.NotNull(FindOptionalButton(window, "Race Engineer"));
                Assert.NotNull(FindOptionalButton(window, "Settings"));
                Assert.NotNull(FindOptionalButton(window, "Help"));
                Assert.Null(FindOptionalButton(window, "Live"));
                Assert.Null(FindOptionalButton(window, "Engineer"));
                Assert.Null(FindOptionalButton(window, "Setup"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task AltSevenDoesNotNavigateToDebugLive()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.RaiseEvent(new KeyEventArgs
                {
                    RoutedEvent = InputElement.KeyDownEvent,
                    Source = window,
                    Key = Key.D7,
                    KeyModifiers = KeyModifiers.Alt
                });
                window.CaptureRenderedFrame();

                Assert.Equal(AppView.Dashes, shell.View);
                Assert.Null(FindOptionalText(window, "Live Debug"));
                Assert.Null(FindOptionalText(window, "Live"));
                Assert.NotNull(FindOptionalButton(window, "Create dash"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task HomePageShowsRuntimeOverviewFromCurrentState()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                runtime.AddDevice(runtime.Catalog[0]);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, new ShellState(), telemetry);
                window.Show();

                window.CaptureRenderedFrame();

                Assert.NotNull(FindOptionalText(window, "TELEMETRY"));
                Assert.NotNull(FindOptionalText(window, "DEVICES"));
                Assert.NotNull(FindOptionalText(window, "DASH ASSIGNMENTS"));
                Assert.NotNull(FindOptionalText(window, runtime.Devices[0].Name));
                Assert.NotNull(FindOptionalText(window, runtime.DashLayouts[0].Name.ToUpperInvariant()));
                Assert.Null(FindOptionalText(window, "Dash Editor Ready"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task SetupsPageShowsReadOnlyTemplatesAndDuplicatesBeforeEditing()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Setups);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalText(window, "SETUP TEMPLATES"));
                Assert.NotNull(FindOptionalText(window, "USER SETUPS"));
                Assert.NotNull(FindOptionalButton(window, "Duplicate template"));
                Assert.Null(FindOptionalButton(window, "Delete"));

                FindButton(window, "Duplicate template").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                Assert.Single(runtime.SetupPrograms);
                Assert.NotNull(FindOptionalButton(window, "Delete"));
                Assert.NotNull(FindOptionalButton(window, runtime.SetupPrograms[0].Name));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task SetupsComparePickerUsesSetupIdentityInsteadOfDisplayNames()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var baseline = runtime.SetupTemplates.Single(program => program.Id == "setup-baseline");
                var firstCopy = runtime.DuplicateSetup(baseline);
                var secondCopy = runtime.DuplicateSetup(baseline);
                firstCopy.Name = "Duplicate display name";
                secondCopy.Name = "Duplicate display name";
                runtime.SaveSetupPrograms();

                var shell = new ShellState();
                shell.Navigate(AppView.Setups);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                var combo = window.GetVisualDescendants().OfType<ComboBox>().Single();
                var items = combo.ItemsSource?.Cast<object>().ToArray() ?? [];

                Assert.NotEmpty(items);
                Assert.All(items, item => Assert.IsType<SetupProgram>(item));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task SidebarNavigationItemsUseFigmaSelectedTreatment()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                var active = FindButton(window, "Dashes");
                Assert.Equal(Graphite.Panel3Brush, active.Background);
                Assert.Equal(Graphite.AccentBrush, active.Foreground);
                Assert.Equal(new CornerRadius(Graphite.RadiusSm), active.CornerRadius);
                Assert.Equal(25, active.MinHeight);
                Assert.Equal(new Thickness(0), active.BorderThickness);

                var inactive = FindButton(window, "Devices");
                Assert.Equal(Brushes.Transparent, inactive.Background);
                Assert.Equal(Graphite.Text2Brush, inactive.Foreground);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DashesNavigationShowsSavedDashListBeforeOpeningEditor()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                Assert.DoesNotContain(window.GetVisualDescendants().OfType<DashEditorView>(), _ => true);
                Assert.NotNull(FindOptionalButton(window, "Create dash"));
                Assert.NotNull(FindOptionalButton(window, "Edit"));

                FindButton(window, "Edit").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                Assert.Contains(window.GetVisualDescendants().OfType<DashEditorView>(), _ => true);

                FindButton(window, "Toggle sidebar").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DashEditorProductionToolbarDoesNotExposeLegacyPageActions()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                FindButton(window, "Edit").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                Assert.Null(FindOptionalButton(window, "Add page"));
                Assert.Null(FindOptionalButton(window, "Clear page"));
                Assert.Null(FindOptionalButton(window, "Delete page"));
                Assert.Null(FindOptionalButton(window, "Save"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DashEditorProductionTabsCanSwitchWithoutReparentingChromeActions()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                FindButton(window, "Edit").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                FindEditorButton(window, "Alerts").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                FindEditorButton(window, "Settings").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                FindEditorButton(window, "Layout").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DevicesPageKeepsCatalogBehindAddDeviceActionAndShowsPerDeviceBindings()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Devices);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalButton(window, "Add device"));
                Assert.Null(FindOptionalButton(window, "BavarianSimTec Omega PRO V2"));
                Assert.DoesNotContain(window.GetVisualDescendants().OfType<TextBox>(),
                    box => string.Equals(box.Text, "BavarianSimTec Omega PRO V2", StringComparison.Ordinal));

                FindButton(window, "Add device").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalButton(window, "BavarianSimTec Omega PRO V2"));

                FindButton(window, "BavarianSimTec Omega PRO V2").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                Assert.Contains(window.GetVisualDescendants().OfType<TextBox>(),
                    box => string.Equals(box.Text, "BavarianSimTec Omega PRO V2", StringComparison.Ordinal));
                Assert.NotNull(FindOptionalText(window, "DEVICE BINDINGS"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DevicesPageShowsSavedDevicesAsThumbnailGridAndDrillsIntoDeviceView()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                runtime.AddDevice(runtime.Catalog[0]);
                runtime.AddDevice(runtime.Catalog[1]);
                runtime.AddDevice(runtime.Catalog[2]);
                var shell = new ShellState();
                shell.Navigate(AppView.Devices);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalButton(window, "Add device"));
                Assert.Null(FindOptionalText(window, "DEVICE BINDINGS"));
                Assert.True(window.GetVisualDescendants().OfType<Border>().Count(border => border.Tag?.ToString()?.StartsWith("device-card:", StringComparison.Ordinal) == true) >= 3);
                Assert.True(window.GetVisualDescendants().OfType<Border>().Count(border => border.Tag?.ToString()?.StartsWith("device-thumb:", StringComparison.Ordinal) == true) >= 3);

                FindButton(window, runtime.Devices[0].Name).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalButton(window, "Back to devices"));
                Assert.Null(FindOptionalButton(window, "Add device"));
                Assert.NotNull(FindOptionalText(window, "DEVICE BINDINGS"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DevicesRemovingCaptureTargetCancelsCaptureWithoutGlobalBinding()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                runtime.AddDevice(runtime.Catalog[0]);
                var shell = new ShellState();
                shell.Navigate(AppView.Devices);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                FindButton(window, runtime.Devices[0].Name).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                FindButton(window, "Listen").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalText(window, "Press a key... (Esc to cancel)"));

                FindButton(window, "Remove").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                Assert.Empty(runtime.Devices);
                Assert.Null(FindOptionalText(window, "Press a key... (Esc to cancel)"));

                RaiseKeyDown(window, Key.A);
                window.CaptureRenderedFrame();
                Assert.Empty(runtime.Controls.Bindings);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DevicesCaptureForMissingSavedDeviceDoesNotCreateGlobalBinding()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                runtime.AddDevice(runtime.Catalog[0]);
                var shell = new ShellState();
                shell.Navigate(AppView.Devices);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                FindButton(window, runtime.Devices[0].Name).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                FindButton(window, "Listen").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalText(window, "Press a key... (Esc to cancel)"));

                runtime.Devices.Clear();
                RaiseKeyDown(window, Key.B);
                window.CaptureRenderedFrame();
                Assert.Empty(runtime.Controls.Bindings);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DevicesNameEditorCommitsRepeatedEnterEdits()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                runtime.AddDevice(runtime.Catalog[0]);
                var shell = new ShellState();
                shell.Navigate(AppView.Devices);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                FindButton(window, runtime.Devices[0].Name).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                var nameBox = window.GetVisualDescendants()
                    .OfType<TextBox>()
                    .Single(box => string.Equals(box.Text, runtime.Devices[0].Name, StringComparison.Ordinal));

                nameBox.Text = "First rename";
                RaiseKeyDown(nameBox, Key.Enter);
                Assert.Equal("First rename", runtime.Devices[0].Name);

                nameBox.Text = "Second rename";
                RaiseKeyDown(nameBox, Key.Enter);
                Assert.Equal("Second rename", runtime.Devices[0].Name);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task SettingsPageOwnsGlobalDefaultsOnly()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Settings);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalText(window, "PROFILE"));
                Assert.NotNull(FindOptionalText(window, "DASH DEFAULTS"));
                Assert.Null(FindOptionalText(window, "DEVICE BINDINGS"));
                Assert.Null(FindOptionalText(window, "SETUP TEMPLATES"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task HelpPageShowsCompactReferenceAndRuntimeSupport()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Help);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                window.CaptureRenderedFrame();
                Assert.NotNull(FindOptionalText(window, "REFERENCE"));
                Assert.NotNull(FindOptionalText(window, "Telemetry"));
                Assert.Null(FindOptionalText(window, "Welcome to Sprint"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static Button FindButton(MainWindow window, string content)
    {
        return window.GetVisualDescendants()
            .OfType<Button>()
            .First(button => ButtonMatches(button, content));
    }

    private static Button? FindOptionalButton(MainWindow window, string content)
    {
        return window.GetVisualDescendants()
            .OfType<Button>()
            .FirstOrDefault(button => ButtonMatches(button, content));
    }

    private static TextBlock? FindOptionalText(MainWindow window, string content)
    {
        return window.GetVisualDescendants()
            .OfType<TextBlock>()
            .FirstOrDefault(text => string.Equals(text.Text, content, StringComparison.Ordinal));
    }

    private static void RaiseKeyDown(IInputElement target, Key key)
    {
        target.RaiseEvent(new KeyEventArgs
        {
            RoutedEvent = InputElement.KeyDownEvent,
            Source = target,
            Key = key
        });
    }

    private static Button FindEditorButton(MainWindow window, string content)
    {
        var editor = window.GetVisualDescendants().OfType<DashEditorView>().Single();
        return editor.GetVisualDescendants()
            .OfType<Button>()
            .First(button => ButtonMatches(button, content));
    }

    // Buttons may be labelled by a string Content, an icon with a ToolTip, or an
    // icon+label StackPanel (nav items). Match any of those so behaviour tests stay
    // stable across the Figma icon/lockup restyle.
    private static bool ButtonMatches(Button button, string content)
    {
        if (string.Equals(button.Content?.ToString(), content, StringComparison.Ordinal))
        {
            return true;
        }

        if (ToolTip.GetTip(button)?.ToString() is { } tip && string.Equals(tip, content, StringComparison.Ordinal))
        {
            return true;
        }

        return button.GetVisualDescendants()
            .OfType<TextBlock>()
            .Any(text => string.Equals(text.Text, content, StringComparison.Ordinal));
    }

    // Finds a button inside the card whose title matches cardTitle, by walking up
    // from the unique title TextBlock to the nearest ancestor that owns the button.
    private static Button FindCardButton(MainWindow window, string cardTitle, string content)
    {
        var title = window.GetVisualDescendants()
            .OfType<TextBlock>()
            .First(text => string.Equals(text.Text, cardTitle, StringComparison.Ordinal));

        for (Visual? node = title; node is not null; node = node.GetVisualParent())
        {
            var button = node.GetVisualDescendants()
                .OfType<Button>()
                .FirstOrDefault(candidate => string.Equals(candidate.Content?.ToString(), content, StringComparison.Ordinal));
            if (button is not null)
            {
                return button;
            }
        }

        throw new InvalidOperationException($"No '{content}' button found in card '{cardTitle}'.");
    }
}

/// <summary>A minimal healthy-link <see cref="ITelemetrySource"/> that records the lifecycle calls made against it, used to pin the shell's Connect-on-load / Dispose-on-close behaviour.</summary>
internal sealed class RecordingTelemetrySource : ITelemetrySource
{
    private bool _connected;
    private bool _disposed;
    private TelemetryStatus _status = TelemetryStatus.Disconnected("Recording Fake");

    public int ConnectCount { get; private set; }

    public bool IsDisposed => _disposed;

    public string Name => "Recording Fake";

    public TelemetryStatus Status => _status;

    public TelemetryFrame Current { get; } = new();

    public void Connect()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _connected = true;
        ConnectCount++;
        _status = _status with { State = TelemetryConnectionState.Connected, SourceName = Name };
    }

    public void Disconnect()
    {
        if (_disposed)
        {
            return;
        }

        _connected = false;
        _status = TelemetryStatus.Disconnected(Name);
    }

    public bool TryRead(out TelemetryFrame frame)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        frame = Current;
        if (!_connected)
        {
            return false;
        }

        _status = _status with { State = TelemetryConnectionState.Connected, LastFrameAt = DateTimeOffset.UtcNow, LastFrameValid = true };
        return true;
    }

    public void Dispose()
    {
        _disposed = true;
        _connected = false;
        _status = TelemetryStatus.Disconnected(Name);
    }
}
