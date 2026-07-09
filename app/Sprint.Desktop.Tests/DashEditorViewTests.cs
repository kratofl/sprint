using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
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
    public async Task PageBarAddsANewPageFromTheEditor()
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

                // US31: the "Add page" control in the page bar creates a page. Found by
                // tooltip so it's unambiguous vs the canvas zoom "+" button.
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
}
