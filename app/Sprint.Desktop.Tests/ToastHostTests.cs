using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Shell;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Covers the runtime notification stack behind the issue #28 startup update notice:
/// a toast attaches above the shell, survives a shell rebuild (navigation), runs its
/// action, and can be dismissed. Only the host behaviour is exercised here — the card
/// itself is a Graphite factory covered by the visual smoke gallery.
/// </summary>
public sealed class ToastHostTests
{
    [Fact]
    public async Task ToastSurvivesNavigationRunsItsActionAndDismisses()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(ToastHostTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                using var telemetry = new RecordingTelemetrySource();
                var shell = new ShellState();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                var actionRuns = 0;
                window.ShowToast(
                    GraphiteIntent.Info,
                    "Sprint v9.9.9 is available",
                    "You are on v0.1.0 (stable). Install it from Settings.",
                    "info-circle",
                    ("Open Settings", () => actionRuns++));
                window.ShowToast(GraphiteIntent.Success, "Saved", "Layout written.", "check");

                Assert.Equal(2, ToastHost(window).Children.Count);

                // Navigating rebuilds the shell and clears the root grid; live toasts must
                // be re-attached instead of silently disappearing.
                NavigateTo(window, "Settings");
                Assert.Equal(AppView.Settings, shell.View);
                Assert.Equal(2, ToastHost(window).Children.Count);

                // The action dismisses its own toast, then runs; the other one stays.
                Click(window, "Open Settings");
                Assert.Equal(1, actionRuns);
                Assert.Single(ToastHost(window).Children);

                Click(window, "Dismiss notification");
                Assert.Empty(ToastHost(window).Children);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static StackPanel ToastHost(MainWindow window) =>
        Assert.Single(
            window.GetVisualDescendants().OfType<StackPanel>(),
            panel => string.Equals(panel.Tag?.ToString(), "toast-host", StringComparison.Ordinal));

    private static void NavigateTo(MainWindow window, string navLabel)
    {
        // The sidebar nav item is an icon+label lockup, so match on its inner text.
        var nav = window.GetVisualDescendants()
            .OfType<Button>()
            .First(button => button.GetVisualDescendants()
                .OfType<TextBlock>()
                .Any(text => string.Equals(text.Text, navLabel, StringComparison.Ordinal)));
        nav.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
    }

    private static void Click(MainWindow window, string label)
    {
        var button = ToastHost(window).GetVisualDescendants()
            .OfType<Button>()
            .FirstOrDefault(candidate =>
                string.Equals(candidate.Content?.ToString(), label, StringComparison.Ordinal)
                || string.Equals(ToolTip.GetTip(candidate)?.ToString(), label, StringComparison.Ordinal));

        Assert.NotNull(button);
        button!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
    }
}
