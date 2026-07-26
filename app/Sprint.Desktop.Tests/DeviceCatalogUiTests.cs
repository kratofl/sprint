using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Shell;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The device UI flows for issues #49 and #53 against a real visual tree: building a
/// custom wheel from the Generic tab (including the rejected-input path), and changing
/// a screen's purpose so the dash controls give way to an explicit idle state.
/// </summary>
public sealed class DeviceCatalogUiTests
{
    [Fact]
    public async Task CustomWheelFormAddsAWheelAndRejectsAnEmptyName()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DeviceCatalogUiTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                using var telemetry = new RecordingTelemetrySource();
                var shell = new ShellState();
                shell.Navigate(AppView.Devices);
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();
                Render(window);

                OpenGenericTab(window);

                // Submitting without a name must explain itself and add nothing.
                var before = runtime.Devices.Count;
                Click(window, "Add wheel");
                var error = window.GetVisualDescendants()
                    .OfType<TextBlock>()
                    .FirstOrDefault(text => text.Text == "Enter a name for the wheel.");
                Assert.NotNull(error);
                Assert.True(error!.IsVisible);
                Assert.Equal(before, runtime.Devices.Count);

                Field<TextBox>(window, "custom-wheel-name").Text = "My GT Rim";
                Click(window, "No screen");
                Click(window, "Add wheel");

                var added = Assert.Single(runtime.Devices, device => device.Name == "My GT Rim");
                Assert.Equal("wheel", added.Type);
                Assert.False(DeviceCapabilities.HasScreen(added));
                Assert.Equal(DevicePurposes.Dash, added.Purpose);

                // Adding closes the dialog and lands on the new device's detail page.
                Assert.DoesNotContain(
                    window.GetVisualDescendants().OfType<Border>(),
                    border => string.Equals(border.Tag?.ToString(), "device-catalog-dialog", StringComparison.Ordinal));
                Assert.NotNull(window.GetVisualDescendants()
                    .OfType<Button>()
                    .FirstOrDefault(button => string.Equals(button.Tag?.ToString(), "device-detail-back", StringComparison.Ordinal)));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task ChangingPurposeReplacesDashControlsWithAnIdleState()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DeviceCatalogUiTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                runtime.Devices.Add(new SavedDevice
                {
                    Id = "wheel-screen",
                    Name = "Wheel screen",
                    Type = "screen",
                    Driver = "vocore",
                    Width = 480,
                    Height = 800,
                    DashId = "default",
                });

                using var telemetry = new RecordingTelemetrySource();
                var shell = new ShellState();
                shell.Navigate(AppView.Devices);
                var window = new MainWindow(runtime, shell, telemetry);
                window.Show();
                Render(window);
                Click(window, "Wheel screen");

                // Dash purpose: the dash assignment and alignment controls are present.
                Assert.NotNull(FindText(window, "Screen alignment"));

                var purpose = Field<ComboBox>(window, "device-purpose");
                purpose.SelectedItem = "Rear view mirror";
                Render(window);

                Assert.Equal(
                    DevicePurposes.RearViewMirror,
                    runtime.Devices.Single(device => device.Id == "wheel-screen").Purpose);

                // The screen is idle now: no alignment controls, and the page says why.
                Assert.Null(FindText(window, "Screen alignment"));
                Assert.NotNull(FindText(window, "Rear view mirror is not built yet"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static void OpenGenericTab(MainWindow window)
    {
        Click(window, "Add device");
        Click(window, "Generic");
    }

    private static T Field<T>(MainWindow window, string tag)
        where T : Control
    {
        var control = window.GetVisualDescendants()
            .OfType<T>()
            .FirstOrDefault(candidate => string.Equals(candidate.Tag?.ToString(), tag, StringComparison.Ordinal));

        Assert.NotNull(control);
        return control!;
    }

    private static TextBlock? FindText(MainWindow window, string text) =>
        window.GetVisualDescendants()
            .OfType<TextBlock>()
            .FirstOrDefault(block => string.Equals(block.Text, text, StringComparison.Ordinal));

    private static void Click(MainWindow window, string label)
    {
        var button = window.GetVisualDescendants()
            .OfType<Button>()
            .FirstOrDefault(candidate =>
                string.Equals(candidate.Content?.ToString(), label, StringComparison.Ordinal)
                || string.Equals(ToolTip.GetTip(candidate)?.ToString(), label, StringComparison.Ordinal)
                || candidate.GetVisualDescendants()
                    .OfType<TextBlock>()
                    .Any(text => string.Equals(text.Text, label, StringComparison.Ordinal)));

        Assert.NotNull(button);
        button!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Render(window);
    }

    // Realizes the visual tree after an interaction so descendant lookups see the
    // rebuilt page rather than the pre-click one.
    private static void Render(MainWindow window)
    {
        using var frame = window.CaptureRenderedFrame();
    }
}
