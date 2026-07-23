using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Shell;
using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class ScreenStatusUiTests
{
    [Fact]
    public async Task DevicesViewRefreshesWhenScreenLeavesConnecting()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(ScreenStatusUiTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        MainWindow? window = null;
        var driver = new ControlledScreenDriver();
        var log = new LiveLogStore();

        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                runtime.Devices.Add(new SavedDevice
                {
                    Id = "status-screen",
                    Name = "Status Screen",
                    Type = "screen",
                    Driver = "fake",
                    Vid = 1,
                    Pid = 2,
                    Width = 480,
                    Height = 272,
                    DashId = runtime.DashLayouts.First().Id,
                });
                var shell = new ShellState();
                shell.Navigate(AppView.Devices);
                window = new MainWindow(
                    runtime,
                    shell,
                    new RecordingTelemetrySource(),
                    log: log,
                    liveLog: log,
                    screenDriverFactory: _ => driver);
                window.Show();
            }, CancellationToken.None);

            await Task.Delay(150);
            await session.Dispatch(() =>
            {
                var current = Assert.IsType<MainWindow>(window);
                current.CaptureRenderedFrame();
                Assert.Contains(current.GetVisualDescendants().OfType<TextBlock>(),
                    text => string.Equals(text.Text, "Connecting", StringComparison.Ordinal));
            }, CancellationToken.None);

            driver.CompleteConnection();
            await Task.Delay(300);

            await session.Dispatch(() =>
            {
                var current = Assert.IsType<MainWindow>(window);
                current.RefreshScreenStatusIndicators();
                current.CaptureRenderedFrame();
                Assert.Equal(ScreenConnectionState.Connected, driver.Status.State);
                Assert.Contains(log.Entries, entry =>
                    entry.Message.Contains("state=Connected", StringComparison.Ordinal));
                Assert.Contains(log.Entries, entry =>
                    entry.Message.Contains("Screen status UI refreshed", StringComparison.Ordinal));
                var labels = current.GetVisualDescendants().OfType<TextBlock>()
                    .Select(text => text.Text ?? "")
                    .ToArray();
                Assert.True(
                    labels.Contains("Connected", StringComparer.Ordinal),
                    $"Visible labels: {string.Join(" | ", labels)}");
                Assert.DoesNotContain("Connecting", labels);
                current.Close();
            }, CancellationToken.None);
        }
        finally
        {
            if (window?.IsVisible == true)
            {
                await session.Dispatch(window.Close, CancellationToken.None);
            }

            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private sealed class ControlledScreenDriver : IScreenDriver
    {
        private readonly ManualResetEventSlim _allowConnect = new(false);
        private ScreenStatus _status = ScreenStatus.Disconnected();

        public string Name => "Controlled Screen";
        public ScreenStatus Status => _status;
        public void Configure(ScreenConfig config) { }

        public bool Connect()
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Connecting };
            _allowConnect.Wait(TimeSpan.FromSeconds(5));
            return _status.IsConnected;
        }

        public bool TrySendFrame(byte[] rgb565) => _status.IsConnected;
        public void Disconnect()
        {
            _allowConnect.Set();
            _status = ScreenStatus.Disconnected();
        }

        public void Dispose()
        {
            Disconnect();
            _allowConnect.Dispose();
        }

        public void CompleteConnection()
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Connected };
            _allowConnect.Set();
        }
    }
}
