using Avalonia;
using Avalonia.Collections;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The three-pane dash editor (matrix 4.5 editor shell, WS6): a Figma-styled
/// widget palette (header, search, category cards), a live painter-rendered
/// canvas with grid drag-move/resize + a snapping ghost preview and selection,
/// a per-widget inspector, and a toolbar with segmented page tabs. All mutations
/// flow through <see cref="DashEditorController"/> so behaviour is covered by
/// controller unit tests; this class is the thin Avalonia view.
/// </summary>
public sealed class DashEditorView : UserControl
{
    private const int CanvasWidth = 700;
    private const int PaletteWidth = 240;
    private const int InspectorWidth = 240;

    // Palette layout mirrors docs/FIGMA_COMPONENTS.md "Editor Page": category
    // sections of 107x46 widget cards. Icons are two-letter monograms because the
    // Figma Tabler/Remix icon fonts are not bundled yet (see Known Deltas).
    private static readonly (string Category, string[] Types)[] PaletteGroups =
    {
        ("Driving", ["gear_speed", "rpm_bar", "input_trace", "tc"]),
        ("Timing", ["lap_time", "delta", "sector", "fuel"]),
        ("Status", ["header", "flag", "text", "tyre_temp"]),
    };

    private static readonly IReadOnlyDictionary<string, string> Glyphs =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["gear_speed"] = "GR",
            ["rpm_bar"] = "RP",
            ["input_trace"] = "IN",
            ["tc"] = "TC",
            ["lap_time"] = "LP",
            ["delta"] = "DL",
            ["sector"] = "SC",
            ["fuel"] = "FU",
            ["header"] = "HD",
            ["flag"] = "FL",
            ["text"] = "TX",
            ["tyre_temp"] = "TY",
        };

    private readonly DashEditorController _controller;
    private readonly AppSettings _settings;
    private readonly Func<TelemetryFrame> _frameProvider;
    private readonly Action _onClose;
    private Canvas _canvas = new();
    private Rectangle? _ghost;
    private StackPanel? _paletteCards;
    private string _search = string.Empty;
    private bool _renamingTitle;
    private string? _renamingPageId;
    private string? _confirmDeleteId;

    private string? _dragWidgetId;
    private bool _resizing;
    private int _resizeHx; // -1 left edge, +1 right edge, 0 none
    private int _resizeHy; // -1 top edge, +1 bottom edge, 0 none
    private Point _dragStart;
    private int _startCol;
    private int _startRow;
    private int _startColSpan;
    private int _startRowSpan;
    private string? _placingType; // palette widget being dragged onto the grid
    private string? _validationMessage;
    private bool _showGrid = true;
    private double _zoom = 1.0;
    private bool _showAlerts; // right panel shows the alerts editor instead of widget properties

    private static readonly double[] ZoomLevels = { 0.5, 0.75, 1.0, 1.25, 1.5 };

    // Change-alert types the tracker understands (DashAlertTracker), with UI labels.
    private static readonly (string Type, string Label)[] AlertTypes =
    {
        ("tc_change", "Traction control"),
        ("abs_change", "ABS"),
        ("enginemap_change", "Engine map"),
    };

    private bool IsIdleActive => ReferenceEquals(_controller.ActivePage, _controller.Layout.IdlePage);

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
        // The editor is keyboard-operable: Delete/Backspace removes the selected
        // widget. Focusable so it can receive key events once the canvas is clicked.
        Focusable = true;
        KeyDown += OnKeyDown;
        Rebuild();
    }

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        // Don't hijack keys while typing in a rename/search field.
        if (e.Source is TextBox)
        {
            return;
        }

        if ((e.Key is Key.Delete or Key.Back) && _controller.SelectedWidget is { } selected)
        {
            // First press arms the inspector's confirm; second removes. Mirrors the
            // old editor's delete-confirmation without a modal dialog.
            if (string.Equals(_confirmDeleteId, selected.Id, StringComparison.OrdinalIgnoreCase))
            {
                _confirmDeleteId = null;
                _controller.DeleteSelected();
            }
            else
            {
                _confirmDeleteId = selected.Id;
                Rebuild();
            }

            e.Handled = true;
        }
        else if (e.Key == Key.Escape && _confirmDeleteId is not null)
        {
            _confirmDeleteId = null;
            Rebuild();
            e.Handled = true;
        }
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
            ColumnDefinitions = new ColumnDefinitions($"{PaletteWidth},*,{InspectorWidth}"),
            Margin = new Thickness(16)
        };

        var toolbar = BuildToolbar();
        Grid.SetRow(toolbar, 0);
        Grid.SetColumnSpan(toolbar, 3);
        root.Children.Add(toolbar);

        var palette = BuildPalette();
        Grid.SetRow(palette, 1);
        Grid.SetColumn(palette, 0);
        palette.Margin = new Thickness(0, 0, 12, 0);
        root.Children.Add(palette);

        var canvasHost = BuildCanvas();
        Grid.SetRow(canvasHost, 1);
        Grid.SetColumn(canvasHost, 1);
        root.Children.Add(canvasHost);

        var inspector = _showAlerts ? BuildAlertsPanel() : BuildInspector();
        Grid.SetRow(inspector, 1);
        Grid.SetColumn(inspector, 2);
        inspector.Margin = new Thickness(12, 0, 0, 0);
        root.Children.Add(inspector);

        Content = root;
    }

    // ── Toolbar ───────────────────────────────────────────────────────────────

    private Control BuildToolbar()
    {
        var bar = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            VerticalAlignment = VerticalAlignment.Center
        };

        // Left zone: back icon-button + document title.
        var left = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, VerticalAlignment = VerticalAlignment.Center };
        var back = Graphite.Button("‹", ButtonTone.Neutral);
        back.Width = 28;
        back.MinHeight = 28;
        back.Padding = new Thickness(0);
        back.FontSize = 16;
        ToolTip.SetTip(back, "Back to dashes");
        back.Click += (_, _) => _onClose();
        left.Children.Add(back);
        left.Children.Add(BuildEditableTitle());
        left.Children.Add(BuildViewControls());
        Grid.SetColumn(left, 0);
        bar.Children.Add(left);

        // Center zone: segmented page tabs + add-page button.
        var center = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        center.Children.Add(BuildPageTabs());
        var addPage = Graphite.Button("＋", ButtonTone.Neutral);
        addPage.Width = 28;
        addPage.MinHeight = 28;
        addPage.Padding = new Thickness(0);
        ToolTip.SetTip(addPage, "Add page");
        addPage.Click += (_, _) => _controller.AddPage();
        center.Children.Add(addPage);
        Grid.SetColumn(center, 1);
        bar.Children.Add(center);

        // Right zone: page actions.
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
        var alerts = Graphite.Button("Alerts", _showAlerts ? ButtonTone.Primary : ButtonTone.Neutral);
        ToolTip.SetTip(alerts, "Configure change alerts");
        alerts.Click += (_, _) => { _showAlerts = !_showAlerts; Rebuild(); };
        actions.Children.Add(alerts);

        var clear = Graphite.Button("Clear page", ButtonTone.Neutral);
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

        var done = Graphite.Button("Done", ButtonTone.Primary);
        done.Click += (_, _) => _onClose();
        actions.Children.Add(done);
        Grid.SetColumn(actions, 2);
        bar.Children.Add(actions);

        return new Border
        {
            Background = Graphite.PanelBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusXl),
            Padding = new Thickness(8, 4),
            MinHeight = 41,
            Margin = new Thickness(0, 0, 0, 12),
            Child = bar
        };
    }

    // Editor header title — double-click to rename the whole dash layout.
    private Control BuildEditableTitle()
    {
        if (_renamingTitle)
        {
            return InlineRenameBox(_controller.Layout.Name, 180,
                committed =>
                {
                    _renamingTitle = false;
                    if (!_controller.RenameLayout(committed))
                    {
                        Rebuild();
                    }
                },
                () => { _renamingTitle = false; Rebuild(); });
        }

        var title = Graphite.TextBlock(_controller.Layout.Name, 13, FontWeight.SemiBold, Graphite.TextBrush);
        title.VerticalAlignment = VerticalAlignment.Center;
        var wrap = new Border { Child = title, Cursor = new Cursor(StandardCursorType.Hand), Padding = new Thickness(2, 0) };
        ToolTip.SetTip(wrap, "Double-click to rename");
        wrap.DoubleTapped += (_, _) => { _renamingTitle = true; Rebuild(); };
        return wrap;
    }

    // Shared transient rename field: commits on Enter/blur, cancels on Escape.
    private Control InlineRenameBox(string text, double width, Action<string> commit, Action cancel)
    {
        var box = new TextBox
        {
            Text = text,
            Width = width,
            FontFamily = Graphite.FontStack,
            FontSize = 13,
            MinHeight = 28,
            Padding = new Thickness(8, 2),
            VerticalAlignment = VerticalAlignment.Center
        };
        var done = false;
        void Commit()
        {
            if (done)
            {
                return;
            }

            done = true;
            commit(box.Text ?? string.Empty);
        }

        box.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter)
            {
                e.Handled = true;
                Commit();
            }
            else if (e.Key == Key.Escape)
            {
                e.Handled = true;
                done = true;
                cancel();
            }
        };
        box.LostFocus += (_, _) => Commit();
        box.AttachedToVisualTree += (_, _) =>
        {
            box.Focus();
            box.SelectAll();
        };
        return box;
    }

    // Grid show/hide toggle + canvas zoom stepper (editor view preferences).
    private Control BuildViewControls()
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 0, 0) };

        var gridBtn = Graphite.Button(string.Empty, ButtonTone.Ghost);
        gridBtn.Content = Icons.Create("layout-dashboard", 16, _showGrid ? Graphite.AccentBrush : Graphite.Text2Brush);
        gridBtn.Width = 30;
        gridBtn.MinHeight = 30;
        gridBtn.Padding = new Thickness(0);
        ToolTip.SetTip(gridBtn, _showGrid ? "Hide grid" : "Show grid");
        gridBtn.Click += (_, _) => { _showGrid = !_showGrid; Rebuild(); };
        row.Children.Add(gridBtn);

        var index = Array.IndexOf(ZoomLevels, _zoom);
        if (index < 0)
        {
            index = Array.IndexOf(ZoomLevels, 1.0);
        }

        var zoomOut = Graphite.Button("−", ButtonTone.Ghost);
        zoomOut.Width = 26;
        zoomOut.MinHeight = 28;
        zoomOut.Padding = new Thickness(0);
        ToolTip.SetTip(zoomOut, "Zoom out");
        zoomOut.Click += (_, _) => SetZoom(index - 1);
        row.Children.Add(zoomOut);

        var pct = Graphite.TextBlock($"{(int)Math.Round(_zoom * 100)}%", 12, FontWeight.SemiBold, Graphite.Text2Brush);
        pct.VerticalAlignment = VerticalAlignment.Center;
        pct.MinWidth = 40;
        pct.TextAlignment = TextAlignment.Center;
        row.Children.Add(pct);

        var zoomIn = Graphite.Button("+", ButtonTone.Ghost);
        zoomIn.Width = 26;
        zoomIn.MinHeight = 28;
        zoomIn.Padding = new Thickness(0);
        ToolTip.SetTip(zoomIn, "Zoom in");
        zoomIn.Click += (_, _) => SetZoom(index + 1);
        row.Children.Add(zoomIn);

        return row;
    }

    private void SetZoom(int index)
    {
        _zoom = ZoomLevels[Math.Clamp(index, 0, ZoomLevels.Length - 1)];
        Rebuild();
    }

    private Control BuildPageTabs()
    {
        var group = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2 };
        foreach (var tab in _controller.PageTabs)
        {
            if (!tab.IsIdle && string.Equals(tab.Id, _renamingPageId, StringComparison.OrdinalIgnoreCase))
            {
                group.Children.Add(InlineRenameBox(tab.Name, 96,
                    committed =>
                    {
                        _renamingPageId = null;
                        if (!_controller.RenamePage(tab.Id, committed))
                        {
                            Rebuild();
                        }
                    },
                    () => { _renamingPageId = null; Rebuild(); }));
                continue;
            }

            var active = string.Equals(tab.Id, _controller.ActivePageId, StringComparison.OrdinalIgnoreCase);
            var label = tab.IsIdle ? $"◐ {tab.Name}" : tab.Name;
            var item = SegmentedItem(label, active, () => _controller.SelectPage(tab.Id));
            if (!tab.IsIdle)
            {
                ToolTip.SetTip(item, "Double-click to rename");
                item.DoubleTapped += (_, _) => { _renamingPageId = tab.Id; Rebuild(); };
            }

            group.Children.Add(item);
        }

        return new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(4),
            Child = group
        };
    }

    private static Button SegmentedItem(string label, bool selected, Action onClick)
    {
        var button = new Button
        {
            Content = label,
            Background = selected ? Graphite.Panel3Brush : Brushes.Transparent,
            Foreground = selected ? Graphite.AccentBrush : Graphite.Text2Brush,
            BorderBrush = selected ? Graphite.AccentBrush : Brushes.Transparent,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            FontFamily = Graphite.FontStack,
            FontSize = 13,
            FontWeight = FontWeight.SemiBold,
            Padding = new Thickness(14, 4),
            MinHeight = 25,
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center
        };
        button.Click += (_, _) => onClick();
        return button;
    }

    // ── Palette ─────────────────────────────────────────────────────────────

    private Control BuildPalette()
    {
        var stack = new StackPanel { Spacing = 10 };

        var header = new StackPanel { Spacing = 2 };
        header.Children.Add(Graphite.TextBlock("WIDGETS", 12, FontWeight.SemiBold, Graphite.Text2Brush));
        header.Children.Add(Graphite.TextBlock("Click a widget to add it to the grid", 10, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        stack.Children.Add(header);

        var search = new TextBox
        {
            PlaceholderText = "Search widgets",
            Text = _search,
            FontFamily = Graphite.FontStack,
            FontSize = 13,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(10, 8),
            MinHeight = 32
        };
        search.TextChanged += (_, _) =>
        {
            _search = search.Text ?? string.Empty;
            RefreshPaletteCards();
        };
        stack.Children.Add(search);

        _paletteCards = new StackPanel { Spacing = 10 };
        stack.Children.Add(_paletteCards);
        RefreshPaletteCards();

        var scroller = new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };

        return new Border
        {
            Background = Graphite.PanelBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusXl),
            Padding = new Thickness(10),
            Child = scroller
        };
    }

    private void RefreshPaletteCards()
    {
        if (_paletteCards is null)
        {
            return;
        }

        _paletteCards.Children.Clear();
        var query = _search.Trim();

        foreach (var (category, types) in PaletteGroups)
        {
            var idleActive = IsIdleActive;
            var matches = types
                .Where(DashWidgetCatalog.IsKnown)
                .Select(DashWidgetCatalog.Get)
                .Where(def => !idleActive || def.IdleCapable) // idle page shows only idle-capable widgets
                .Where(def => query.Length == 0
                    || def.Name.Contains(query, StringComparison.OrdinalIgnoreCase)
                    || def.Type.Contains(query, StringComparison.OrdinalIgnoreCase)
                    || category.Contains(query, StringComparison.OrdinalIgnoreCase))
                .ToArray();

            if (matches.Length == 0)
            {
                continue;
            }

            _paletteCards.Children.Add(Graphite.SectionLabel(category));
            var grid = new WrapPanel { Orientation = Orientation.Horizontal };
            foreach (var def in matches)
            {
                grid.Children.Add(PaletteCard(def));
            }

            _paletteCards.Children.Add(grid);
        }

        if (_paletteCards.Children.Count == 0)
        {
            _paletteCards.Children.Add(Graphite.TextBlock("No widgets match your search.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        }
    }

    private Control PaletteCard(DashWidgetDefinition def)
    {
        var iconTile = new Border
        {
            Width = 22,
            Height = 22,
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            VerticalAlignment = VerticalAlignment.Center,
            Child = new TextBlock
            {
                Text = Glyph(def.Type),
                FontFamily = Graphite.FontStack,
                FontSize = 9,
                FontWeight = FontWeight.Bold,
                Foreground = Graphite.AccentBrush,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            }
        };

        var title = Graphite.TextBlock(def.Name, 11, FontWeight.SemiBold, Graphite.Text2Brush, TextWrapping.Wrap);
        title.VerticalAlignment = VerticalAlignment.Center;

        var content = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        content.Children.Add(iconTile);
        content.Children.Add(title);

        var card = new Border
        {
            Width = 104,
            Height = 46,
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Padding = new Thickness(8),
            Margin = new Thickness(0, 0, 6, 6),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = content
        };
        ToolTip.SetTip(card, $"Drag onto the grid, or click to place {def.Name}");
        card.PointerPressed += (_, e) =>
        {
            _placingType = def.Type;
            _validationMessage = null;
            e.Pointer.Capture(card);
            e.Handled = true;
        };
        card.PointerMoved += OnPlaceMoved;
        card.PointerReleased += OnPlaceReleased;
        return card;
    }

    // ── Palette drag-to-place ─────────────────────────────────────────────────

    private void OnPlaceMoved(object? sender, PointerEventArgs e)
    {
        if (_placingType is null)
        {
            return;
        }

        var pos = e.GetPosition(_canvas);
        var (colSpan, rowSpan) = _controller.DefaultSpan;
        if (!OverCanvas(pos))
        {
            RemoveGhost();
            e.Handled = true;
            return;
        }

        var col = Math.Clamp((int)(pos.X / CellW), 0, Math.Max(0, Cols - colSpan));
        var row = Math.Clamp((int)(pos.Y / CellH), 0, Math.Max(0, Rows - rowSpan));
        ShowGhost(col, row, colSpan, rowSpan, _controller.CanPlaceNew(col, row, colSpan, rowSpan));
        e.Handled = true;
    }

    private void OnPlaceReleased(object? sender, PointerReleasedEventArgs e)
    {
        if (_placingType is not { } type)
        {
            return;
        }

        _placingType = null;
        RemoveGhost();
        e.Pointer.Capture(null);

        var pos = e.GetPosition(_canvas);
        if (OverCanvas(pos))
        {
            var (colSpan, rowSpan) = _controller.DefaultSpan;
            var col = Math.Clamp((int)(pos.X / CellW), 0, Math.Max(0, Cols - colSpan));
            var row = Math.Clamp((int)(pos.Y / CellH), 0, Math.Max(0, Rows - rowSpan));
            if (!_controller.AddWidgetAt(type, col, row))
            {
                FlashValidation("That cell is occupied — drop onto free space.");
            }
        }
        else
        {
            // A plain click (released off the canvas) keeps the old auto-place behaviour.
            if (!_controller.AddWidget(type))
            {
                FlashValidation("No room left on this page for that widget.");
            }
        }

        e.Handled = true;
    }

    private bool OverCanvas(Point pos) => pos.X >= 0 && pos.Y >= 0 && pos.X <= CanvasWidth && pos.Y <= CanvasHeight;

    private static string Glyph(string type)
    {
        if (Glyphs.TryGetValue(type, out var glyph))
        {
            return glyph;
        }

        var cleaned = new string(type.Where(char.IsLetterOrDigit).ToArray());
        return (cleaned.Length >= 2 ? cleaned[..2] : cleaned).ToUpperInvariant();
    }

    // ── Canvas ──────────────────────────────────────────────────────────────

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
        _ghost = null;
        _canvas.PointerMoved += OnPointerMoved;
        _canvas.PointerReleased += OnPointerReleased;

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

        if (_showGrid)
        {
            _canvas.Children.Add(BuildGridOverlay());
        }

        if (page is not null)
        {
            foreach (var widget in page.Widgets)
            {
                _canvas.Children.Add(BuildWidgetOverlay(widget));
            }
        }

        var stage = new Border
        {
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Top,
            Child = _canvas
        };

        // Zoom scales the whole stage via layout (so the scroll viewport tracks the
        // scaled size); pointer math stays in unscaled canvas coordinates.
        Control staged = _zoom == 1.0
            ? stage
            : new LayoutTransformControl
            {
                LayoutTransform = new ScaleTransform(_zoom, _zoom),
                Child = stage,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top
            };

        // Keep the stage centered in a scrollable viewport so large grids remain usable.
        var viewport = new ScrollViewer
        {
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Content = new Border { Padding = new Thickness(0, 4, 0, 0), Child = staged }
        };

        if (_validationMessage is null)
        {
            return viewport;
        }

        // Explain a rejected move/resize/placement instead of silently dropping it.
        var banner = new Border
        {
            Background = Graphite.RedBgBrush,
            BorderBrush = Graphite.RedBorderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(12, 8),
            Margin = new Thickness(0, 0, 0, 8),
            Child = Graphite.TextBlock(_validationMessage, 12, FontWeight.SemiBold, Graphite.RedBrush, TextWrapping.Wrap)
        };

        var dock = new DockPanel { LastChildFill = true };
        DockPanel.SetDock(banner, Dock.Top);
        dock.Children.Add(banner);
        dock.Children.Add(viewport);
        return dock;
    }

    // Editor grid lines as a single hit-transparent geometry (toggled by _showGrid).
    private Control BuildGridOverlay()
    {
        var geometry = new StreamGeometry();
        using (var ctx = geometry.Open())
        {
            for (var c = 0; c <= Cols; c++)
            {
                ctx.BeginFigure(new Point(c * CellW, 0), isFilled: false);
                ctx.LineTo(new Point(c * CellW, CanvasHeight));
                ctx.EndFigure(isClosed: false);
            }

            for (var r = 0; r <= Rows; r++)
            {
                ctx.BeginFigure(new Point(0, r * CellH), isFilled: false);
                ctx.LineTo(new Point(CanvasWidth, r * CellH));
                ctx.EndFigure(isClosed: false);
            }
        }

        return new Avalonia.Controls.Shapes.Path
        {
            Data = geometry,
            Stroke = new SolidColorBrush(Graphite.Line, 0.5),
            StrokeThickness = 1,
            IsHitTestVisible = false
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
            var handles = new Grid();
            foreach (var (hx, hy) in new[] { (-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1) })
            {
                handles.Children.Add(ResizeHandle(widget, hx, hy));
            }

            overlay.Child = handles;
        }

        return overlay;
    }

    // A resize grip on one of the 8 edges/corners. hx/hy in {-1,0,1} pick which
    // edges move; corner handles move two edges at once.
    private Control ResizeHandle(DashWidget widget, int hx, int hy)
    {
        var handle = new Border
        {
            Width = 11,
            Height = 11,
            Background = Graphite.AccentBrush,
            CornerRadius = new CornerRadius(2),
            Margin = new Thickness(-2),
            HorizontalAlignment = hx < 0 ? HorizontalAlignment.Left : hx > 0 ? HorizontalAlignment.Right : HorizontalAlignment.Center,
            VerticalAlignment = hy < 0 ? VerticalAlignment.Top : hy > 0 ? VerticalAlignment.Bottom : VerticalAlignment.Center,
            Cursor = new Cursor(HandleCursor(hx, hy))
        };
        handle.PointerPressed += (_, e) => BeginResize(widget, hx, hy, e);
        handle.PointerMoved += OnPointerMoved;
        handle.PointerReleased += OnPointerReleased;
        return handle;
    }

    private static StandardCursorType HandleCursor(int hx, int hy) => (hx, hy) switch
    {
        (-1, -1) => StandardCursorType.TopLeftCorner,
        (0, -1) => StandardCursorType.TopSide,
        (1, -1) => StandardCursorType.TopRightCorner,
        (-1, 0) => StandardCursorType.LeftSide,
        (1, 0) => StandardCursorType.RightSide,
        (-1, 1) => StandardCursorType.BottomLeftCorner,
        (0, 1) => StandardCursorType.BottomSide,
        _ => StandardCursorType.BottomRightCorner
    };

    private void BeginMove(DashWidget widget, PointerPressedEventArgs e)
    {
        Focus(); // take keyboard focus so Delete/Backspace can target the selection
        _controller.SelectWidget(widget.Id);
        _dragWidgetId = widget.Id;
        _resizing = false;
        _resizeHx = 0;
        _resizeHy = 0;
        _validationMessage = null;
        _dragStart = e.GetPosition(this);
        _startCol = widget.Col;
        _startRow = widget.Row;
        _startColSpan = widget.ColSpan;
        _startRowSpan = widget.RowSpan;
        e.Pointer.Capture(_canvas);
        e.Handled = true;
    }

    private void BeginResize(DashWidget widget, int hx, int hy, PointerPressedEventArgs e)
    {
        Focus(); // take keyboard focus so Delete/Backspace can target the selection
        _controller.SelectWidget(widget.Id);
        _dragWidgetId = widget.Id;
        _resizing = true;
        _resizeHx = hx;
        _resizeHy = hy;
        _validationMessage = null;
        _dragStart = e.GetPosition(this);
        _startCol = widget.Col;
        _startRow = widget.Row;
        _startColSpan = widget.ColSpan;
        _startRowSpan = widget.RowSpan;
        e.Pointer.Capture(_canvas);
        e.Handled = true;
    }

    private void OnPointerMoved(object? sender, PointerEventArgs e)
    {
        if (_dragWidgetId is null)
        {
            return;
        }

        var widget = _controller.SelectedWidget;
        if (widget is null)
        {
            return;
        }

        var (col, row, colSpan, rowSpan) = PreviewGeometry(widget, e.GetPosition(this));
        var valid = _controller.CanPlace(widget, col, row, colSpan, rowSpan);
        ShowGhost(col, row, colSpan, rowSpan, valid);
        e.Handled = true;
    }

    private void OnPointerReleased(object? sender, PointerReleasedEventArgs e)
    {
        if (_dragWidgetId is null)
        {
            return;
        }

        RemoveGhost();

        var end = e.GetPosition(this);
        var dCol = (int)Math.Round((end.X - _dragStart.X) / CellW);
        var dRow = (int)Math.Round((end.Y - _dragStart.Y) / CellH);

        if (_resizing)
        {
            var (col, row, colSpan, rowSpan) = ResizeGeometry(dCol, dRow);
            if (col != _startCol || row != _startRow || colSpan != _startColSpan || rowSpan != _startRowSpan)
            {
                if (!_controller.ResizeSelectedTo(col, row, colSpan, rowSpan))
                {
                    FlashValidation("Can't resize there — it would overlap another widget.");
                }
            }
        }
        else if (dCol != 0 || dRow != 0)
        {
            if (!_controller.MoveSelected(_startCol + dCol, _startRow + dRow))
            {
                FlashValidation("Can't move there — it would overlap another widget.");
            }
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

    // Snaps the current pointer position to a grid-aligned target rectangle,
    // clamped inside the grid, for the live drag/resize ghost.
    private (int Col, int Row, int ColSpan, int RowSpan) PreviewGeometry(DashWidget widget, Point pointer)
    {
        var dCol = (int)Math.Round((pointer.X - _dragStart.X) / CellW);
        var dRow = (int)Math.Round((pointer.Y - _dragStart.Y) / CellH);

        if (_resizing)
        {
            return ResizeGeometry(dCol, dRow);
        }

        var col = Math.Clamp(_startCol + dCol, 0, Math.Max(0, Cols - widget.ColSpan));
        var row = Math.Clamp(_startRow + dRow, 0, Math.Max(0, Rows - widget.RowSpan));
        return (col, row, widget.ColSpan, widget.RowSpan);
    }

    // Resolve a grid rectangle for the active edge/corner resize. Left/top handles
    // move the origin as the span shrinks; all edges clamp to the grid and to a
    // minimum span of one cell.
    private (int Col, int Row, int ColSpan, int RowSpan) ResizeGeometry(int dCol, int dRow)
    {
        int col = _startCol, row = _startRow, colSpan = _startColSpan, rowSpan = _startRowSpan;

        if (_resizeHx > 0)
        {
            colSpan = Math.Clamp(_startColSpan + dCol, 1, Math.Max(1, Cols - _startCol));
        }
        else if (_resizeHx < 0)
        {
            col = Math.Clamp(_startCol + dCol, 0, _startCol + _startColSpan - 1);
            colSpan = _startCol + _startColSpan - col;
        }

        if (_resizeHy > 0)
        {
            rowSpan = Math.Clamp(_startRowSpan + dRow, 1, Math.Max(1, Rows - _startRow));
        }
        else if (_resizeHy < 0)
        {
            row = Math.Clamp(_startRow + dRow, 0, _startRow + _startRowSpan - 1);
            rowSpan = _startRow + _startRowSpan - row;
        }

        return (col, row, colSpan, rowSpan);
    }

    private void FlashValidation(string message)
    {
        _validationMessage = message;
        Rebuild();
    }

    private void ShowGhost(int col, int row, int colSpan, int rowSpan, bool valid)
    {
        _ghost ??= new Rectangle
        {
            IsHitTestVisible = false,
            StrokeThickness = 2,
            StrokeDashArray = new AvaloniaList<double> { 5, 4 },
            RadiusX = 6,
            RadiusY = 6
        };

        if (!_canvas.Children.Contains(_ghost))
        {
            _canvas.Children.Add(_ghost);
        }

        var color = valid ? Graphite.Accent : Graphite.Red;
        _ghost.Stroke = Graphite.Brush(color);
        _ghost.Fill = new SolidColorBrush(color, 0.16);
        _ghost.Width = Math.Max(1, colSpan * CellW);
        _ghost.Height = Math.Max(1, rowSpan * CellH);
        Canvas.SetLeft(_ghost, col * CellW);
        Canvas.SetTop(_ghost, row * CellH);
    }

    private void RemoveGhost()
    {
        if (_ghost is not null && _canvas.Children.Contains(_ghost))
        {
            _canvas.Children.Remove(_ghost);
        }
    }

    // ── Inspector ─────────────────────────────────────────────────────────────

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

        var confirming = _confirmDeleteId is not null && string.Equals(_confirmDeleteId, widget.Id, StringComparison.OrdinalIgnoreCase);
        var delete = Graphite.Button(confirming ? "Click again to confirm" : "Delete widget", ButtonTone.Danger);
        delete.HorizontalAlignment = HorizontalAlignment.Stretch;
        delete.Click += (_, _) =>
        {
            if (confirming)
            {
                _confirmDeleteId = null;
                _controller.DeleteSelected();
            }
            else
            {
                _confirmDeleteId = widget.Id;
                Rebuild();
            }
        };
        stack.Children.Add(delete);

        return Graphite.Card(stack);
    }

    // ── Alerts editor ─────────────────────────────────────────────────────────

    private Control BuildAlertsPanel()
    {
        var stack = new StackPanel { Spacing = 12 };
        stack.Children.Add(Graphite.SectionLabel("Alerts"));
        stack.Children.Add(Graphite.TextBlock(
            "Flash a banner on the dash when a control setting changes mid-session.",
            12, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));

        foreach (var (type, label) in AlertTypes)
        {
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
            var text = Graphite.TextBlock(label, 13, FontWeight.SemiBold, Graphite.Text2Brush);
            text.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(text, 0);
            row.Children.Add(text);

            // Toggle callback persists via the controller, which raises Changed → Rebuild.
            var toggle = Graphite.Toggle(_controller.IsAlertEnabled(type), on => _controller.SetAlert(type, on));
            Grid.SetColumn(toggle, 1);
            row.Children.Add(toggle);
            stack.Children.Add(row);
        }

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
