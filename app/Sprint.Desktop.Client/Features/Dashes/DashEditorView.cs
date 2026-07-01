using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The three-pane dash editor (matrix 4.5 editor shell, WS6): a searchable-ish
/// widget palette, a live painter-rendered canvas with grid drag-move/resize +
/// selection, a per-widget inspector, and page tabs (Idle + regular pages). All
/// mutations flow through <see cref="DashEditorController"/> so behaviour is
/// covered by controller unit tests; this class is the thin Avalonia view.
/// </summary>
public sealed class DashEditorView : UserControl
{
    private const int CanvasWidth = 700;

    private readonly DashEditorController _controller;
    private readonly AppSettings _settings;
    private readonly Func<TelemetryFrame> _frameProvider;
    private readonly Action _onClose;
    private Canvas _canvas = new();

    private string? _dragWidgetId;
    private bool _resizing;
    private Point _dragStart;
    private int _startCol;
    private int _startRow;
    private int _startColSpan;
    private int _startRowSpan;

    public DashEditorView(
        DashEditorController controller,
        AppSettings settings,
        Func<TelemetryFrame> frameProvider,
        Action onClose)
    {
        _controller = controller;
        _settings = settings;
        _frameProvider = frameProvider;
        _onClose = onClose;
        _controller.Changed += (_, _) => Rebuild();
        Rebuild();
    }

    private int Cols => Math.Max(1, _controller.Layout.GridCols);

    private int Rows => Math.Max(1, _controller.Layout.GridRows);

    // Clamp to >=1 so an extreme (validator-approved) aspect ratio can't round the
    // height to 0 and make the DashPainter constructor throw when the editor opens.
    private int CanvasHeight => Math.Max(1, (int)Math.Round((double)CanvasWidth * Rows / Cols));

    private double CellW => (double)CanvasWidth / Cols;

    private double CellH => (double)CanvasHeight / Rows;

    private void Rebuild()
    {
        var root = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,*"),
            ColumnDefinitions = new ColumnDefinitions("190,*,240"),
            Margin = new Thickness(16)
        };

        var toolbar = BuildToolbar();
        Grid.SetRow(toolbar, 0);
        Grid.SetColumnSpan(toolbar, 3);
        root.Children.Add(toolbar);

        var palette = BuildPalette();
        Grid.SetRow(palette, 1);
        Grid.SetColumn(palette, 0);
        root.Children.Add(palette);

        var canvasHost = BuildCanvas();
        Grid.SetRow(canvasHost, 1);
        Grid.SetColumn(canvasHost, 1);
        root.Children.Add(canvasHost);

        var inspector = BuildInspector();
        Grid.SetRow(inspector, 1);
        Grid.SetColumn(inspector, 2);
        root.Children.Add(inspector);

