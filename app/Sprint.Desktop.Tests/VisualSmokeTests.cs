using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;
using Sprint.Desktop.Shell;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class VisualSmokeTests
{
    public static IEnumerable<object[]> PrimaryViews()
    {
        foreach (var view in new[]
        {
            AppView.Live,
            AppView.Engineer,
            AppView.Setup,
            AppView.Dashes,
            AppView.Devices,
            AppView.Settings,
            AppView.Help
        })
        {
            yield return [view, 1440, 900];
            yield return [view, 1120, 720];
        }
    }

    [Theory]
    [MemberData(nameof(PrimaryViews))]
    public async Task Primary_shell_views_capture_meaningful_rendered_png_artifacts(AppView view, int width, int height)
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(VisualSmokeTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(view);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry)
                {
                    Width = width,
                    Height = height
                };

                window.Show();
                using var frame = SaveFrame(window, $"{view.ToString().ToLowerInvariant()}-{width}x{height}.png");
                window.Close();

                AssertMeaningfulImage(frame);
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Theory]
    [InlineData(1440, 900)]
    [InlineData(1120, 720)]
    public async Task Dash_editor_captures_meaningful_rendered_png_artifact(int width, int height)
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(VisualSmokeTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.DashLayouts.First(item => item.IsDefault);
                var controller = new DashEditorController(layout, runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window
                {
                    Width = width,
                    Height = height,
                    Content = view,
                    Background = Graphite.BgBrush
                };

                window.Show();

                // Select a placed widget so the capture exercises selection + resize grip.
                var selectable = controller.ActivePage?.Widgets.FirstOrDefault();
                if (selectable is not null)
                {
                    controller.SelectWidget(selectable.Id);
                }

                using var frame = SaveFrame(window, $"editor-{width}x{height}.png");
                window.Close();

                AssertMeaningfulImage(frame);
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Dash_editor_alerts_panel_captures_toggles()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(VisualSmokeTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.DashLayouts.First(item => item.IsDefault);
                var controller = new DashEditorController(layout, runtime.SaveDashLayout);
                controller.SetAlert("tc_change", true); // one alert on, so a green toggle is captured
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1440, Height = 900, Content = view, Background = Graphite.BgBrush };
                window.Show();

                // Switch the right panel to the alerts editor.
                var alertsButton = view.GetVisualDescendants()
                    .OfType<Button>()
                    .First(button => string.Equals(button.Content?.ToString(), "Alerts", StringComparison.Ordinal));
                alertsButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                using var frame = SaveFrame(window, "editor-alerts-1440x900.png");
                window.Close();

                AssertMeaningfulImage(frame);
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Dash_editor_drag_renders_snapping_ghost_overlay()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(VisualSmokeTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.DashLayouts.First(item => item.IsDefault);
                var controller = new DashEditorController(layout, runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window
                {
                    Width = 1440,
                    Height = 900,
                    Content = view,
                    Background = Graphite.BgBrush
                };

                window.Show();

                // Drop a single widget onto a fresh page, then start a move gesture and
                // pause mid-drag so the capture shows the live ghost preview.
                controller.AddPage();
                controller.AddWidget("fuel");
                var widget = controller.SelectedWidget!;
                window.CaptureRenderedFrame();

                var overlay = window.GetVisualDescendants()
                    .OfType<Border>()
                    .First(border => string.Equals(border.Tag?.ToString(), widget.Id, StringComparison.Ordinal));
                var point = new Point(overlay.Bounds.Width * 0.5, overlay.Bounds.Height * 0.5);
                var start = overlay.TranslatePoint(point, window)!.Value;
                var moved = start + new Vector(180, 120);

                window.MouseDown(start, MouseButton.Left, RawInputModifiers.LeftMouseButton);
                window.MouseMove(moved, RawInputModifiers.LeftMouseButton);

                using var frame = SaveFrame(window, "editor-drag-ghost-1440x900.png");

                // The move is a preview only until release; the widget must not have moved yet.
                Assert.Equal(0, widget.Col);
                Assert.Equal(0, widget.Row);

                window.MouseUp(moved, MouseButton.Left, RawInputModifiers.None);
                window.Close();

                AssertMeaningfulImage(frame);
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static string VisualArtifactRoot()
    {
        var path = Path.Combine(TestEnv.RepoRoot, "app", "Sprint.Desktop.Tests", "artifacts", "visual");
        Directory.CreateDirectory(path);
        return path;
    }

    private static Bitmap SaveFrame(Window window, string fileName)
    {
        var path = Path.Combine(VisualArtifactRoot(), fileName);
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        var captured = frame!;
        Assert.True(captured.PixelSize.Width > 0, "Expected captured frame to have a positive width.");
        Assert.True(captured.PixelSize.Height > 0, "Expected captured frame to have a positive height.");
        captured.Save(path);
        Assert.True(File.Exists(path), $"Expected visual artifact at {path}.");
        Assert.True(new FileInfo(path).Length > 0, $"Expected non-empty visual artifact at {path}.");
        return captured;
    }

    private static void AssertMeaningfulImage(Bitmap frame)
    {
        var pixelSize = frame.PixelSize;
        Assert.True(pixelSize.Width > 0, "Expected captured frame to decode with a positive width.");
        Assert.True(pixelSize.Height > 0, "Expected captured frame to decode with a positive height.");

        var stride = pixelSize.Width * 4;
        var bytes = new byte[stride * pixelSize.Height];
        using var copy = new WriteableBitmap(
            pixelSize,
            new Vector(96, 96),
            PixelFormat.Bgra8888,
            AlphaFormat.Premul);

        using (var framebuffer = copy.Lock())
        {
            frame.CopyPixels(framebuffer);
            Marshal.Copy(framebuffer.Address, bytes, 0, bytes.Length);
        }

        var visiblePixels = 0;
        var colorBuckets = new HashSet<int>();
        for (var i = 0; i < bytes.Length; i += 4)
        {
            var blue = bytes[i];
            var green = bytes[i + 1];
            var red = bytes[i + 2];
            var alpha = bytes[i + 3];
            if (alpha == 0)
            {
                continue;
            }

            visiblePixels++;
            colorBuckets.Add(((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5));
        }

        var totalPixels = pixelSize.Width * pixelSize.Height;
        Assert.True(visiblePixels > totalPixels / 2, "Expected captured frame to contain visible pixels.");
        Assert.True(colorBuckets.Count >= 8, $"Expected captured frame to contain varied rendered content, found {colorBuckets.Count} color buckets.");
    }
}
