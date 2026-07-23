#if DEBUG
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Development;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Shell;
using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DiagnosticsWindowTests
{
    [Fact]
    public async Task SettingsOpensOneOwnedDiagnosticsWindowAndLogsTheAction()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DiagnosticsWindowTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            await session.Dispatch(() =>
            {
                var log = new LiveLogStore();
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot, log: log);
                var shell = new ShellState();
                shell.Navigate(AppView.Settings);
                using var telemetry = new RecordingTelemetrySource();
                var main = new MainWindow(runtime, shell, telemetry, log, log);
                main.Show();

                var open = main.GetVisualDescendants().OfType<Button>()
                    .Single(button => string.Equals(button.Content?.ToString(), "Open development tools", StringComparison.Ordinal));
                open.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

                var diagnostics = Assert.IsType<DiagnosticsWindow>(main.ActiveDiagnosticsWindow);
                Assert.True(diagnostics.IsVisible);
                Assert.Equal("Sprint Development Tools", diagnostics.Title);
                Assert.Contains(log.Entries, entry =>
                    entry.Message.Contains("Development tools window opened", StringComparison.Ordinal));

                open.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                Assert.Same(diagnostics, main.ActiveDiagnosticsWindow);

                main.Close();
                Assert.False(diagnostics.IsVisible);
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task WindowTestsScreensWithoutTelemetryAndFiltersTheLiveLog()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DiagnosticsWindowTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            await session.Dispatch(() =>
            {
                var log = new LiveLogStore();
                var simulation = new DevelopmentGameState(log);
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot, log: log);
                runtime.Devices.Add(new SavedDevice
                {
                    Id = "debug-screen",
                    Name = "Debug Screen",
                    Type = "screen",
                    Driver = "vocore",
                    Vid = 0x1234,
                    Pid = 0x5678,
                    Width = 480,
                    Height = 480,
                    DashId = runtime.DashLayouts.First().Id,
                });

                using var screens = new DeviceScreenService(
                    runtime,
                    () => new TelemetryFrame(),
                    _ => new FakeScreenDriver(),
                    log);
                screens.Sync();
                log.Info("dashboard frame rendered");
                log.Warn("USB screen is busy");

                var window = new DiagnosticsWindow(runtime, screens, simulation, log, log)
                {
                    Width = 1180,
                    Height = 760,
                };

                window.Show();
                window.CaptureRenderedFrame();

                Assert.Contains(window.GetVisualDescendants().OfType<TextBlock>(),
                    text => string.Equals(text.Text, "Game state simulation", StringComparison.Ordinal));
                Assert.Contains(window.GetVisualDescendants().OfType<TextBlock>(),
                    text => string.Equals(text.Text, "Screen output", StringComparison.Ordinal));
                Assert.Contains(window.GetVisualDescendants().OfType<TextBlock>(),
                    text => string.Equals(text.Text, "Live logging", StringComparison.Ordinal));
                Assert.Contains(window.GetVisualDescendants().OfType<TextBlock>(),
                    text => string.Equals(text.Text, "Debug Screen", StringComparison.Ordinal));

                var colorBars = window.GetVisualDescendants().OfType<Button>()
                    .Single(button => string.Equals(button.Content?.ToString(), "Color bars", StringComparison.Ordinal));
                colorBars.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                Assert.Equal(ScreenTestPattern.ColorBars, screens.TestPatternFor("debug-screen"));

                var racing = window.GetVisualDescendants().OfType<Button>()
                    .Single(button => string.Equals(button.Content?.ToString(), "Racing", StringComparison.Ordinal));
                racing.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                Assert.True(simulation.Enabled);
                Assert.Equal(5, simulation.Resolve(new TelemetryFrame()).Car.Gear);
                Assert.Equal(ScreenTestPattern.ColorBars, screens.TestPatternFor("debug-screen"));

                var level = window.GetVisualDescendants().OfType<ComboBox>()
                    .Single(combo => string.Equals(combo.Tag?.ToString(), "diagnostics-log-level", StringComparison.Ordinal));
                level.SelectedItem = "Warn";

                var search = window.GetVisualDescendants().OfType<TextBox>()
                    .Single(box => string.Equals(box.Tag?.ToString(), "diagnostics-log-search", StringComparison.Ordinal));
                search.Text = "USB";
                window.CaptureRenderedFrame();

                var output = window.GetVisualDescendants().OfType<TextBox>()
                    .Single(box => string.Equals(box.Tag?.ToString(), "diagnostics-log-output", StringComparison.Ordinal));
                Assert.Contains("USB screen is busy", output.Text, StringComparison.Ordinal);
                Assert.DoesNotContain("dashboard frame rendered", output.Text, StringComparison.Ordinal);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}
#endif