        Content = root;
    }

    private Control BuildToolbar()
    {
        var bar = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Margin = new Thickness(0, 0, 0, 12)
        };

        var tabs = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, VerticalAlignment = VerticalAlignment.Center };
        var heading = Graphite.TextBlock($"Editing “{_controller.Layout.Name}”", 15, FontWeight.Bold, Graphite.TextBrush);
        heading.Margin = new Thickness(0, 0, 12, 0);
        tabs.Children.Add(heading);

        foreach (var tab in _controller.PageTabs)
        {
            var active = string.Equals(tab.Id, _controller.ActivePageId, StringComparison.OrdinalIgnoreCase);
            var button = Graphite.Button(tab.IsIdle ? $"◐ {tab.Name}" : tab.Name, active ? ButtonTone.Primary : ButtonTone.Ghost);
            button.Click += (_, _) => _controller.SelectPage(tab.Id);
            tabs.Children.Add(button);
        }

        var addPage = Graphite.Button("＋ Page", ButtonTone.Ghost);
        addPage.Click += (_, _) => _controller.AddPage();
        tabs.Children.Add(addPage);
        Grid.SetColumn(tabs, 0);
        bar.Children.Add(tabs);

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right };
        var clear = Graphite.Button("Clear page", ButtonTone.Ghost);
        clear.Click += (_, _) => _controller.ClearActivePage();
        actions.Children.Add(clear);

        var activeTab = _controller.PageTabs.FirstOrDefault(t => string.Equals(t.Id, _controller.ActivePageId, StringComparison.OrdinalIgnoreCase));
        if (activeTab is { IsIdle: false })
        {
            var delete = Graphite.Button("Delete page", ButtonTone.Danger);
            delete.IsEnabled = _controller.Layout.Pages.Count > 1;
            delete.Click += (_, _) => _controller.DeletePage(activeTab.Id);
            actions.Children.Add(delete);
        }

        var back = Graphite.Button("Done", ButtonTone.Primary);
        back.Click += (_, _) => _onClose();
        actions.Children.Add(back);
        Grid.SetColumn(actions, 1);
        bar.Children.Add(actions);

        return bar;
    }

    private Control BuildPalette()
    {
        var stack = new StackPanel { Spacing = 6 };
        stack.Children.Add(Graphite.SectionLabel("Add Widget"));
        foreach (var definition in DashWidgetCatalog.All.OrderBy(d => d.Name, StringComparer.OrdinalIgnoreCase))
        {
            var button = Graphite.Button(definition.Name, ButtonTone.Neutral);
            button.HorizontalContentAlignment = HorizontalAlignment.Left;
            button.Click += (_, _) => _controller.AddWidget(definition.Type);
            stack.Children.Add(button);
        }

        return Graphite.Card(new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }, new Thickness(12));
    }

    private Control BuildCanvas()
    {
        // Fresh canvas per rebuild — reusing one instance would re-parent a control
        // that the previous (not-yet-detached) content tree still owns.
        _canvas = new Canvas
        {
            Width = CanvasWidth,
            Height = CanvasHeight,
            Background = Graphite.Panel2Brush,
            ClipToBounds = true
        };

        var page = _controller.ActivePage;
        var isIdle = page is not null && ReferenceEquals(page, _controller.Layout.IdlePage);

        var bitmap = DashImageRenderer.Render(
            _controller.Layout,
            _frameProvider(),
            _settings,
            CanvasWidth,
            CanvasHeight,
            pageId: isIdle ? null : _controller.ActivePageId,
            idle: isIdle);

        var background = new Image { Width = CanvasWidth, Height = CanvasHeight, Source = bitmap, Stretch = Stretch.Fill };
        _canvas.Children.Add(background);

        if (page is not null)
        {
            foreach (var widget in page.Widgets)
            {
                _canvas.Children.Add(BuildWidgetOverlay(widget));
            }
        }

        return new Border
        {
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Top,
            Child = _canvas
        };
    }

    private Control BuildWidgetOverlay(DashWidget widget)
    {
        var selected = string.Equals(widget.Id, _controller.SelectedWidgetId, StringComparison.OrdinalIgnoreCase);
        var overlay = new Border
        {
            Width = Math.Max(1, widget.ColSpan * CellW),
            Height = Math.Max(1, widget.RowSpan * CellH),
            Background = selected ? new SolidColorBrush(Graphite.Accent, 0.14) : Brushes.Transparent,
            BorderBrush = selected ? Graphite.AccentBrush : Graphite.Line2Brush,
            BorderThickness = new Thickness(selected ? 2 : 1),
            Cursor = new Cursor(StandardCursorType.SizeAll),
            Tag = widget.Id
        };
        Canvas.SetLeft(overlay, widget.Col * CellW);
        Canvas.SetTop(overlay, widget.Row * CellH);

        overlay.PointerPressed += (_, e) => BeginMove(widget, e);
        overlay.PointerMoved += OnPointerMoved;
        overlay.PointerReleased += OnPointerReleased;

        if (selected)
        {
            var grip = new Border
            {
                Width = 14,
                Height = 14,
                Background = Graphite.AccentBrush,
                CornerRadius = new CornerRadius(3),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Bottom,
                Cursor = new Cursor(StandardCursorType.BottomRightCorner)
            };
            grip.PointerPressed += (_, e) => BeginResize(widget, e);
            grip.PointerMoved += OnPointerMoved;
            grip.PointerReleased += OnPointerReleased;
            overlay.Child = grip;
        }

        return overlay;
    }

    private void BeginMove(DashWidget widget, PointerPressedEventArgs e)
    {
        _controller.SelectWidget(widget.Id);
        _dragWidgetId = widget.Id;
        _resizing = false;
        _dragStart = e.GetPosition(_canvas);
        _startCol = widget.Col;
        _startRow = widget.Row;
        e.Pointer.Capture((IInputElement?)e.Source);
        e.Handled = true;
    }

    private void BeginResize(DashWidget widget, PointerPressedEventArgs e)
    {
        _controller.SelectWidget(widget.Id);
        _dragWidgetId = widget.Id;
        _resizing = true;
        _dragStart = e.GetPosition(_canvas);
        _startColSpan = widget.ColSpan;
        _startRowSpan = widget.RowSpan;
        e.Pointer.Capture((IInputElement?)e.Source);
        e.Handled = true;
    }

    private void OnPointerMoved(object? sender, PointerEventArgs e)
    {
        // Live ghosting is applied on release via the reducer; keeping the move
        // handler cheap avoids per-pixel layout churn on the whole tree.
    }

    private void OnPointerReleased(object? sender, PointerReleasedEventArgs e)
    {
        if (_dragWidgetId is null)
        {
            return;
        }

        var end = e.GetPosition(_canvas);
        var dCol = (int)Math.Round((end.X - _dragStart.X) / CellW);
        var dRow = (int)Math.Round((end.Y - _dragStart.Y) / CellH);

        if (_resizing)
        {
            if (dCol != 0 || dRow != 0)
            {
                _controller.ResizeSelected(_startColSpan + dCol, _startRowSpan + dRow);
            }
        }
        else if (dCol != 0 || dRow != 0)
        {
            _controller.MoveSelected(_startCol + dCol, _startRow + dRow);
        }
        else
        {
            // A click without movement just keeps the selection; force a repaint of handles.
            Rebuild();
        }

        _dragWidgetId = null;
        _resizing = false;
        e.Pointer.Capture(null);
        e.Handled = true;
    }

    private Control BuildInspector()
    {
        var stack = new StackPanel { Spacing = 10 };
        stack.Children.Add(Graphite.SectionLabel("Properties"));

        var widget = _controller.SelectedWidget;
        if (widget is null)
        {
            stack.Children.Add(Graphite.TextBlock("Select a widget on the canvas to edit its position and size, or add one from the palette.",
                12, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
            return Graphite.Card(stack);
        }

        var definition = DashWidgetCatalog.IsKnown(widget.Type) ? DashWidgetCatalog.Get(widget.Type).Name : widget.Type;
        stack.Children.Add(Graphite.TextBlock(definition, 15, FontWeight.Bold, Graphite.TextBrush));
        stack.Children.Add(Graphite.TextBlock($"id: {widget.Id}", 11, FontWeight.Normal, Graphite.Text3Brush));

        stack.Children.Add(StepperRow("Column", widget.Col,
            () => _controller.MoveSelected(widget.Col - 1, widget.Row),
            () => _controller.MoveSelected(widget.Col + 1, widget.Row)));
        stack.Children.Add(StepperRow("Row", widget.Row,
            () => _controller.MoveSelected(widget.Col, widget.Row - 1),
            () => _controller.MoveSelected(widget.Col, widget.Row + 1)));
        stack.Children.Add(StepperRow("Width", widget.ColSpan,
            () => _controller.ResizeSelected(widget.ColSpan - 1, widget.RowSpan),
            () => _controller.ResizeSelected(widget.ColSpan + 1, widget.RowSpan)));
        stack.Children.Add(StepperRow("Height", widget.RowSpan,
            () => _controller.ResizeSelected(widget.ColSpan, widget.RowSpan - 1),
            () => _controller.ResizeSelected(widget.ColSpan, widget.RowSpan + 1)));

        var delete = Graphite.Button("Delete widget", ButtonTone.Danger);
        delete.HorizontalAlignment = HorizontalAlignment.Stretch;
        delete.Click += (_, _) => _controller.DeleteSelected();
        stack.Children.Add(delete);

        return Graphite.Card(stack);
    }

    private static Control StepperRow(string label, int value, Action decrement, Action increment)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var text = Graphite.TextBlock(label, 12, FontWeight.SemiBold, Graphite.Text2Brush);
        text.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);

        var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, HorizontalAlignment = HorizontalAlignment.Right };
        controls.Children.Add(Stepper("−", decrement));
        var valueBox = new Border
        {
            MinWidth = 34,
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(6),
            Padding = new Thickness(8, 4),
            Child = Graphite.TextBlock(value.ToString(), 12, FontWeight.Bold, Graphite.TextBrush)
        };
        controls.Children.Add(valueBox);
        controls.Children.Add(Stepper("＋", increment));
        Grid.SetColumn(controls, 1);
        grid.Children.Add(controls);
        return grid;
    }

    private static Button Stepper(string label, Action action)
    {
        var button = Graphite.Button(label, ButtonTone.Ghost);
        button.Width = 28;
        button.MinHeight = 28;
        button.Padding = new Thickness(0);
        button.Click += (_, _) => action();
        return button;
    }
}
