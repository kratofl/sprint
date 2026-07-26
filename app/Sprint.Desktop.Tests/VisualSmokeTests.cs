using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
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
    private const int CompactWholeAppWidth = 1120;
    private const int CompactWholeAppHeight = 720;

    public static IEnumerable<object[]> PrimaryViews()
    {
        foreach (var view in new[]
        {
            AppView.Home,
            AppView.Dashes,
            AppView.Devices,
            AppView.Setups,
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

                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(button.Content?.ToString(), "Layout", StringComparison.Ordinal));
                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(button.Content?.ToString(), "Alerts", StringComparison.Ordinal));
                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(button.Content?.ToString(), "Settings", StringComparison.Ordinal));
                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button =>
                    string.Equals(button.Content?.ToString(), "Pages", StringComparison.Ordinal));
                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button =>
                    string.Equals(button.Content?.ToString(), "Widgets", StringComparison.Ordinal));
                Assert.DoesNotContain(view.GetVisualDescendants().OfType<Button>(), button =>
                    string.Equals(button.Content?.ToString(), "Clear page", StringComparison.Ordinal));
                Assert.DoesNotContain(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(button.Content?.ToString(), "Delete page", StringComparison.Ordinal));
                Assert.DoesNotContain(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(button.Content?.ToString(), "Save", StringComparison.Ordinal));

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
    public async Task Whole_application_visual_contract_keeps_the_editor_canvas_dominant()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(VisualSmokeTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(AppView.Dashes);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry)
                {
                    Width = CompactWholeAppWidth,
                    Height = CompactWholeAppHeight,
                };

                window.Show();
                var editButton = window.GetVisualDescendants()
                    .OfType<Button>()
                    .First(button => string.Equals(button.Content?.ToString(), "Edit", StringComparison.Ordinal));
                editButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                var frameRoot = Assert.IsType<Border>(window.Content);
                Assert.Equal(new CornerRadius(0), frameRoot.CornerRadius);
                var root = Assert.IsType<Grid>(frameRoot.Child);
                // The unified toolbar sits above one integrated sidebar/content row.
                Assert.Equal(2, root.RowDefinitions.Count);
                Assert.Single(root.ColumnDefinitions);
                var contentGrid = root.Children.OfType<Grid>().Single(g => g.ColumnDefinitions.Count == 2);
                Assert.Equal(Graphite.SidebarCollapsedWidth, contentGrid.ColumnDefinitions[0].Width.Value);

                var editor = Assert.Single(window.GetVisualDescendants().OfType<DashEditorView>());
                var canvas = Assert.Single(editor.GetVisualDescendants().OfType<Canvas>(), candidate =>
                    candidate.Width >= 520 &&
                    candidate.Height >= 300 &&
                    candidate.Background is not null);

                using var frame = SaveFrame(window, "whole-application-contract-1120x720.png");
                var pixels = CapturePixels(frame);
                var origin = canvas.TranslatePoint(new Point(0, 0), window);
                Assert.NotNull(origin);
                var canvasRect = new PixelRect(
                    (int)Math.Round(origin!.Value.X),
                    (int)Math.Round(origin.Value.Y),
                    (int)Math.Round(canvas.Bounds.Width),
                    (int)Math.Round(canvas.Bounds.Height));

                Assert.True(canvasRect.X >= Graphite.SidebarCollapsedWidth + 180, $"Expected the canvas beyond the compact shell and wider palette, saw x={canvasRect.X}.");
                Assert.True(canvasRect.X + canvasRect.Width <= CompactWholeAppWidth, $"Expected the canvas to remain inside the compact window, saw right={canvasRect.X + canvasRect.Width}.");
                Assert.True(canvasRect.Y >= Graphite.ToolbarHeight + 48, $"Expected the canvas below the unified toolbar and page controls, saw y={canvasRect.Y}.");
                Assert.True(canvasRect.Width is >= 520 and <= 540, $"Expected the compact 528px-class editing canvas, saw {canvasRect.Width}.");
                Assert.True(canvasRect.Height is >= 310 and <= 325, $"Expected the configured target aspect ratio, saw {canvasRect.Height}.");

                var canvasBrightRatio = pixels.BrightRatio(canvasRect.Deflate(20), threshold: 55);
                Assert.True(canvasBrightRatio is > 0.025 and < 0.18, $"Expected existing dash widgets to be visible on the editor grid without reverting to a rendered preview bitmap; bright ratio was {canvasBrightRatio:P2}.");

                window.Close();
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

                // Switch the editor surface to the alerts editor.
                var alertsButton = view.GetVisualDescendants()
                    .OfType<Button>()
                    .First(button => string.Equals(button.Content?.ToString(), "Alerts", StringComparison.Ordinal));
                alertsButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                AssertText(view, "Alert canvas");
                AssertText(view, "Global defaults");
                AssertText(view, "Duration");
                AssertText(view, "Invert colors");
                AssertText(view, "Critical alerts only · preview remains stable.");
                AssertText(view, "Use global settings");
                Assert.Contains(view.GetVisualDescendants().OfType<Canvas>(), IsEditorCanvas);

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
    public async Task Dash_editor_persistence_failure_captures_recovery_state()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(VisualSmokeTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var controller = new DashEditorController(
                    runtime.DashLayouts.First(item => item.IsDefault),
                    _ => throw new IOException("disk unavailable"));
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1440, Height = 900, Content = view, Background = Graphite.BgBrush };
                window.Show();
                controller.SetMode("advanced");
                window.CaptureRenderedFrame();

                AssertText(view, "Changes are retained in the editor. Retry saving.");
                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button =>
                    string.Equals(button.Content?.ToString(), "Retry", StringComparison.Ordinal));
                using var frame = SaveFrame(window, "editor-persistence-failure-1440x900.png");
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
    public async Task Dash_editor_widget_stack_captures_layer_inspector()
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
                controller.SetMode("advanced");
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1440, Height = 900, Content = view, Background = Graphite.BgBrush };
                window.Show();

                // A fresh page has room for a stack; author two layers with content.
                controller.AddPage();
                Assert.True(controller.AddWidgetStack());
                controller.AddWidgetToActiveLayer("gear_speed"); // default layer 1 (rendered)
                controller.AddStackLayer();
                controller.AddWidgetToActiveLayer("fuel");        // layer 2 (active in inspector)
                window.CaptureRenderedFrame();

                using var frame = SaveFrame(window, "editor-widget-stack-1440x900.png");
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
    public async Task Dash_editor_theme_panel_captures_recolored_layout()
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
                controller.ApplyThemePreset(DashThemePresets.All.First(preset => preset.Name == "Ice").Theme);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1440, Height = 900, Content = view, Background = Graphite.BgBrush };
                window.Show();

                // Switch the editor surface to the settings/theme manager.
                var themeButton = view.GetVisualDescendants()
                    .OfType<Button>()
                    .First(button => string.Equals(button.Content?.ToString(), "Settings", StringComparison.Ordinal));
                themeButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                AssertText(view, "Theme presets");
                AssertText(view, "Graphite");
                AssertText(view, "Ice");
                AssertText(view, "Suzuki");
                AssertText(view, "Selected");
                Assert.DoesNotContain(view.GetVisualDescendants().OfType<TextBlock>(), text =>
                    string.Equals(text.Text, "Color system", StringComparison.Ordinal) ||
                    string.Equals(text.Text, "Racing conditions", StringComparison.Ordinal) ||
                    string.Equals(text.Text, "Legacy authored accents", StringComparison.Ordinal));
                Assert.Equal(DashThemePresets.All.Count, view.GetVisualDescendants().OfType<Button>()
                    .Count(button => button.Tag?.ToString()?.StartsWith("theme-preset-", StringComparison.Ordinal) == true));
                Assert.DoesNotContain(view.GetVisualDescendants().OfType<Canvas>(), IsEditorCanvas);

                using var frame = SaveFrame(window, "editor-theme-1440x900.png");
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
    public async Task Dash_editor_widget_inspector_captures_config_and_style()
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
                var window = new Window { Width = 1440, Height = 900, Content = view, Background = Graphite.BgBrush };
                window.Show();

                // A text widget has the richest inspector: content + binding config plus
                // style. Add it to a fresh page so it always finds a free slot.
                controller.AddPage();
                Assert.True(controller.AddWidget("text"));
                controller.SetSelectedConfig("content", "P1");
                controller.SetSelectedTextColor("ember");

                using var frame = SaveFrame(window, "editor-inspector-1440x900.png");
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
    public async Task Dash_editor_palette_keeps_full_widget_catalog_and_stack_controls()
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
                controller.SetMode("advanced");
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1440, Height = 900, Content = view, Background = Graphite.BgBrush };
                window.Show();

                foreach (var label in new[]
                {
                    "Gear + Speed",
                    "RPM Bar",
                    "Input Trace",
                    "Traction Control",
                })
                {
                    AssertText(view, label);
                }

                Assert.DoesNotContain(view.GetVisualDescendants().OfType<Border>(), border =>
                    string.Equals(border.Tag?.ToString(), "palette:fuel", StringComparison.Ordinal));
                var timingHeader = view.GetVisualDescendants().OfType<Button>()
                    .First(button => string.Equals(button.Tag?.ToString(), "palette-category:Timing", StringComparison.Ordinal));
                timingHeader.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                foreach (var label in new[] { "Lap Time", "Delta", "Sectors", "Fuel" })
                {
                    AssertText(view, label);
                }
                window.CaptureRenderedFrame();

                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(button.Content?.ToString(), "+  Widget stack", StringComparison.Ordinal));
                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(ToolTip.GetTip(button) as string, "Collapse widget panel", StringComparison.Ordinal));
                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(button.Content?.ToString(), "Pages", StringComparison.Ordinal));
                Assert.Contains(view.GetVisualDescendants().OfType<Button>(), button => string.Equals(button.Content?.ToString(), "Widgets", StringComparison.Ordinal));

                var gearCard = view.GetVisualDescendants()
                    .OfType<Border>()
                    .First(border => string.Equals(border.Tag?.ToString(), "palette:gear_speed", StringComparison.Ordinal));
                var rpmCard = view.GetVisualDescendants()
                    .OfType<Border>()
                    .First(border => string.Equals(border.Tag?.ToString(), "palette:rpm_bar", StringComparison.Ordinal));
                Assert.True(gearCard.Bounds.Width >= 120 && gearCard.Bounds.Height <= 40, $"Expected compact full-width palette rows, saw {gearCard.Bounds.Width}x{gearCard.Bounds.Height}.");
                var gearPoint = gearCard.TranslatePoint(new Point(0, 0), view);
                var rpmPoint = rpmCard.TranslatePoint(new Point(0, 0), view);
                Assert.NotNull(gearPoint);
                Assert.NotNull(rpmPoint);
                Assert.True(rpmPoint.Value.Y > gearPoint.Value.Y, "Expected widgets to form a calm vertical palette list.");
                Assert.True(Math.Abs(rpmPoint.Value.X - gearPoint.Value.X) <= 2, "Expected palette rows to share one aligned leading edge.");
                Assert.Contains(gearCard.GetVisualDescendants().OfType<Viewbox>(), _ => true);
                Assert.DoesNotContain(gearCard.GetVisualDescendants().OfType<TextBlock>(), text => string.Equals(text.Text, "◔", StringComparison.Ordinal));
                window.CaptureRenderedFrame();

                using var frame = SaveFrame(window, "editor-palette-1440x900.png");
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
    public async Task Dash_editor_layout_surface_shows_existing_widgets_and_usable_inspector()
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
                var window = new Window { Width = 1440, Height = 900, Content = view, Background = Graphite.BgBrush };
                window.Show();

                var root = Assert.IsType<Grid>(view.Content);
                Assert.True(root.ColumnDefinitions[2].Width.Value >= 250, $"Expected a comfortably spaced inspector column, saw {root.ColumnDefinitions[2].Width.Value}.");

                var overlay = view.GetVisualDescendants()
                    .OfType<Border>()
                    .First(border => string.Equals(border.Tag?.ToString(), "driving-gear", StringComparison.Ordinal));
                Assert.Equal(Brushes.Transparent, overlay.Background);
                Assert.Equal(Brushes.Transparent, overlay.BorderBrush);

                AssertText(view, "Properties");
                Assert.DoesNotContain(view.GetVisualDescendants().OfType<TextBlock>(), text => string.Equals(text.Text, "Gear", StringComparison.Ordinal));

                window.Close();
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

    [Fact]
    public async Task Component_gallery_captures_indicator_alert_toast_and_tab_components()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(VisualSmokeTests).Assembly);

        await session.Dispatch(() =>
        {
            var window = new Window
            {
                Width = 900,
                Height = 820,
                Content = BuildComponentGallery(),
                Background = Graphite.BgBrush,
            };
            window.Show();

            using var frame = SaveFrame(window, "components-gallery.png");
            window.Close();

            AssertMeaningfulImage(frame);
        }, CancellationToken.None);
    }

    // A one-screen showcase of the Graphite sheet components that had no on-screen
    // home yet (indicator, alert, toast, tab view vs segmented). Captured so the
    // rendering can be read back and compared to docs/design/figma/components/*.png.
    private static Control BuildComponentGallery()
    {
        var page = new StackPanel { Spacing = 18, Margin = new Thickness(28) };

        page.Children.Add(Graphite.SectionLabel("Indicators"));
        var indicators = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 14 };
        foreach (var intent in new[] { GraphiteIntent.Success, GraphiteIntent.Danger, GraphiteIntent.Primary, GraphiteIntent.Info, GraphiteIntent.Neutral })
        {
            indicators.Children.Add(Graphite.Indicator(intent, "check"));
        }

        page.Children.Add(indicators);

        page.Children.Add(Graphite.SectionLabel("Alerts"));
        var alerts = new StackPanel { Spacing = 10 };
        alerts.Children.Add(Graphite.Alert(GraphiteIntent.Success, "Layout saved", "Your dash layout was written to disk.", "check"));
        alerts.Children.Add(Graphite.Alert(GraphiteIntent.Danger, "Telemetry lost", "No frames received for 5 seconds.", "alert-circle"));
        alerts.Children.Add(Graphite.Alert(GraphiteIntent.Info, "Update available", "Sprint 2.1 is ready to download.", "info-circle"));
        page.Children.Add(alerts);

        page.Children.Add(Graphite.SectionLabel("Toasts"));
        var toasts = new StackPanel { Spacing = 10 };
        toasts.Children.Add(Graphite.Toast(GraphiteIntent.Success, "Connected", "Le Mans Ultimate telemetry is live.", "circle-check"));
        toasts.Children.Add(Graphite.Toast(GraphiteIntent.Danger, "Device error", "USBD480 screen was disconnected.", "alert-circle"));
        // Live toast shape: action + dismiss controls pinned to the card's right edge
        // (what the startup update notice renders).
        var toastActions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            Margin = new Thickness(12, 0, 0, 0),
        };
        toastActions.Children.Add(Graphite.Button("Open Settings", ButtonTone.Primary));
        toastActions.Children.Add(Graphite.ChromeIconButton("x", "Dismiss notification", () => { }));
        var toastLifetime = Graphite.ToastLifetimeProgress(GraphiteIntent.Info);
        Graphite.SetToastLifetimeProgress(toastLifetime, 62);
        var compactUpdateToast = Graphite.Toast(
            GraphiteIntent.Info,
            "Sprint v0.1.2-alpha.5 is available",
            "You are on v0.0.1 (pre-release). Install it from Settings.",
            "info-circle",
            toastActions,
            toastLifetime);
        compactUpdateToast.MaxWidth = 460;
        compactUpdateToast.HorizontalAlignment = HorizontalAlignment.Right;
        toasts.Children.Add(compactUpdateToast);
        page.Children.Add(toasts);

        page.Children.Add(Graphite.SectionLabel("Tab view / Segmented"));
        var tabs = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 18 };
        tabs.Children.Add(Graphite.TabView(new[] { "Layout", "Alerts", "Settings" }, 0, _ => { }));
        tabs.Children.Add(Graphite.Segmented(new[] { "Tour", "Sport", "Race" }, 2, _ => { }));
        page.Children.Add(tabs);

        page.Children.Add(Graphite.SectionLabel("Chips"));
        var chips = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10 };
        chips.Children.Add(Graphite.Chip("SPORT", Graphite.RedBrush));
        chips.Children.Add(Graphite.Chip("DRY", Graphite.GreenBrush));
        chips.Children.Add(Graphite.Chip("RACE", Graphite.AccentBrush));
        page.Children.Add(chips);

        return new ScrollViewer { Content = page };
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
        captured.Save(path, new PngBitmapEncoderOptions());
        Assert.True(File.Exists(path), $"Expected visual artifact at {path}.");
        Assert.True(new FileInfo(path).Length > 0, $"Expected non-empty visual artifact at {path}.");
        return captured;
    }

    private static void AssertMeaningfulImage(Bitmap frame)
    {
        var pixels = CapturePixels(frame);

        var visiblePixels = 0;
        var colorBuckets = new HashSet<int>();
        for (var i = 0; i < pixels.Bytes.Length; i += 4)
        {
            var blue = pixels.Bytes[i];
            var green = pixels.Bytes[i + 1];
            var red = pixels.Bytes[i + 2];
            var alpha = pixels.Bytes[i + 3];
            if (alpha == 0)
            {
                continue;
            }

            visiblePixels++;
            colorBuckets.Add(((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5));
        }

        var totalPixels = pixels.Width * pixels.Height;
        Assert.True(visiblePixels > totalPixels / 2, "Expected captured frame to contain visible pixels.");
        Assert.True(colorBuckets.Count >= 8, $"Expected captured frame to contain varied rendered content, found {colorBuckets.Count} color buckets.");
    }

    private static void AssertText(Control root, string text)
    {
        Assert.Contains(root.GetVisualDescendants().OfType<TextBlock>(),
            candidate => string.Equals(candidate.Text, text, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsEditorCanvas(Canvas canvas) =>
        canvas.Width >= 560 &&
        canvas.Height >= 300 &&
        canvas.Background is not null;

    private static PixelBuffer CapturePixels(Bitmap frame)
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

        return new PixelBuffer(pixelSize.Width, pixelSize.Height, stride, bytes);
    }

    private sealed record PixelBuffer(int Width, int Height, int Stride, byte[] Bytes)
    {
        public double BrightRatio(PixelRect rect, byte threshold)
        {
            var clipped = rect.Clip(Width, Height);
            var bright = 0;
            var total = 0;
            for (var y = clipped.Y; y < clipped.Y + clipped.Height; y++)
            {
                for (var x = clipped.X; x < clipped.X + clipped.Width; x++)
                {
                    var offset = y * Stride + x * 4;
                    var blue = Bytes[offset];
                    var green = Bytes[offset + 1];
                    var red = Bytes[offset + 2];
                    if (Math.Max(red, Math.Max(green, blue)) > threshold)
                    {
                        bright++;
                    }

                    total++;
                }
            }

            return total == 0 ? 0 : (double)bright / total;
        }
    }

    private readonly record struct PixelRect(int X, int Y, int Width, int Height)
    {
        public PixelRect Deflate(int amount) => new(X + amount, Y + amount, Math.Max(0, Width - amount * 2), Math.Max(0, Height - amount * 2));

        public PixelRect Clip(int imageWidth, int imageHeight)
        {
            var x = Math.Clamp(X, 0, imageWidth);
            var y = Math.Clamp(Y, 0, imageHeight);
            var right = Math.Clamp(X + Width, x, imageWidth);
            var bottom = Math.Clamp(Y + Height, y, imageHeight);
            return new PixelRect(x, y, right - x, bottom - y);
        }
    }
}
