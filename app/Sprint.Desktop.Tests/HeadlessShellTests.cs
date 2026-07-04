using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
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
    public async Task ShellTitlebarUsesFigmaHeight()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell: new ShellState(), telemetrySource: telemetry);
                window.Show();

                var root = Assert.IsType<Grid>(window.Content);
                Assert.Equal(32, root.RowDefinitions[0].Height.Value);

                var titlebar = Assert.IsType<Grid>(root.Children.Single(child =>
                    Grid.GetRow(child) == 0 &&
                    Grid.GetColumnSpan(child) == 2));
                Assert.Equal(32, titlebar.Height);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task SidebarNavigationCanSwitchViewsWithoutCrashing()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell: new ShellState(), telemetrySource: telemetry);
                window.Show();

                FindButton(window, "Devices").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                FindButton(window, "Settings").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                FindButton(window, "Live").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
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
    public async Task SidebarNavigationItemsUseFigmaSelectedTreatment()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell: new ShellState(), telemetrySource: telemetry);
                window.Show();

                var active = FindButton(window, "Live");
                Assert.Equal(Graphite.Panel3Brush, active.Background);
                Assert.Equal(Graphite.AccentBrush, active.Foreground);
                Assert.Equal(new CornerRadius(Graphite.RadiusMd), active.CornerRadius);
                Assert.Equal(32, active.MinHeight);

                var inactive = FindButton(window, "Engineer");
                Assert.Equal(Graphite.PanelBrush, inactive.Background);
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
    public async Task SidebarToggleWhileDashEditorIsOpenDoesNotReparentEditor()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.CreateDashLayout();
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                FindCardButton(window, layout.Name, "Edit").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                FindButton(window, "<<").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
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
    public async Task DashesPageAddPageActionPersistsThroughRuntime()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(HeadlessShellTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.CreateDashLayout();
                var initialPageCount = layout.Pages.Count;
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();

                // Add-page moved into the dash editor: open the custom layout's
                // editor from its card, then add a page from the editor toolbar.
                FindCardButton(window, layout.Name, "Edit").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame(); // realize the swapped-in editor content in the visual tree
                FindButton(window, "＋ Page").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

                Assert.Equal(initialPageCount + 1, layout.Pages.Count);
                Assert.Contains(layout.Pages, page => page.Name == "Page");

                window.Close();
            }, CancellationToken.None);

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var persisted = reloaded.DashLayouts.Single(layout => !layout.IsDefault);
            Assert.Contains(persisted.Pages, page => page.Name == "Page");
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
            .First(button => string.Equals(button.Content?.ToString(), content, StringComparison.Ordinal));
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
