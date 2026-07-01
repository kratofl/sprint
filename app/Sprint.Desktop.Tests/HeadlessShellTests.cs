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

                var addPage = FindButton(window, "Add page");
                addPage.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

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
