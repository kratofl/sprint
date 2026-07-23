using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.VisualTree;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashEditorViewTests
{
    [Fact]
    public async Task Editor_view_constructs_and_renders_headless()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.DashLayouts.First(item => item.IsDefault);
                var controller = new DashEditorController(layout, runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });

                var window = new Window { Width = 1200, Height = 800, Content = view };
                window.Show();

                // The default preset's main page is fully tiled; add a fresh empty
                // page, then a widget, to exercise the add path + view rebuild.
                controller.AddPage();
                Assert.True(controller.AddWidget("fuel"));

                var frame = window.CaptureRenderedFrame();
                Assert.NotNull(frame);
                Assert.True(frame!.PixelSize.Width > 0 && frame.PixelSize.Height > 0);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task PointerClickSelectsWidgetWithoutMovingIt()
    {
        await RunGestureTest((window, controller, widget) =>
        {
            var start = (widget.Col, widget.Row);
            var overlay = FindWidgetOverlay(window, widget.Id);
            var center = PointInWindow(overlay, window, 0.5, 0.5);

            window.MouseDown(center, MouseButton.Left, RawInputModifiers.LeftMouseButton);
            window.MouseUp(center, MouseButton.Left, RawInputModifiers.None);

            Assert.Equal(widget.Id, controller.SelectedWidgetId);
            Assert.Equal(start.Col, widget.Col);
            Assert.Equal(start.Row, widget.Row);
        });
    }

    [Fact]
    public async Task PointerDragMovesWidgetByGridCellsAcrossSelectionRebuild()
    {
        await RunGestureTest((window, controller, widget) =>
        {
            var overlay = FindWidgetOverlay(window, widget.Id);
            var start = PointInWindow(overlay, window, 0.5, 0.5);
            var end = start + new Vector(35, 70);

            window.MouseDown(start, MouseButton.Left, RawInputModifiers.LeftMouseButton);
            window.MouseMove(end, RawInputModifiers.LeftMouseButton);
            window.MouseUp(end, MouseButton.Left, RawInputModifiers.None);

            Assert.Equal(widget.Id, controller.SelectedWidgetId);
            Assert.Equal(1, widget.Col);
            Assert.Equal(2, widget.Row);
        });
    }

    [Fact]
    public async Task PointerResizeClampsToMinimumSize()
    {
        await RunGestureTest((window, controller, widget) =>
        {
            controller.SelectWidget(widget.Id);
            window.CaptureRenderedFrame();

            var overlay = FindWidgetOverlay(window, widget.Id);
            var start = PointInWindow(overlay, window, 0.95, 0.95);
            var end = start - new Vector(200, 120);

            window.MouseDown(start, MouseButton.Left, RawInputModifiers.LeftMouseButton);
            window.MouseMove(end, RawInputModifiers.LeftMouseButton);
            window.MouseUp(end, MouseButton.Left, RawInputModifiers.None);

            Assert.Equal(1, widget.ColSpan);
            Assert.Equal(1, widget.RowSpan);
        });
    }

    [Fact]
    public async Task PointerResizeRejectsCollisions()
    {
        await RunGestureTest((window, controller, widget) =>
        {
            var blocker = new DashWidget
            {
                Id = "blocker",
                Type = "fuel",
                Col = widget.Col + widget.ColSpan,
                Row = widget.Row,
                ColSpan = 2,
                RowSpan = widget.RowSpan
            };
            controller.ActivePage!.Widgets.Add(blocker);
            controller.SelectWidget(widget.Id);
            window.CaptureRenderedFrame();

            var overlay = FindWidgetOverlay(window, widget.Id);
            var start = PointInWindow(overlay, window, 0.95, 0.95);
            var end = start + new Vector(70, 0);

            window.MouseDown(start, MouseButton.Left, RawInputModifiers.LeftMouseButton);
            window.MouseMove(end, RawInputModifiers.LeftMouseButton);
            window.MouseUp(end, MouseButton.Left, RawInputModifiers.None);

            Assert.Equal(4, widget.ColSpan);
            Assert.Equal(2, widget.RowSpan);
        });
    }

    [Fact]
    public async Task CanvasTakesTargetProfileTruePixelAspect()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.DashLayouts.First(item => item.IsDefault);
                var controller = new DashEditorController(layout, runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1400, Height = 1200, Content = view };
                window.Show();

                // Retarget to a tall portrait screen; the canvas must take that screen's
                // real pixel aspect (854/480), not the 12×20 grid ratio (US16).
                var portrait = ScreenProfileCatalog.Find("portrait-480x854")!;
                controller.SetTargetProfile(portrait);
                window.CaptureRenderedFrame();

                var canvas = window.GetVisualDescendants()
                    .OfType<Canvas>()
                    .First(c => !double.IsNaN(c.Width) && c.Width > 100 && !double.IsNaN(c.Height));

                var expected = (double)portrait.Height / portrait.Width;
                var actual = canvas.Height / canvas.Width;
                Assert.True(Math.Abs(actual - expected) < 0.01, $"canvas aspect {actual:F3} should match profile {expected:F3}");

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task PagesSidebarAddsANewPageFromTheEditor()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.DashLayouts.First(item => item.IsDefault);
                var controller = new DashEditorController(layout, runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1200, Height = 800, Content = view };
                window.Show();

                var before = controller.PageTabs.Count;

                var pagesButton = window.GetVisualDescendants()
                    .OfType<Button>()
                    .First(b => string.Equals(b.Content?.ToString(), "Pages", StringComparison.Ordinal));
                pagesButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                var addButton = window.GetVisualDescendants()
                    .OfType<Button>()
                    .First(b => string.Equals(ToolTip.GetTip(b) as string, "Add page", StringComparison.Ordinal));
                addButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                Assert.Equal(before + 1, controller.PageTabs.Count);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Editor_header_and_palette_controls_use_the_compact_alignment_contract()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var controller = new DashEditorController(runtime.DashLayouts.First(item => item.IsDefault), runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1200, Height = 800, Content = view };
                window.Show();
                window.CaptureRenderedFrame();

                var name = window.GetVisualDescendants().OfType<TextBox>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "dash-name-editor", StringComparison.Ordinal));
                Assert.Equal(VerticalAlignment.Center, name.VerticalContentAlignment);

                var switcher = window.GetVisualDescendants().OfType<Border>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "palette-surface-switcher", StringComparison.Ordinal));
                Assert.Equal(HorizontalAlignment.Stretch, switcher.HorizontalAlignment);
                var options = switcher.GetVisualDescendants().OfType<Button>().ToArray();
                Assert.Equal(2, options.Length);
                Assert.InRange(Math.Abs(options[0].Bounds.Width - options[1].Bounds.Width), 0, 1.1);
                Assert.True(options.Sum(option => option.Bounds.Width) >= switcher.Bounds.Width - 8);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Compact_editor_toolbar_keeps_page_tabs_clear_of_actions()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var controller = new DashEditorController(runtime.DashLayouts.First(item => item.IsDefault), runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1000, Height = 720, Content = view };
                window.Show();
                window.CaptureRenderedFrame();

                var tabs = window.GetVisualDescendants().OfType<Control>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "editor-panel-tabs", StringComparison.Ordinal));
                var actions = window.GetVisualDescendants().OfType<Control>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "editor-toolbar-actions", StringComparison.Ordinal));
                var tabTop = tabs.TranslatePoint(default, window);
                var actionBottom = actions.TranslatePoint(new Point(0, actions.Bounds.Height), window);

                Assert.NotNull(tabTop);
                Assert.NotNull(actionBottom);
                Assert.True(
                    tabTop.Value.Y >= actionBottom.Value.Y,
                    $"compact tabs begin at {tabTop.Value.Y:F1} but actions end at {actionBottom.Value.Y:F1}");
                Assert.Contains(
                    tabs.GetVisualDescendants().OfType<Button>(),
                    button => string.Equals(button.Content?.ToString(), "Settings", StringComparison.Ordinal) &&
                              button.Bounds.Width > 40);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Alerts_tab_uses_a_left_popup_list_with_trailing_enable_toggles()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var controller = new DashEditorController(runtime.DashLayouts.First(item => item.IsDefault), runtime.SaveDashLayout);
                controller.SetAlert("enginemap_change", true);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1440, Height = 900, Content = view };
                window.Show();

                window.GetVisualDescendants().OfType<Button>()
                    .First(button => string.Equals(button.Content?.ToString(), "Alerts", StringComparison.Ordinal))
                    .RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                var popupList = window.GetVisualDescendants().OfType<Control>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "alert-popup-list", StringComparison.Ordinal));
                var labels = popupList.GetVisualDescendants().OfType<TextBlock>()
                    .Select(text => text.Text!)
                    .Where(text => text is not null)
                    .ToArray();
                Assert.Equal(["TC", "ABS", "ENGINE MAP"], labels);

                var toggles = popupList.GetVisualDescendants().OfType<ToggleButton>()
                    .Where(control => control.Tag?.ToString()?.StartsWith("alert-toggle:", StringComparison.Ordinal) == true)
                    .ToArray();
                Assert.Equal(3, toggles.Length);
                Assert.All(toggles, toggle =>
                {
                    Assert.True(toggle.Focusable);
                    Assert.Equal(HorizontalAlignment.Right, toggle.HorizontalAlignment);
                });
                var selectedRow = popupList.GetVisualDescendants().OfType<Border>()
                    .Single(border => string.Equals(border.Tag?.ToString(), "alert-row:tc_change", StringComparison.Ordinal));
                Assert.Equal(Graphite.LineBrush, selectedRow.BorderBrush);
                var selectedSelector = popupList.GetVisualDescendants().OfType<Button>()
                    .Single(button => string.Equals(button.Tag?.ToString(), "alert-selector:tc_change", StringComparison.Ordinal));
                Assert.Empty(selectedSelector.GetVisualDescendants().OfType<Avalonia.Controls.Shapes.Path>());
                Assert.Empty(selectedSelector.GetVisualDescendants().OfType<Border>());
                selectedSelector.Focus();
                Assert.Equal(Graphite.AccentBrush, selectedRow.BorderBrush);
                Assert.Equal(new Thickness(Graphite.FocusThickness), selectedRow.BorderThickness);

                var engineMapSelector = popupList.GetVisualDescendants().OfType<Button>()
                    .Single(button => string.Equals(button.Tag?.ToString(), "alert-selector:enginemap_change", StringComparison.Ordinal));
                engineMapSelector.Focus();
                Assert.Equal(Graphite.LineBrush, selectedRow.BorderBrush);
                Assert.Equal(new Thickness(1), selectedRow.BorderThickness);
                var engineMapRow = popupList.GetVisualDescendants().OfType<Border>()
                    .Single(border => string.Equals(border.Tag?.ToString(), "alert-row:enginemap_change", StringComparison.Ordinal));
                var rowPoint = PointInWindow(engineMapRow, window, 0.03, 0.5);
                window.MouseDown(rowPoint, MouseButton.Left, RawInputModifiers.LeftMouseButton);
                window.MouseUp(rowPoint, MouseButton.Left, RawInputModifiers.None);
                window.CaptureRenderedFrame();
                Assert.Contains(window.GetVisualDescendants().OfType<Border>(),
                    border => string.Equals(border.Tag?.ToString(), "alert-widget:enginemap_change", StringComparison.Ordinal));

                var absToggle = window.GetVisualDescendants().OfType<ToggleButton>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "alert-toggle:abs_change", StringComparison.Ordinal));
                var absWasEnabled = controller.IsAlertEnabled("abs_change");
                var absTogglePoint = PointInWindow(absToggle, window, 0.5, 0.5);
                window.MouseDown(absTogglePoint, MouseButton.Left, RawInputModifiers.LeftMouseButton);
                window.MouseUp(absTogglePoint, MouseButton.Left, RawInputModifiers.None);
                window.CaptureRenderedFrame();
                Assert.Equal(!absWasEnabled, controller.IsAlertEnabled("abs_change"));
                Assert.Contains(window.GetVisualDescendants().OfType<Border>(),
                    border => string.Equals(border.Tag?.ToString(), "alert-widget:enginemap_change", StringComparison.Ordinal));

                var engineMapToggle = window.GetVisualDescendants().OfType<ToggleButton>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "alert-toggle:enginemap_change", StringComparison.Ordinal));
                engineMapToggle.Focus();
                window.KeyPress(Key.Space, RawInputModifiers.None, PhysicalKey.Space, " ");
                window.KeyRelease(Key.Space, RawInputModifiers.None, PhysicalKey.Space, " ");
                Assert.False(controller.IsAlertEnabled("enginemap_change"));

                engineMapToggle = window.GetVisualDescendants().OfType<ToggleButton>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "alert-toggle:enginemap_change", StringComparison.Ordinal));
                engineMapToggle.Focus();
                window.KeyPress(Key.Space, RawInputModifiers.None, PhysicalKey.Space, " ");
                window.KeyRelease(Key.Space, RawInputModifiers.None, PhysicalKey.Space, " ");
                Assert.True(controller.IsAlertEnabled("enginemap_change"));

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Alerts_color_picker_lists_every_theme_as_a_labeled_button_with_an_indicator()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.DashLayouts.First(item => item.IsDefault);
                layout.AlertConfig = new DashAlertConfig { ColorToken = "blue" };
                var controller = new DashEditorController(layout, runtime.SaveDashLayout);
                controller.ApplyThemePreset(DashThemePresets.All.Single(preset => preset.Name == "Ice").Theme);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1440, Height = 900, Content = view };
                window.Show();

                window.GetVisualDescendants().OfType<Button>()
                    .First(button => string.Equals(button.Content?.ToString(), "Alerts", StringComparison.Ordinal))
                    .RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                var themeButtons = window.GetVisualDescendants().OfType<Button>()
                    .Where(button => button.Tag?.ToString()?.StartsWith("alert-color:", StringComparison.Ordinal) == true)
                    .ToArray();
                Assert.Equal(DashThemePresets.All.Count, themeButtons.Length);
                Assert.Equal(
                    DashThemePresets.All.Select(preset => preset.Name).ToArray(),
                    themeButtons.Select(button => button.GetVisualDescendants().OfType<TextBlock>().Single().Text!).ToArray());
                Assert.All(themeButtons, button => Assert.Single(
                    button.GetVisualDescendants().OfType<Border>(),
                    indicator => indicator.Tag?.ToString()?.StartsWith("alert-color-indicator:", StringComparison.Ordinal) == true));
                var iceButton = themeButtons.Single(
                    button => string.Equals(button.Tag?.ToString(), "alert-color:ice", StringComparison.Ordinal));
                Assert.Equal(new Thickness(2), iceButton.BorderThickness);
                Assert.Contains(
                    window.GetVisualDescendants().OfType<TextBlock>(),
                    text => text.Text?.StartsWith("Ice ·", StringComparison.Ordinal) == true);
                var graphiteIndicator = themeButtons
                    .Single(button => string.Equals(button.Tag?.ToString(), "alert-color:graphite", StringComparison.Ordinal))
                    .GetVisualDescendants().OfType<Border>()
                    .Single(indicator => string.Equals(indicator.Tag?.ToString(), "alert-color-indicator:graphite", StringComparison.Ordinal));
                Assert.Equal(Graphite.Green, Assert.IsAssignableFrom<ISolidColorBrush>(graphiteIndicator.Background).Color);
                var suzukiIndicator = themeButtons
                    .Single(button => string.Equals(button.Tag?.ToString(), "alert-color:suzuki", StringComparison.Ordinal))
                    .GetVisualDescendants().OfType<Border>()
                    .Single(indicator => string.Equals(indicator.Tag?.ToString(), "alert-color-indicator:suzuki", StringComparison.Ordinal));
                Assert.Equal(
                    Color.Parse(Graphite.DashThemeSuzukiPrimaryHex),
                    Assert.IsAssignableFrom<ISolidColorBrush>(suzukiIndicator.Background).Color);

                controller.SetAlertColorToken("yellow");
                window.CaptureRenderedFrame();
                var legacyColor = window.GetVisualDescendants().OfType<Border>()
                    .Single(control => string.Equals(control.Tag?.ToString(), "alert-color-legacy", StringComparison.Ordinal));
                Assert.Contains(
                    legacyColor.GetVisualDescendants().OfType<TextBlock>(),
                    text => string.Equals(text.Text, "Legacy color · Yellow", StringComparison.Ordinal));
                Assert.Equal(
                    Graphite.Accent,
                    Assert.IsAssignableFrom<ISolidColorBrush>(
                        legacyColor.GetVisualDescendants().OfType<Border>().Single().Background).Color);

                themeButtons = window.GetVisualDescendants().OfType<Button>()
                    .Where(button => button.Tag?.ToString()?.StartsWith("alert-color:", StringComparison.Ordinal) == true)
                    .ToArray();
                themeButtons.Single(button => string.Equals(button.Tag?.ToString(), "alert-color:suzuki", StringComparison.Ordinal))
                    .RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                Assert.Equal("suzuki", controller.AlertConfig.ColorToken);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Theme_settings_show_visual_presets_without_authoring_controls()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var controller = new DashEditorController(runtime.DashLayouts.First(item => item.IsDefault), runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => DashPreviewFrames.For(DashPreviewState.MidLap), () => { });
                var window = new Window { Width = 1440, Height = 900, Content = view };
                window.Show();

                window.GetVisualDescendants().OfType<Button>()
                    .First(button => string.Equals(button.Content?.ToString(), "Settings", StringComparison.Ordinal))
                    .RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();

                var labels = window.GetVisualDescendants().OfType<TextBlock>()
                    .Select(text => text.Text)
                    .Where(text => text is not null)
                    .ToHashSet(StringComparer.Ordinal);
                Assert.DoesNotContain("Color system", labels);
                Assert.DoesNotContain("Racing conditions", labels);
                Assert.DoesNotContain("Legacy authored accents", labels);

                var presets = window.GetVisualDescendants().OfType<Button>()
                    .Where(button => button.Tag?.ToString()?.StartsWith("theme-preset-", StringComparison.Ordinal) == true)
                    .ToArray();
                Assert.Equal(DashThemePresets.All.Count, presets.Length);
                Assert.All(presets, preset =>
                {
                    Assert.NotNull(preset.GetVisualDescendants().OfType<Image>().Single().Source);
                    Assert.Single(
                        preset.GetVisualDescendants().OfType<Border>(),
                        swatch => string.Equals(swatch.Tag?.ToString(), "theme-primary-swatch", StringComparison.Ordinal));
                });

                var graphite = presets.Single(
                    preset => string.Equals(preset.Tag?.ToString(), "theme-preset-graphite", StringComparison.Ordinal));
                var graphiteSwatch = graphite.GetVisualDescendants().OfType<Border>()
                    .Single(swatch => string.Equals(swatch.Tag?.ToString(), "theme-primary-swatch", StringComparison.Ordinal));
                Assert.Equal(Graphite.Text, Assert.IsAssignableFrom<ISolidColorBrush>(graphiteSwatch.Background).Color);

                var graphitePreview = Assert.IsType<WriteableBitmap>(
                    graphite.GetVisualDescendants().OfType<Image>().Single().Source);
                Assert.True(CountExact(graphitePreview, DashPalette.Default.RpmNormal) > 0);
                Assert.True(CountExact(graphitePreview, DashPalette.Default.RpmNearLimit) > 0);
                Assert.True(CountExact(graphitePreview, DashPalette.Default.RpmShift) > 0);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public async Task PersistenceFailureRendersRecoveryWithoutDiscardingTheEditor()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var fail = true;
                var controller = new DashEditorController(runtime.DashLayouts.First(item => item.IsDefault), _ =>
                {
                    if (fail)
                    {
                        throw new IOException("disk unavailable");
                    }
                });
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1200, Height = 800, Content = view };
                window.Show();

                controller.SetMode("advanced");
                window.CaptureRenderedFrame();
                Assert.Contains(window.GetVisualDescendants().OfType<TextBlock>(), text =>
                    string.Equals(text.Text, "Changes are retained in the editor. Retry saving.", StringComparison.Ordinal));
                var retry = window.GetVisualDescendants().OfType<Button>()
                    .First(button => string.Equals(button.Content?.ToString(), "Retry", StringComparison.Ordinal));

                fail = false;
                retry.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.CaptureRenderedFrame();
                Assert.DoesNotContain(window.GetVisualDescendants().OfType<TextBlock>(), text =>
                    string.Equals(text.Text, "Changes are retained in the editor. Retry saving.", StringComparison.Ordinal));
                Assert.True(controller.IsAdvancedMode);
                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static async Task RunGestureTest(Action<Window, DashEditorController, DashWidget> gesture)
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var widget = new DashWidget
                {
                    Id = "fuel",
                    Type = "fuel",
                    Col = 0,
                    Row = 0,
                    ColSpan = 4,
                    RowSpan = 2
                };
                var layout = new DashLayout
                {
                    Id = "gesture-layout",
                    Name = "Gesture Layout",
                    GridCols = 20,
                    GridRows = 12,
                    Pages =
                    [
                        new DashPage
                        {
                            Id = "main",
                            Name = "Main",
                            Widgets = [widget]
                        }
                    ]
                };
                var controller = new DashEditorController(layout, _ => { });
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });
                var window = new Window { Width = 1200, Height = 800, Content = view };
                window.Show();
                window.CaptureRenderedFrame();

                gesture(window, controller, widget);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static Border FindWidgetOverlay(Window window, string widgetId)
    {
        return window.GetVisualDescendants()
            .OfType<Border>()
            .First(border => string.Equals(border.Tag?.ToString(), widgetId, StringComparison.Ordinal));
    }

    private static Point PointInWindow(Control control, Window window, double xRatio, double yRatio)
    {
        var point = new Point(control.Bounds.Width * xRatio, control.Bounds.Height * yRatio);
        var translated = control.TranslatePoint(point, window);
        Assert.NotNull(translated);
        return translated.Value;
    }

    private static int CountExact(WriteableBitmap bitmap, SkiaSharp.SKColor expected)
    {
        using var buffer = bitmap.Lock();
        var bytes = new byte[buffer.RowBytes * bitmap.PixelSize.Height];
        Marshal.Copy(buffer.Address, bytes, 0, bytes.Length);
        var count = 0;
        for (var y = 0; y < bitmap.PixelSize.Height; y++)
        {
            for (var x = 0; x < bitmap.PixelSize.Width; x++)
            {
                var offset = y * buffer.RowBytes + x * 4;
                if (bytes[offset] == expected.Blue &&
                    bytes[offset + 1] == expected.Green &&
                    bytes[offset + 2] == expected.Red &&
                    bytes[offset + 3] == expected.Alpha)
                {
                    count++;
                }
            }
        }

        return count;
    }
}
