using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media;
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
    public async Task PurposeChoiceShowsOnlyTheControlsAndStatusRelevantToThatScreenTask()
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

                // Dashboard purpose: the editable dash assignment and alignment controls are present.
                Assert.NotNull(FindText(window, "This screen is used for"));
                Assert.NotNull(FindText(window, "Show a customizable racing dashboard."));
                Assert.NotNull(FindText(window, "Screen alignment"));
                Assert.NotNull(FindTagged<ComboBox>(window, "device-dash"));

                var orientation = Field<ComboBox>(window, "device-orientation");
                Assert.Equal("Portrait", orientation.SelectedItem);
                orientation.SelectedItem = "Landscape";
                Render(window);
                Assert.Equal(
                    90,
                    runtime.Devices.Single(device => device.Id == "wheel-screen").Rotation);
                AssertLandscapePreview(window);

                var purpose = Field<ComboBox>(window, "device-purpose");
                purpose.SelectedItem = "Flag display";
                Render(window);

                Assert.Equal(
                    DevicePurposes.Flags,
                    runtime.Devices.Single(device => device.Id == "wheel-screen").Purpose);
                Assert.NotNull(FindText(window, "Show the active marshalling flag at maximum glanceability."));
                Assert.NotNull(FindText(window, "Screen alignment"));
                Assert.Null(FindTagged<ComboBox>(window, "device-dash"));
                Assert.Null(FindText(window, "Flag display is not built yet"));
                AssertLandscapePreview(window);

                var lapTimerPurpose = Field<ComboBox>(window, "device-purpose");
                lapTimerPurpose.SelectedItem = "Lap timer";
                Render(window);

                Assert.Equal(
                    DevicePurposes.LapTimes,
                    runtime.Devices.Single(device => device.Id == "wheel-screen").Purpose);
                Assert.NotNull(FindText(window, "Show current, last, and best lap times with a live delta."));
                AssertLandscapePreview(window);

                var mirrorPurpose = Field<ComboBox>(window, "device-purpose");
                mirrorPurpose.SelectedItem = "Rear-view mirror";
                Render(window);

                // Rear-view is a zero-dashboard capture task. It keeps relevant panel
                // alignment but asks for a desktop area before starting output.
                Assert.NotNull(FindText(window, "Capture area"));
                Assert.NotNull(FindText(window, "Screen alignment"));
                Assert.NotNull(FindText(window, "Setup needed"));
                Assert.Null(FindTagged<ComboBox>(window, "device-dash"));

                Click(window, "Select area");
                var selector = Assert.IsType<CaptureRegionWindow>(window.ActiveCaptureRegionWindow);
                Assert.Equal(WindowDecorations.None, selector.WindowDecorations);
                Assert.Equal(Brushes.Transparent, selector.Background);
                Assert.Contains(WindowTransparencyLevel.Transparent, selector.TransparencyLevelHint);
                var dragSurface = selector.GetVisualDescendants()
                    .OfType<Border>()
                    .Single(control => string.Equals(
                        control.Tag?.ToString(),
                        "capture-drag-surface",
                        StringComparison.Ordinal));
                Assert.NotEqual(Brushes.Transparent, dragSurface.Background);
                Assert.True(WindowDragPolicy.ShouldBeginDrag(dragSurface));
                Assert.False(WindowDragPolicy.ShouldBeginDrag(selector.GetVisualDescendants()
                    .OfType<Button>()
                    .Single(button => string.Equals(
                        button.Content?.ToString(),
                        "Use this area",
                        StringComparison.Ordinal))));
                Assert.Equal(8, selector.GetVisualDescendants()
                    .OfType<Avalonia.Controls.Shapes.Ellipse>()
                    .Count(handle => handle.Tag?.ToString()?.StartsWith(
                        "capture-resize-handle:",
                        StringComparison.Ordinal) == true));
                Assert.Equal(
                    CaptureSelectionGeometry.AspectRatio(runtime.Devices.Single(device => device.Id == "wheel-screen")),
                    selector.SelectionAspectRatio,
                    precision: 8);

                var beforeMove = selector.Position;
                RaiseKey(selector, Key.Right);
                Assert.True(selector.Position.X > beforeMove.X);
                var beforeResize = selector.SelectedRegion;
                RaiseKey(selector, Key.Right, KeyModifiers.Shift);
                Render(selector);
                var afterResize = selector.SelectedRegion;
                Assert.True(afterResize.Width > beforeResize.Width);
                Assert.Equal(
                    selector.SelectionAspectRatio,
                    afterResize.Width / (double)afterResize.Height,
                    precision: 2);

                RaiseKey(selector, Key.Escape);
                Assert.Null(window.ActiveCaptureRegionWindow);
                Assert.Null(runtime.Devices.Single(device => device.Id == "wheel-screen").CaptureRegion);

                Click(window, "Select area");
                selector = Assert.IsType<CaptureRegionWindow>(window.ActiveCaptureRegionWindow);
                selector.Position = new PixelPoint(-640, 80);
                selector.Width = 600;
                selector.Height = 600;
                Render(selector);
                Assert.Equal(
                    selector.SelectionAspectRatio,
                    selector.SelectedRegion.Width / (double)selector.SelectedRegion.Height,
                    precision: 2);
                RaiseKey(selector, Key.Enter);
                Render(window);

                var configured = runtime.Devices.Single(device => device.Id == "wheel-screen");
                Assert.NotNull(configured.CaptureRegion);
                Assert.True(configured.CaptureRegion!.IsValid);
                Assert.True(configured.CaptureRegion.X < 0);
                Assert.Null(window.ActiveCaptureRegionWindow);
                Assert.NotNull(FindText(window, "Live capture preview"));
                Assert.NotNull(FindText(window, "FPS"));
                Assert.NotNull(FindText(window, "Frame time"));
                Assert.NotNull(FindText(window, "Change area"));

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

    private static void AssertLandscapePreview(MainWindow window)
    {
        var preview = window.GetVisualDescendants()
            .OfType<Image>()
            .Single(image => image.Source is Avalonia.Media.Imaging.WriteableBitmap);
        Assert.True(preview.Width > preview.Height, $"Landscape preview was {preview.Width}×{preview.Height}.");
    }

    private static TextBlock? FindText(MainWindow window, string text) =>
        window.GetVisualDescendants()
            .OfType<TextBlock>()
            .FirstOrDefault(block => string.Equals(block.Text, text, StringComparison.Ordinal));

    private static T? FindTagged<T>(MainWindow window, string tag)
        where T : Control =>
        window.GetVisualDescendants()
            .OfType<T>()
            .FirstOrDefault(candidate => string.Equals(candidate.Tag?.ToString(), tag, StringComparison.Ordinal));

    private static void Click(MainWindow window, string label)
    {
        Click((Window)window, label);
        Render(window);
    }

    private static void Click(Window window, string label)
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
    }

    // Realizes the visual tree after an interaction so descendant lookups see the
    // rebuilt page rather than the pre-click one.
    private static void Render(MainWindow window)
    {
        using var frame = window.CaptureRenderedFrame();
    }

    private static void Render(Window window)
    {
        using var frame = window.CaptureRenderedFrame();
    }

    private static void RaiseKey(Window window, Key key, KeyModifiers modifiers = KeyModifiers.None)
    {
        window.RaiseEvent(new KeyEventArgs
        {
            RoutedEvent = InputElement.KeyDownEvent,
            Source = window,
            Key = key,
            KeyModifiers = modifiers,
        });
    }
}
