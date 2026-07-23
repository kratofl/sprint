using Avalonia;
using Avalonia.Automation;
using Avalonia.Collections;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;
using Avalonia.Controls.Templates;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The three-pane dash editor: a compact searchable widget palette with
/// disclosure groups, a live painter-rendered
/// canvas with grid drag-move/resize + a snapping ghost preview and selection,
/// a per-widget inspector, a Pages/Widgets sidebar, and focused toolbar. All mutations
/// flow through <see cref="DashEditorController"/> so behaviour is covered by
/// controller unit tests; this class is the thin Avalonia view.
/// </summary>
public sealed class DashEditorView : UserControl
{
    private const int StandardCanvasWidth = 560;
    private const int CompactCanvasWidth = 528;
    private const int PaletteWidth = 220;
    private const int CompactPaletteWidth = 204;
    private const int PaletteCollapsedWidth = 44;
    private const int InspectorWidth = 284;
    private const int CompactInspectorWidth = 272;
    private const int CompactLayoutThreshold = 1080;

    // Palette live-preview thumbnail dimensions. A widget is painted alone in a
    // 1x1 grid at this size, so the card shows the real on-wheel rendering.
    private const int PreviewWidth = 200;
    private const int PreviewHeight = 40;
    private const int ThemePreviewWidth = 240;
    private const int ThemePreviewHeight = 144;
    private const int AlertListWidth = 184;
    private const int CompactAlertListWidth = 152;

    private static readonly (string Category, string[] Types)[] PaletteGroups =
    {
        ("Driving", ["gear_speed", "rpm_bar", "input_trace", "tc", "abs", "engine_map", "brake_bias", "ers"]),
        ("Timing", ["lap_time", "delta", "predictive_lap", "sector", "fuel", "fuel_target"]),
        ("Race", ["position", "gaps"]),
        ("Status", ["header", "flag", "text", "tyre_temp", "tyre_pressure"]),
    };

    private readonly DashEditorController _controller;
    private readonly AppSettings _settings;
    private readonly Func<TelemetryFrame> _frameProvider;
    private readonly Action _onClose;
    private Canvas _canvas = new();
    private Canvas _alertCanvas = new();
    private Rectangle? _ghost;
    private StackPanel? _paletteCards;
    private string _search = string.Empty;
    private string? _renamingPageId;
    private bool _renamingStackName;
    private string? _renamingLayerId;
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
    private bool _showGrid;
    private double _zoom = 1.0;
    private EditorPanel _panel = EditorPanel.Inspector; // which surface the right column shows
    private bool _paletteCollapsed; // left rail collapsed to a narrow strip
    private bool _compactLayout;
    private SidebarSurface _sidebarSurface = SidebarSurface.Widgets;
    private string _selectedAlertType = "tc_change";
    private string? _dragAlertType;
    private bool _resizingAlert;
    private Point _alertDragStart;
    private int _alertStartCol;
    private int _alertStartRow;
    private int _alertStartColSpan;
    private int _alertStartRowSpan;
    private int _alertPreviewCol;
    private int _alertPreviewRow;
    private int _alertPreviewColSpan;
    private int _alertPreviewRowSpan;

    // Painter-rendered palette thumbnails, cached per widget type. Previews reflect
    // the frame captured on first render (illustrative, not a live 30Hz feed), so a
    // keystroke in search or a rebuild does not re-run SkiaSharp per card.
    private readonly Dictionary<string, WriteableBitmap> _previewCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _expandedPaletteCategories = new(StringComparer.OrdinalIgnoreCase) { "Driving" };

    // Reusable render targets for the two per-rebuild surfaces (canvas + alert preview).
    // Rebuild fires on every edit, so we render into these in place (via DashImageRenderer
    // .Copy) instead of allocating a fresh WriteableBitmap per keystroke — that repeated
    // allocation was the native-resource leak. We deliberately do NOT dispose these on
    // detach: Avalonia's deferred renderer can paint one more frame from the outgoing tree
    // after OnDetachedFromVisualTree, and disposing here throws ObjectDisposedException
    // mid-render. Reuse keeps the live set to two bitmaps; the finalizer reclaims them.
    private WriteableBitmap? _canvasBitmap;
    private WriteableBitmap? _alertPreviewBitmap;

    private static readonly double[] ZoomLevels = { 0.5, 0.75, 1.0, 1.25, 1.5 };

    // Change-alert types the tracker understands (DashAlertTracker), with UI labels.
    private static readonly (string Type, string Label)[] AlertTypes =
    {
        ("tc_change", "TC"),
        ("abs_change", "ABS"),
        ("enginemap_change", "ENGINE MAP"),
    };

    private bool IsIdleActive => ReferenceEquals(_controller.ActivePage, _controller.Layout.IdlePage);

    private enum EditorPanel
    {
        Inspector,
        Alerts,
        Theme,
    }

    private enum SidebarSurface
    {
        Pages,
        Widgets,
    }

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
        SizeChanged += (_, _) => UpdateResponsiveLayout();
        Rebuild();
    }

    private void UpdateResponsiveLayout()
    {
        var compact = Bounds.Width > 0 && Bounds.Width < CompactLayoutThreshold;
        if (compact == _compactLayout)
        {
            return;
        }

        _compactLayout = compact;
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

    private int CanvasWidth => _compactLayout ? CompactCanvasWidth : StandardCanvasWidth;

    // The canvas takes the target screen's TRUE pixel aspect (US16), not the grid's
    // cols/rows ratio, so what the user designs is pixel-faithful to the wheel — the
    // same DashPainter renders the editor bitmap and the hardware frame at this shape.
    // Clamp to >=1 so an extreme (validator-approved) aspect can't round the height to
    // 0 and make the DashPainter constructor throw when the editor opens.
    private int CanvasHeight => Math.Max(1, (int)Math.Round(CanvasWidth / _controller.TargetProfile.AspectRatio));

    private double CellW => (double)CanvasWidth / Cols;

    private double CellH => (double)CanvasHeight / Rows;

    private void Rebuild()
    {
        var paletteColumn = _paletteCollapsed
            ? PaletteCollapsedWidth
            : _compactLayout ? CompactPaletteWidth : PaletteWidth;
        var inspectorColumn = _compactLayout ? CompactInspectorWidth : InspectorWidth;
        var root = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,*"),
            ColumnDefinitions = _panel == EditorPanel.Inspector
                ? new ColumnDefinitions($"{paletteColumn},*,{inspectorColumn}")
                : new ColumnDefinitions("*"),
            Margin = new Thickness(0, 8, 8, 8)
        };

        var toolbar = BuildToolbarArea();
        Grid.SetRow(toolbar, 0);
        Grid.SetColumnSpan(toolbar, _panel == EditorPanel.Inspector ? 3 : 1);
        root.Children.Add(toolbar);

        if (_panel != EditorPanel.Inspector)
        {
            var tabSurface = _panel == EditorPanel.Alerts ? BuildAlertsPanel() : BuildThemePanel();
            Grid.SetRow(tabSurface, 1);
            Grid.SetColumn(tabSurface, 0);
            root.Children.Add(tabSurface);
            Content = root;
            return;
        }

        var palette = _paletteCollapsed ? BuildCollapsedPalette() : BuildPalette();
        Grid.SetRow(palette, 1);
        Grid.SetColumn(palette, 0);
        palette.Margin = new Thickness(0, 0, 8, 0);
        root.Children.Add(palette);

        var center = new Grid { RowDefinitions = new RowDefinitions("*") };
        var canvasHost = BuildCanvas();
        Grid.SetRow(canvasHost, 0);
        center.Children.Add(canvasHost);

        Grid.SetRow(center, 1);
        Grid.SetColumn(center, 1);
        root.Children.Add(center);

        var inspector = BuildInspector();
        Grid.SetRow(inspector, 1);
        Grid.SetColumn(inspector, 2);
        inspector.Margin = new Thickness(8, 0, 0, 0);
        root.Children.Add(inspector);

        Content = root;
    }

    // ── Toolbar ───────────────────────────────────────────────────────────────

    private Control BuildToolbarArea()
    {
        var stack = new StackPanel { Spacing = 6 };
        stack.Children.Add(BuildToolbar());
        if (_controller.HasPersistenceFailure)
        {
            var recovery = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), ColumnSpacing = 10 };
            recovery.Children.Add(Graphite.TextBlock(
                _controller.PersistenceMessage ?? "Changes are retained in the editor. Retry saving.",
                11,
                FontWeight.Medium,
                Graphite.RedBrush));
            var retry = Graphite.Button("Retry", ButtonTone.Neutral);
            retry.Click += (_, _) => _controller.RetryPersistence();
            Grid.SetColumn(retry, 1);
            recovery.Children.Add(retry);
            stack.Children.Add(new Border
            {
                Background = Graphite.RedBgBrush,
                BorderBrush = Graphite.RedBorderBrush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(Graphite.RadiusControl),
                Padding = new Thickness(10, 7),
                Child = recovery,
            });
        }

        return stack;
    }

    private Control BuildToolbar()
    {
        var bar = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            RowDefinitions = new RowDefinitions(_compactLayout ? "Auto,Auto" : "Auto"),
            RowSpacing = _compactLayout ? 6 : 0,
            MinHeight = 36,
            VerticalAlignment = VerticalAlignment.Center
        };

        // Left zone: back icon-button + document title.
        var left = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, VerticalAlignment = VerticalAlignment.Center };
        var back = Graphite.ChromeIconButton("chevron-left", "Back to dashes", _onClose);
        left.Children.Add(back);
        left.Children.Add(BuildEditableTitle());
        Grid.SetColumn(left, 0);
        bar.Children.Add(left);

        // Center zone: screenshot Tab View for the editor surface.
        var center = new StackPanel
        {
            Tag = "editor-panel-tabs",
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        center.Children.Add(Graphite.TabView(new[] { "Layout", "Alerts", "Settings" }, _panel switch
        {
            EditorPanel.Alerts => 1,
            EditorPanel.Theme => 2,
            _ => 0,
        }, index =>
        {
            _panel = index switch
            {
                1 => EditorPanel.Alerts,
                2 => EditorPanel.Theme,
                _ => EditorPanel.Inspector,
            };
            Rebuild();
        }));
        Grid.SetColumn(center, _compactLayout ? 0 : 1);
        if (_compactLayout)
        {
            Grid.SetRow(center, 1);
            Grid.SetColumnSpan(center, 3);
        }

        bar.Children.Add(center);

        // Right zone: target size, preview state, and the explicit hardware action.
        // Page navigation already has one dedicated strip above the canvas; do not
        // duplicate it with a second inert Pages/Widgets segmented control.
        var actions = new StackPanel
        {
            Tag = "editor-toolbar-actions",
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center,
        };
        var mode = Graphite.Segmented(["Basic", "Advanced"], _controller.IsAdvancedMode ? 1 : 0,
            index => _controller.SetMode(index == 1 ? "advanced" : "basic"));
        ToolTip.SetTip(mode, "Basic: direct editing and essential settings. Advanced: exact grid, styles, and widget stacks.");
        actions.Children.Add(mode);
        actions.Children.Add(BuildTargetSizeSelector());
        actions.Children.Add(BuildPreviewSelector());
        // Apply-to-screen is honest about hardware: enabled only when a screen is assigned
        // to this dash, dimmed and self-explaining via tooltip otherwise (US34).
        var apply = _controller.ApplyAvailability;
        var applyButton = Graphite.Button("Apply", ButtonTone.Primary);
        applyButton.Tag = "apply-to-screen";
        ToolTip.SetTip(applyButton, apply.Summary);
        applyButton.Click += (_, _) => _controller.RequestApplyToScreen();
        applyButton.IsEnabled = apply.CanApply;
        applyButton.Opacity = apply.CanApply ? 1.0 : 0.4;
        actions.Children.Add(applyButton);

        Grid.SetColumn(actions, 2);
        bar.Children.Add(actions);

        bar.Margin = new Thickness(8, 0, 0, 8);
        return bar;
    }

    // Target wheel-screen size selector: retargets the dash (change-size / refit) so
    // the canvas matches the hardware the design will run on (US15/US16/US17).
    private Control BuildTargetSizeSelector()
    {
        var profiles = _controller.AvailableProfiles;
        var combo = Graphite.ComboBox(profiles.Select(profile => profile.Name), _controller.TargetProfile.Name, 150);
        ToolTip.SetTip(combo, "Target wheel-screen size");
        combo.SelectionChanged += (_, _) =>
        {
            var chosen = profiles.FirstOrDefault(profile => string.Equals(profile.Name, combo.SelectedItem?.ToString(), StringComparison.Ordinal));
            if (chosen is not null)
            {
                _controller.SetTargetProfile(chosen);
            }
        };
        return combo;
    }

    // Preview-states menu: overrides the canvas frame with a simulated state so a
    // dash can be verified in every condition without a live session (US26).
    private Control BuildPreviewSelector()
    {
        var menu = DashPreviewFrames.Menu;
        var combo = Graphite.ComboBox(menu.Select(item => item.Label), menu.First(item => item.State == _controller.PreviewState).Label, 120);
        ToolTip.SetTip(combo, "Preview a dash state");
        combo.SelectionChanged += (_, _) =>
        {
            var chosen = menu.FirstOrDefault(item => string.Equals(item.Label, combo.SelectedItem?.ToString(), StringComparison.Ordinal));
            if (!string.IsNullOrEmpty(chosen.Label))
            {
                _controller.SelectPreviewState(chosen.State);
            }
        };
        return combo;
    }

    // The dash name is always presented as an input so editability is self-evident.
    private Control BuildEditableTitle()
    {
        var box = new TextBox
        {
            Text = _controller.Layout.Name,
            Width = 180,
            MinHeight = 30,
            Padding = new Thickness(8, 0),
            FontFamily = Graphite.FontStackMedium,
            FontSize = 13,
            VerticalContentAlignment = VerticalAlignment.Center,
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Tag = "dash-name-editor",
        };
        void Commit() => _controller.RenameLayout(box.Text ?? string.Empty);
        box.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter)
            {
                Commit();
                e.Handled = true;
            }
        };
        box.LostFocus += (_, _) => Commit();
        ToolTip.SetTip(box, "Dashboard name — editable");
        return box;
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

    // ── Palette ─────────────────────────────────────────────────────────────

    private Control BuildPalette()
    {
        var stack = new StackPanel { Spacing = 12 };

        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var headerText = new StackPanel { Spacing = 2 };
        headerText.Children.Add(Graphite.TextBlock("Dashboard", 14, FontWeight.Medium, Graphite.TextBrush));
        headerText.Children.Add(Graphite.TextBlock(_sidebarSurface == SidebarSurface.Pages ? "Organize screen pages" : "Drag or click to add", 10, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        Grid.SetColumn(headerText, 0);
        header.Children.Add(headerText);
        var collapse = Graphite.Button(string.Empty, ButtonTone.Ghost);
        collapse.Content = Icons.Create("chevron-left", 14, Graphite.Text3Brush);
        collapse.Width = 24;
        collapse.MinHeight = 24;
        collapse.Padding = new Thickness(0);
        ToolTip.SetTip(collapse, "Collapse widget panel");
        collapse.Click += (_, _) => { _paletteCollapsed = true; Rebuild(); };
        Grid.SetColumn(collapse, 1);
        header.Children.Add(collapse);
        stack.Children.Add(header);

        var surfaceSwitcher = Graphite.Segmented(["Pages", "Widgets"], _sidebarSurface == SidebarSurface.Pages ? 0 : 1, index =>
        {
            _sidebarSurface = index == 0 ? SidebarSurface.Pages : SidebarSurface.Widgets;
            Rebuild();
        }, stretch: true);
        surfaceSwitcher.Tag = "palette-surface-switcher";
        stack.Children.Add(surfaceSwitcher);

        if (_sidebarSurface == SidebarSurface.Pages)
        {
            stack.Children.Add(BuildPagesSidebar());
            return PaletteSurface(stack);
        }

        var search = new TextBox
        {
            PlaceholderText = "Search widgets",
            Text = _search,
            FontFamily = Graphite.FontStack,
            FontSize = 13,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(0, 0, 0, 1),
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

        if (_controller.IsAdvancedMode)
        {
            var addStack = Graphite.Button("+  Widget stack", ButtonTone.Neutral);
            addStack.HorizontalAlignment = HorizontalAlignment.Stretch;
            addStack.Click += (_, _) => _controller.AddWidgetStack();
            stack.Children.Add(addStack);
        }

        var scroller = new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };

        return PaletteSurface(scroller);
    }

    private static Border PaletteSurface(Control child) => new()
    {
        Background = Graphite.PanelBrush,
        BorderBrush = Graphite.LineBrush,
        BorderThickness = new Thickness(0, 0, 1, 0),
        CornerRadius = new CornerRadius(0),
        Padding = new Thickness(14, 12),
        Child = child,
    };

    private Control BuildPagesSidebar()
    {
        var pages = new StackPanel { Spacing = 4 };
        foreach (var tab in _controller.PageTabs)
        {
            pages.Children.Add(PageSidebarRow(tab));
        }

        var add = Graphite.Button("+  Add page", ButtonTone.Neutral);
        add.HorizontalAlignment = HorizontalAlignment.Stretch;
        add.Margin = new Thickness(0, 6, 0, 0);
        ToolTip.SetTip(add, "Add page");
        add.Click += (_, _) => _controller.AddPage();
        pages.Children.Add(add);
        return new ScrollViewer { Content = pages, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    }

    private Control PageSidebarRow(DashPageTab tab)
    {
        var active = string.Equals(tab.Id, _controller.ActivePageId, StringComparison.OrdinalIgnoreCase);
        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,32") };
        Control select;
        if (!tab.IsIdle && string.Equals(_renamingPageId, tab.Id, StringComparison.OrdinalIgnoreCase))
        {
            select = InlineRenameBox(tab.Name, 130,
                committed =>
                {
                    _renamingPageId = null;
                    if (!_controller.RenamePage(tab.Id, committed)) Rebuild();
                },
                () => { _renamingPageId = null; Rebuild(); });
        }
        else
        {
            var selectButton = Graphite.Button(tab.IsIdle ? $"◐  {tab.Name}" : tab.Name, active ? ButtonTone.Neutral : ButtonTone.Ghost);
            selectButton.HorizontalContentAlignment = HorizontalAlignment.Left;
            selectButton.Background = active ? Graphite.Panel3Brush : Brushes.Transparent;
            selectButton.Click += (_, _) => _controller.SelectPage(tab.Id);
            if (!tab.IsIdle)
            {
                ToolTip.SetTip(selectButton, "Double-click to rename page");
                selectButton.DoubleTapped += (_, _) => { _renamingPageId = tab.Id; Rebuild(); };
            }
            select = selectButton;
        }

        Grid.SetColumn(select, 0);
        row.Children.Add(select);

        if (!tab.IsIdle && _controller.PageTabs.Count(item => !item.IsIdle) > 1)
        {
            var delete = Graphite.Button("×", ButtonTone.Ghost);
            delete.Width = 28;
            delete.MinHeight = 28;
            delete.Padding = new Thickness(0);
            delete.Tag = $"delete-page:{tab.Id}";
            AutomationProperties.SetName(delete, $"Delete {tab.Name} page");
            ToolTip.SetTip(delete, $"Delete {tab.Name}");
            delete.Click += (_, _) => _controller.DeletePage(tab.Id);
            Grid.SetColumn(delete, 1);
            row.Children.Add(delete);
        }

        return new Border { Background = active ? Graphite.Panel2Brush : Brushes.Transparent, CornerRadius = new CornerRadius(Graphite.RadiusMd), Child = row };
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

            var expanded = query.Length > 0 || _expandedPaletteCategories.Contains(category);
            var categoryHeader = new Button
            {
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                CornerRadius = new CornerRadius(Graphite.RadiusSm),
                Padding = new Thickness(4, 6),
                MinHeight = 30,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                Cursor = new Cursor(StandardCursorType.Hand),
                Tag = $"palette-category:{category}",
            };
            var categoryContent = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto") };
            categoryContent.Children.Add(Graphite.TextBlock(category, 12, FontWeight.Medium, Graphite.TextBrush));
            var count = Graphite.TextBlock(matches.Length.ToString(), 11, FontWeight.Normal, Graphite.Text3Brush);
            Grid.SetColumn(count, 1);
            categoryContent.Children.Add(count);
            var chevron = Icons.Create(expanded ? "chevron-down" : "chevron-right", 11, Graphite.Text3Brush);
            chevron.Margin = new Thickness(8, 0, 0, 0);
            Grid.SetColumn(chevron, 2);
            categoryContent.Children.Add(chevron);
            categoryHeader.Content = categoryContent;
            categoryHeader.Click += (_, _) =>
            {
                if (!_expandedPaletteCategories.Add(category))
                {
                    _expandedPaletteCategories.Remove(category);
                }

                RefreshPaletteCards();
            };
            _paletteCards.Children.Add(categoryHeader);

            if (!expanded)
            {
                continue;
            }

            var list = new StackPanel { Spacing = 2 };
            foreach (var def in matches)
            {
                list.Children.Add(PaletteCard(def));
            }

            _paletteCards.Children.Add(list);
        }

        if (_paletteCards.Children.Count == 0)
        {
            _paletteCards.Children.Add(Graphite.TextBlock("No widgets match your search.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        }
    }

    private Control PaletteCard(DashWidgetDefinition def)
    {
        var icon = Icons.Create(WidgetIcon(def.Type), 13, Graphite.AccentBrush);

        var title = Graphite.TextBlock(def.Name, 12, FontWeight.Normal, Graphite.Text2Brush);
        title.TextTrimming = TextTrimming.CharacterEllipsis;

        var content = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 9, VerticalAlignment = VerticalAlignment.Center };
        content.Children.Add(icon);
        content.Children.Add(title);

        var card = new Border
        {
            Background = Brushes.Transparent,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(8, 6),
            MinHeight = 32,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            Cursor = new Cursor(StandardCursorType.Hand),
            Tag = $"palette:{def.Type}",
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

    private static string WidgetIcon(string type) => type switch
    {
        "gear_speed" => "gauge",
        "rpm_bar" => "bolt",
        "input_trace" => "activity",
        "tc" => "adjustments",
        "abs" => "circle-check",
        "engine_map" => "settings",
        "brake_bias" => "adjustments",
        "lap_time" => "clock",
        "delta" => "activity",
        "sector" => "route",
        "fuel" or "fuel_target" => "droplet",
        "header" => "layout-dashboard",
        "flag" => "flag",
        "text" => "letter-case",
        "tyre_temp" => "temperature",
        _ => "layout-dashboard",
    };

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

    // Paints a single widget alone in a 1x1 grid so the palette card shows the real
    // on-wheel rendering. Cached per type (see _previewCache) — the current frame is
    // sampled once, keeping search/rebuild cheap.
    private WriteableBitmap WidgetPreview(string type)
    {
        if (_previewCache.TryGetValue(type, out var cached))
        {
            return cached;
        }

        var layout = new DashLayout
        {
            Id = "palette-preview",
            Name = "preview",
            GridCols = 1,
            GridRows = 1,
            Pages =
            {
                new DashPage
                {
                    Id = "preview",
                    Name = "preview",
                    Widgets = { new DashWidget { Id = $"preview-{type}", Type = type, Col = 0, Row = 0, ColSpan = 1, RowSpan = 1 } },
                },
            },
        };

        var bitmap = DashImageRenderer.Render(layout, _frameProvider(), _settings, PreviewWidth, PreviewHeight, pageId: "preview", palette: DashPalette.FromLayout(_controller.Layout));
        _previewCache[type] = bitmap;
        return bitmap;
    }

    // ── Collapsed palette ─────────────────────────────────────────────────────

    // The narrow strip shown when the widget rail is collapsed: an expand button and
    // a rotated section label, giving the canvas more room while keeping the affordance.
    private Control BuildCollapsedPalette()
    {
        var expand = Graphite.Button(string.Empty, ButtonTone.Ghost);
        expand.Content = Icons.Create("chevron-right", 16, Graphite.Text2Brush);
        expand.Width = 28;
        expand.MinHeight = 28;
        expand.Padding = new Thickness(0);
        ToolTip.SetTip(expand, "Show widget panel");
        expand.Click += (_, _) => { _paletteCollapsed = false; Rebuild(); };

        var label = new TextBlock
        {
            Text = "WIDGETS",
            FontFamily = Graphite.CondensedFontStack,
            FontSize = 12,
            FontWeight = FontWeight.SemiBold,
            Foreground = Graphite.Text3Brush,
        };
        var rotated = new LayoutTransformControl
        {
            LayoutTransform = new RotateTransform(-90),
            Child = label,
            HorizontalAlignment = HorizontalAlignment.Center,
        };

        var column = new StackPanel { Spacing = 14, HorizontalAlignment = HorizontalAlignment.Center };
        column.Children.Add(expand);
        column.Children.Add(Icons.Create("layout-sidebar", 18, Graphite.Text3Brush));
        column.Children.Add(rotated);

        return new Border
        {
            Background = Graphite.PanelBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusXl),
            Padding = new Thickness(6, 10),
            Child = column,
        };
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

        _canvasBitmap = DashImageRenderer.RenderReusing(
            _canvasBitmap,
            _controller.Layout,
            _controller.ResolveRenderFrame(_frameProvider()),
            _settings,
            CanvasWidth,
            CanvasHeight,
            pageId: isIdle ? null : _controller.ActivePageId,
            idle: isIdle,
            palette: DashPalette.FromLayout(_controller.Layout));
        _canvas.Children.Add(new Image { Width = CanvasWidth, Height = CanvasHeight, Source = _canvasBitmap, Stretch = Stretch.Fill });

        if (_showGrid && _controller.IsAdvancedMode)
        {
            _canvas.Children.Add(BuildGridOverlay());
        }

        if (page is not null)
        {
            foreach (var widget in page.Widgets)
            {
                _canvas.Children.Add(BuildWidgetOverlay(widget));
            }

            foreach (var widgetStack in page.WidgetStacks.Where(_ => _controller.IsAdvancedMode))
            {
                _canvas.Children.Add(BuildStackOverlay(widgetStack));
            }
        }

        var stage = new Border
        {
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
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
            Content = new Border { Padding = new Thickness(0), Child = staged }
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

    private Control BuildGridOverlay()
    {
        var dots = new Canvas
        {
            Width = CanvasWidth,
            Height = CanvasHeight,
            IsHitTestVisible = false
        };

        const double spacing = 26;
        for (var x = spacing; x < CanvasWidth; x += spacing)
        {
            for (var y = spacing; y < CanvasHeight; y += spacing)
            {
                var dot = new Ellipse
                {
                    Width = 3,
                    Height = 3,
                    Fill = new SolidColorBrush(Graphite.Line2, 0.42),
                    IsHitTestVisible = false
                };
                Canvas.SetLeft(dot, x - 1.5);
                Canvas.SetTop(dot, y - 1.5);
                dots.Children.Add(dot);
            }
        }

        return dots;
    }

    private Control BuildWidgetOverlay(DashWidget widget)
    {
        var selected = string.Equals(widget.Id, _controller.SelectedWidgetId, StringComparison.OrdinalIgnoreCase);
        var overlay = new Border
        {
            Width = Math.Max(1, widget.ColSpan * CellW),
            Height = Math.Max(1, widget.RowSpan * CellH),
            Background = selected ? new SolidColorBrush(Graphite.Accent, 0.07) : Brushes.Transparent,
            BorderBrush = selected ? Graphite.AccentBrush : Brushes.Transparent,
            BorderThickness = new Thickness(selected ? 2 : 0),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            Cursor = new Cursor(StandardCursorType.SizeAll),
            Tag = widget.Id
        };
        Canvas.SetLeft(overlay, widget.Col * CellW);
        Canvas.SetTop(overlay, widget.Row * CellH);

        overlay.PointerPressed += (_, e) => BeginMove(widget, e);
        overlay.PointerMoved += OnPointerMoved;
        overlay.PointerReleased += OnPointerReleased;

        var content = new Grid();
        if (selected)
        {
            var label = DashWidgetCatalog.IsKnown(widget.Type) ? DashWidgetCatalog.Get(widget.Type).Name : widget.Type;
            content.Children.Add(new Border
            {
                Background = Graphite.AccentBrush,
                CornerRadius = new CornerRadius(Graphite.RadiusXs),
                Padding = new Thickness(5, 1),
                Margin = new Thickness(3),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Child = Graphite.TextBlock(label, 9, FontWeight.Medium, Graphite.Panel2Brush, TextWrapping.NoWrap),
            });
        }

        if (selected)
        {
            var handles = new Grid();
            foreach (var (hx, hy) in new[] { (-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1) })
            {
                handles.Children.Add(ResizeHandle(widget, hx, hy));
            }

            content.Children.Add(handles);
        }

        overlay.Child = content;
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

    // Selection + label overlay for a widget stack region. Stacks render their
    // content into the background bitmap; this overlay adds click-to-select and a
    // corner tag. Blue (informational/advanced) distinguishes it from ember widgets.
    private Control BuildStackOverlay(DashWidgetStack widgetStack)
    {
        var selected = string.Equals(widgetStack.Id, _controller.SelectedStackId, StringComparison.OrdinalIgnoreCase);
        var overlay = new Border
        {
            Width = Math.Max(1, widgetStack.ColSpan * CellW),
            Height = Math.Max(1, widgetStack.RowSpan * CellH),
            Background = selected ? new SolidColorBrush(Graphite.Blue, 0.10) : Brushes.Transparent,
            BorderBrush = selected ? Graphite.BlueBrush : Graphite.Line2Brush,
            BorderThickness = new Thickness(selected ? 2 : 1),
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        Canvas.SetLeft(overlay, widgetStack.Col * CellW);
        Canvas.SetTop(overlay, widgetStack.Row * CellH);

        var activeLayerName = widgetStack.Layers.FirstOrDefault(l => string.Equals(l.Id, widgetStack.DefaultLayerId, StringComparison.OrdinalIgnoreCase))?.Name
            ?? widgetStack.Layers.FirstOrDefault()?.Name ?? string.Empty;
        overlay.Child = new Border
        {
            Background = selected ? Graphite.BlueBrush : Graphite.Panel3Brush,
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            Padding = new Thickness(6, 2),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(3),
            Child = new TextBlock
            {
                Text = widgetStack.Layers.Count > 1 ? $"⊞ {widgetStack.Name} · {activeLayerName}" : $"⊞ {widgetStack.Name}",
                FontFamily = Graphite.FontStack,
                FontSize = 10,
                FontWeight = FontWeight.SemiBold,
                Foreground = selected ? Graphite.Panel2Brush : Graphite.Text2Brush,
            },
        };

        overlay.PointerPressed += (_, e) =>
        {
            Focus();
            _controller.SelectStack(widgetStack.Id);
            e.Handled = true;
        };
        return overlay;
    }

    // ── Inspector ─────────────────────────────────────────────────────────────

    private Control BuildInspector()
    {
        // A selected stack takes over the inspector with its own layer editor.
        if (_controller.SelectedStack is { } selectedStack)
        {
            return BuildStackInspector(selectedStack);
        }

        var stack = new StackPanel { Spacing = 12 };
        stack.Children.Add(Graphite.TextBlock("Properties", 14, FontWeight.Medium, Graphite.TextBrush));

        var widget = _controller.SelectedWidget;
        if (widget is null)
        {
            stack.Children.Add(Graphite.TextBlock("Select a widget on the canvas to edit its position, configuration, and style.",
                11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
            stack.Children.Add(Graphite.TextBlock("Drag a widget from the palette to place another block.",
                11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
            return EditorPanelSurface(stack);
        }

        var definition = DashWidgetCatalog.IsKnown(widget.Type) ? DashWidgetCatalog.Get(widget.Type).Name : widget.Type;
        stack.Children.Add(Graphite.TextBlock(definition, 15, FontWeight.Bold, Graphite.TextBrush));
        stack.Children.Add(Graphite.TextBlock($"id: {widget.Id}", 11, FontWeight.Normal, Graphite.Text3Brush));

        if (_controller.IsAdvancedMode)
        {
            stack.Children.Add(Divider());
            stack.Children.Add(Graphite.SectionLabel("Exact layout"));
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
        }

        // Per-widget configuration (type-specific fields, e.g. text content/binding).
        var config = DashWidgetCatalog.IsKnown(widget.Type) ? DashWidgetCatalog.Get(widget.Type).Config : [];
        if (config.Count > 0)
        {
            stack.Children.Add(Divider());
            stack.Children.Add(Graphite.SectionLabel("Configuration"));
            foreach (var field in config)
            {
                stack.Children.Add(ConfigField(field));
            }
        }

        // Per-widget style overrides (colours + border).
        if (_controller.IsAdvancedMode)
        {
            stack.Children.Add(Divider());
            stack.Children.Add(BuildStyleSection());
        }

        stack.Children.Add(Divider());
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

        // The inspector can outgrow the column once config + style are shown; scroll it.
        return EditorPanelSurface(new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
    }

    private static Border EditorPanelSurface(Control child)
    {
        return new Border
        {
            Background = Graphite.PanelBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1, 0, 0, 0),
            CornerRadius = new CornerRadius(0),
            Padding = new Thickness(16, 12),
            Child = child,
        };
    }

    private static Control Divider() => new Border
    {
        Height = 1,
        Background = Graphite.LineBrush,
        Margin = new Thickness(0, 2),
        HorizontalAlignment = HorizontalAlignment.Stretch,
    };

    // ── Widget-stack inspector ────────────────────────────────────────────────

    private Control BuildStackInspector(DashWidgetStack widgetStack)
    {
        var content = new StackPanel { Spacing = 10 };
        content.Children.Add(Graphite.SectionLabel("Widget stack"));
        content.Children.Add(StackNameRow(widgetStack));

        content.Children.Add(StepperRow("Column", widgetStack.Col,
            () => _controller.MoveStack(widgetStack.Col - 1, widgetStack.Row),
            () => _controller.MoveStack(widgetStack.Col + 1, widgetStack.Row)));
        content.Children.Add(StepperRow("Row", widgetStack.Row,
            () => _controller.MoveStack(widgetStack.Col, widgetStack.Row - 1),
            () => _controller.MoveStack(widgetStack.Col, widgetStack.Row + 1)));
        content.Children.Add(StepperRow("Width", widgetStack.ColSpan,
            () => _controller.ResizeStack(widgetStack.ColSpan - 1, widgetStack.RowSpan),
            () => _controller.ResizeStack(widgetStack.ColSpan + 1, widgetStack.RowSpan)));
        content.Children.Add(StepperRow("Height", widgetStack.RowSpan,
            () => _controller.ResizeStack(widgetStack.ColSpan, widgetStack.RowSpan - 1),
            () => _controller.ResizeStack(widgetStack.ColSpan, widgetStack.RowSpan + 1)));

        content.Children.Add(Divider());
        content.Children.Add(Graphite.SectionLabel("Layers"));
        content.Children.Add(Graphite.TextBlock("★ marks the layer shown on the wheel. Click a layer to edit its widgets.",
            11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        foreach (var layer in widgetStack.Layers)
        {
            content.Children.Add(LayerRow(widgetStack, layer));
        }

        var addLayer = Graphite.Button("＋  Add layer", ButtonTone.Neutral);
        addLayer.HorizontalAlignment = HorizontalAlignment.Stretch;
        addLayer.Click += (_, _) => _controller.AddStackLayer();
        content.Children.Add(addLayer);

        content.Children.Add(Divider());
        var activeLayer = _controller.ActiveLayer;
        content.Children.Add(Graphite.TextBlock(
            activeLayer is null ? "No layer selected" : $"Widgets in “{activeLayer.Name}”",
            11, FontWeight.SemiBold, Graphite.Text2Brush, TextWrapping.Wrap));
        if (activeLayer is not null)
        {
            content.Children.Add(AddToLayerRow());
            foreach (var widget in activeLayer.Widgets)
            {
                content.Children.Add(LayerWidgetRow(widget));
            }

            if (activeLayer.Widgets.Count == 0)
            {
                content.Children.Add(Graphite.TextBlock("Empty layer — add a widget above.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
            }
        }

        content.Children.Add(Divider());
        var delete = Graphite.Button("Delete stack", ButtonTone.Danger);
        delete.HorizontalAlignment = HorizontalAlignment.Stretch;
        delete.Click += (_, _) => _controller.DeleteSelectedStack();
        content.Children.Add(delete);

        return EditorPanelSurface(new ScrollViewer { Content = content, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
    }

    private Control StackNameRow(DashWidgetStack widgetStack)
    {
        if (_renamingStackName)
        {
            return InlineRenameBox(widgetStack.Name, 200,
                committed =>
                {
                    _renamingStackName = false;
                    if (!_controller.RenameStack(committed))
                    {
                        Rebuild();
                    }
                },
                () => { _renamingStackName = false; Rebuild(); });
        }

        var text = Graphite.TextBlock(widgetStack.Name, 15, FontWeight.Bold, Graphite.TextBrush);
        var wrap = new Border { Child = text, Cursor = new Cursor(StandardCursorType.Hand), Padding = new Thickness(2, 0) };
        ToolTip.SetTip(wrap, "Double-click to rename");
        wrap.DoubleTapped += (_, _) => { _renamingStackName = true; Rebuild(); };
        return wrap;
    }

    private Control LayerRow(DashWidgetStack widgetStack, DashWidgetStackLayer layer)
    {
        var isActive = string.Equals(layer.Id, _controller.ActiveLayer?.Id, StringComparison.OrdinalIgnoreCase);
        var isDefault = string.Equals(layer.Id, widgetStack.DefaultLayerId, StringComparison.OrdinalIgnoreCase);
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto") };

        var defaultToggle = Graphite.Button(isDefault ? "★" : "☆", ButtonTone.Ghost);
        defaultToggle.Width = 26;
        defaultToggle.MinHeight = 26;
        defaultToggle.Padding = new Thickness(0);
        defaultToggle.Foreground = isDefault ? Graphite.AccentBrush : Graphite.Text3Brush;
        ToolTip.SetTip(defaultToggle, isDefault ? "Default layer (shown on the wheel)" : "Set as default layer");
        defaultToggle.Click += (_, _) => _controller.SetDefaultStackLayer(layer.Id);
        Grid.SetColumn(defaultToggle, 0);
        grid.Children.Add(defaultToggle);

        Control nameControl;
        if (string.Equals(_renamingLayerId, layer.Id, StringComparison.OrdinalIgnoreCase))
        {
            nameControl = InlineRenameBox(layer.Name, 120,
                committed =>
                {
                    _renamingLayerId = null;
                    if (!_controller.RenameStackLayer(layer.Id, committed))
                    {
                        Rebuild();
                    }
                },
                () => { _renamingLayerId = null; Rebuild(); });
        }
        else
        {
            var label = Graphite.TextBlock(layer.Name, 13, isActive ? FontWeight.SemiBold : FontWeight.Normal, isActive ? Graphite.BlueBrush : Graphite.Text2Brush);
            label.VerticalAlignment = VerticalAlignment.Center;
            var wrap = new Border { Child = label, Cursor = new Cursor(StandardCursorType.Hand), Padding = new Thickness(6, 2), Background = Brushes.Transparent };
            ToolTip.SetTip(wrap, "Click to edit this layer, double-click to rename");
            wrap.PointerPressed += (_, _) => _controller.SelectStackLayer(layer.Id);
            wrap.DoubleTapped += (_, _) => { _renamingLayerId = layer.Id; Rebuild(); };
            nameControl = wrap;
        }

        Grid.SetColumn(nameControl, 1);
        grid.Children.Add(nameControl);

        var count = Graphite.TextBlock(layer.Widgets.Count.ToString(), 11, FontWeight.Normal, Graphite.Text3Brush);
        count.VerticalAlignment = VerticalAlignment.Center;
        count.Margin = new Thickness(6, 0);
        Grid.SetColumn(count, 2);
        grid.Children.Add(count);

        var delete = Graphite.Button("✕", ButtonTone.Ghost);
        delete.Width = 26;
        delete.MinHeight = 26;
        delete.Padding = new Thickness(0);
        delete.IsEnabled = widgetStack.Layers.Count > 1;
        ToolTip.SetTip(delete, "Delete layer");
        delete.Click += (_, _) => _controller.DeleteStackLayer(layer.Id);
        Grid.SetColumn(delete, 3);
        grid.Children.Add(delete);

        return new Border
        {
            Padding = new Thickness(4, 2),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            Background = isActive ? Graphite.Panel2Brush : Brushes.Transparent,
            Child = grid,
        };
    }

    private Control AddToLayerRow()
    {
        var combo = new ComboBox { FontFamily = Graphite.FontStack, FontSize = 13, MinHeight = 32, HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var definition in DashWidgetCatalog.All.OrderBy(d => d.Name, StringComparer.Ordinal))
        {
            combo.Items.Add(new ComboBoxItem { Content = definition.Name, Tag = definition.Type });
        }

        combo.SelectedIndex = 0;

        var add = Graphite.Button("Add", ButtonTone.Primary);
        add.Click += (_, _) =>
        {
            if (combo.SelectedItem is ComboBoxItem { Tag: string type } && !_controller.AddWidgetToActiveLayer(type))
            {
                FlashValidation("No room in this layer for that widget.");
            }
        };

        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        Grid.SetColumn(combo, 0);
        grid.Children.Add(combo);
        add.Margin = new Thickness(6, 0, 0, 0);
        Grid.SetColumn(add, 1);
        grid.Children.Add(add);
        return grid;
    }

    private Control LayerWidgetRow(DashWidget widget)
    {
        var name = DashWidgetCatalog.IsKnown(widget.Type) ? DashWidgetCatalog.Get(widget.Type).Name : widget.Type;
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var label = Graphite.TextBlock(name, 12, FontWeight.Normal, Graphite.Text2Brush);
        label.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(label, 0);
        grid.Children.Add(label);

        var delete = Graphite.Button("✕", ButtonTone.Ghost);
        delete.Width = 26;
        delete.MinHeight = 26;
        delete.Padding = new Thickness(0);
        delete.Click += (_, _) => _controller.DeleteLayerWidget(widget.Id);
        Grid.SetColumn(delete, 1);
        grid.Children.Add(delete);
        return new Border { Padding = new Thickness(4, 1), Child = grid };
    }

    // ── Per-widget config fields ──────────────────────────────────────────────

    private Control ConfigField(DashConfigDef field)
    {
        var current = _controller.GetSelectedConfig(field.Key);
        var input = field.Kind == DashConfigKind.Select ? ConfigSelect(field, current) : ConfigText(field, current);

        var col = new StackPanel { Spacing = 4 };
        col.Children.Add(Graphite.TextBlock(field.Label, 11, FontWeight.Normal, Graphite.Text2Brush));
        col.Children.Add(input);
        return col;
    }

    private Control ConfigText(DashConfigDef field, string current)
    {
        var box = new TextBox
        {
            Text = current,
            FontFamily = Graphite.FontStack,
            FontSize = 13,
            MinHeight = 32,
            Padding = new Thickness(10, 6),
        };

        // Commit on Enter/blur rather than per keystroke, so persistence + rebuild
        // don't fire (and drop focus) mid-typing.
        var committed = false;
        void Commit()
        {
            if (committed)
            {
                return;
            }

            committed = true;
            _controller.SetSelectedConfig(field.Key, box.Text ?? string.Empty);
        }

        box.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter)
            {
                e.Handled = true;
                Commit();
            }
        };
        box.LostFocus += (_, _) => Commit();
        return box;
    }

    private Control ConfigSelect(DashConfigDef field, string current)
    {
        var combo = new ComboBox
        {
            FontFamily = Graphite.FontStack,
            FontSize = 13,
            MinHeight = 32,
            HorizontalAlignment = HorizontalAlignment.Stretch,
        };

        var selectedIndex = 0;
        for (var i = 0; i < field.Options.Count; i++)
        {
            var option = field.Options[i];
            combo.Items.Add(new ComboBoxItem { Content = option.Label, Tag = option.Value });
            if (string.Equals(option.Value, current, StringComparison.Ordinal))
            {
                selectedIndex = i;
            }
        }

        combo.SelectedIndex = selectedIndex;
        // Subscribe after setting the index so the initial selection doesn't persist on every rebuild.
        combo.SelectionChanged += (_, _) =>
        {
            if (combo.SelectedItem is ComboBoxItem { Tag: string value })
            {
                _controller.SetSelectedConfig(field.Key, value);
            }
        };
        return combo;
    }

    // ── Per-widget style ──────────────────────────────────────────────────────

    private Control BuildStyleSection()
    {
        var style = _controller.SelectedStyle;
        var stack = new StackPanel { Spacing = 10 };
        stack.Children.Add(Graphite.SectionLabel("Style"));
        stack.Children.Add(ColorRow("Text color", style.TextColor, token => _controller.SetSelectedTextColor(token)));
        stack.Children.Add(ColorRow("Label color", style.LabelColor, token => _controller.SetSelectedLabelColor(token)));

        var borderCol = new StackPanel { Spacing = 4 };
        borderCol.Children.Add(Graphite.TextBlock("Border", 11, FontWeight.Normal, Graphite.Text2Brush));
        var selectedBorder = style.Border is null ? 0 : style.Border.Value ? 1 : 2;
        borderCol.Children.Add(Graphite.Segmented(["Default", "On", "Off"], selectedBorder,
            index => _controller.SetSelectedBorder(index switch { 1 => true, 2 => false, _ => null })));
        stack.Children.Add(borderCol);
        return stack;
    }

    private Control ColorRow(string label, string? current, Action<string?> onPick)
    {
        var col = new StackPanel { Spacing = 4 };
        col.Children.Add(Graphite.TextBlock(label, 11, FontWeight.Normal, Graphite.Text2Brush));

        var swatches = new WrapPanel { Orientation = Orientation.Horizontal };
        swatches.Children.Add(Swatch("Default", null, current is null, onPick));
        foreach (var token in DashPalette.StyleColorTokens)
        {
            swatches.Children.Add(Swatch(token, token, string.Equals(token, current, StringComparison.OrdinalIgnoreCase), onPick));
        }

        col.Children.Add(swatches);
        return col;
    }

    private static Control Swatch(string tooltip, string? token, bool selected, Action<string?> onPick)
    {
        var border = new Border
        {
            Width = 22,
            Height = 22,
            Background = token is null ? Graphite.Panel2Brush : TokenBrush(token),
            BorderBrush = selected ? Graphite.AccentBrush : Graphite.Line2Brush,
            BorderThickness = new Thickness(selected ? 2 : 1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            Margin = new Thickness(0, 0, 6, 6),
            Cursor = new Cursor(StandardCursorType.Hand),
        };

        if (token is null)
        {
            border.Child = new TextBlock
            {
                Text = "–",
                FontFamily = Graphite.FontStack,
                FontSize = 12,
                Foreground = Graphite.Text3Brush,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
        }

        ToolTip.SetTip(border, char.ToUpperInvariant(tooltip[0]) + tooltip[1..]);
        border.PointerPressed += (_, _) => onPick(token);
        return border;
    }

    private static IBrush TokenBrush(string? token) => token?.ToLowerInvariant() switch
    {
        "ember" => Graphite.AccentBrush,
        "blue" => Graphite.BlueBrush,
        "green" => Graphite.GreenBrush,
        "yellow" => Graphite.YellowBrush,
        "red" => Graphite.RedBrush,
        "white" => Graphite.TextBrush,
        "muted" => Graphite.Text3Brush,
        _ => Graphite.Panel2Brush,
    };

    // ── Theme manager ─────────────────────────────────────────────────────────

    private Control BuildThemePanel()
    {
        var stack = new StackPanel { Spacing = 8 };
        stack.Children.Add(Graphite.SectionLabel("Theme presets"));
        stack.Children.Add(Graphite.TextBlock(
            "Choose a complete visual direction. Graphite preserves functional racing colors; optical presets apply their representative accent.",
            12, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));

        var activePreset = DashThemePresets.MatchName(_controller.Layout);
        var presets = new WrapPanel
        {
            Orientation = Orientation.Horizontal,
            ItemWidth = 260,
            ItemHeight = 206,
        };
        var frame = DashPreviewFrames.For(DashPreviewState.Redline);
        foreach (var preset in DashThemePresets.All)
        {
            presets.Children.Add(ThemePresetCard(
                preset,
                frame,
                string.Equals(preset.Name, activePreset, StringComparison.Ordinal)));
        }

        stack.Children.Add(presets);

        return EditorPanelSurface(new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
    }

    private Control ThemePresetCard(DashThemePresets.Preset preset, TelemetryFrame frame, bool selected)
    {
        var colorSystem = preset.Theme.IsEmpty ? DashColorSystem.Functional : DashColorSystem.Styled;
        var preview = DashImageRenderer.Render(
            _controller.Layout,
            frame,
            _settings,
            ThemePreviewWidth,
            ThemePreviewHeight,
            _controller.ActivePageId,
            palette: DashPalette.FromTheme(preset.Theme, colorSystem));

        var swatch = new Border
        {
            Tag = "theme-primary-swatch",
            Width = 12,
            Height = 12,
            CornerRadius = new CornerRadius(Graphite.RadiusPill),
            Background = new SolidColorBrush(Color.Parse(preset.SwatchColor)),
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            VerticalAlignment = VerticalAlignment.Center,
        };

        var label = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center,
        };
        label.Children.Add(swatch);
        label.Children.Add(Graphite.TextBlock(preset.Name, 13, FontWeight.Medium, Graphite.TextBrush));
        if (selected)
        {
            label.Children.Add(Graphite.TextBlock("Selected", 11, FontWeight.Normal, Graphite.AccentBrush));
        }

        var content = new StackPanel { Spacing = 10 };
        content.Children.Add(new Border
        {
            Width = ThemePreviewWidth,
            Height = ThemePreviewHeight,
            Background = Graphite.BgBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            ClipToBounds = true,
            Child = new Image
            {
                Source = preview,
                Stretch = Stretch.Fill,
                Width = ThemePreviewWidth,
                Height = ThemePreviewHeight,
            },
        });
        content.Children.Add(label);

        var button = new Button
        {
            Tag = $"theme-preset-{preset.Name.ToLowerInvariant()}",
            Content = content,
            Width = 252,
            Height = 198,
            Padding = new Thickness(6),
            Margin = new Thickness(0, 0, 8, 8),
            Background = selected ? Graphite.Panel3Brush : Graphite.Panel2Brush,
            BorderBrush = selected ? Graphite.AccentBrush : Graphite.LineBrush,
            BorderThickness = new Thickness(selected ? 2 : 1),
            CornerRadius = new CornerRadius(Graphite.RadiusGroup),
            HorizontalContentAlignment = HorizontalAlignment.Left,
            VerticalContentAlignment = VerticalAlignment.Top,
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        AutomationProperties.SetName(button, $"{preset.Name} theme, representative color {preset.SwatchColor}");
        button.Click += (_, _) => _controller.ApplyThemePreset(preset.Theme);
        return button;
    }

    // ── Alerts editor ─────────────────────────────────────────────────────────

    private Control BuildAlertsPanel()
    {
        var alertListWidth = _compactLayout ? CompactAlertListWidth : AlertListWidth;
        var settingsWidth = _compactLayout ? CompactInspectorWidth : 320;
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions($"{alertListWidth},*,{settingsWidth}"),
            ColumnSpacing = 12,
            Margin = new Thickness(0, 0, 4, 0),
        };

        var alertList = BuildAlertPopupList();
        Grid.SetColumn(alertList, 0);
        grid.Children.Add(alertList);

        var canvasColumn = new StackPanel { Spacing = 12, HorizontalAlignment = HorizontalAlignment.Center };
        canvasColumn.Children.Add(Graphite.TextBlock("Alert canvas", 14, FontWeight.Medium, Graphite.TextBrush));
        canvasColumn.Children.Add(Graphite.TextBlock(
            "Drag the alert to position it. Drag the lower-right handle to resize.",
            11, FontWeight.Normal, Graphite.Text3Brush));

        var alert = _controller.GetAlert(_selectedAlertType);
        if (alert is null)
        {
            canvasColumn.Children.Add(AlertDisabledMessage());
        }
        else
        {
            canvasColumn.Children.Add(new Viewbox
            {
                MaxWidth = CanvasWidth,
                Stretch = Stretch.Uniform,
                StretchDirection = StretchDirection.DownOnly,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                Child = BuildAlertCanvas(alert),
            });
        }

        Grid.SetColumn(canvasColumn, 1);
        grid.Children.Add(canvasColumn);

        var settings = new StackPanel { Spacing = 12 };
        settings.Children.Add(BuildGlobalAlertSettings());
        settings.Children.Add(Divider());
        settings.Children.Add(BuildIndividualAlertSettings(alert));
        var settingsSurface = EditorPanelSurface(new ScrollViewer { Content = settings, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Grid.SetColumn(settingsSurface, 2);
        grid.Children.Add(settingsSurface);
        return grid;
    }

    private Control BuildAlertPopupList()
    {
        var surface = new StackPanel { Spacing = 10 };
        surface.Children.Add(Graphite.SectionLabel("Popups"));
        surface.Children.Add(Graphite.TextBlock(
            "Select a popup to edit. Use its switch to show or hide it.",
            11,
            FontWeight.Normal,
            Graphite.Text3Brush,
            TextWrapping.Wrap));

        var list = new StackPanel
        {
            Tag = "alert-popup-list",
            Spacing = 6,
        };
        foreach (var item in AlertTypes)
        {
            var selected = string.Equals(item.Type, _selectedAlertType, StringComparison.OrdinalIgnoreCase);
            var enabled = _controller.IsAlertEnabled(item.Type);
            var row = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                ColumnSpacing = 8,
            };
            var selectorContent = Graphite.TextBlock(
                item.Label,
                12,
                selected ? FontWeight.Bold : FontWeight.Medium,
                selected ? Graphite.TextBrush : Graphite.Text2Brush);
            selectorContent.VerticalAlignment = VerticalAlignment.Center;
            selectorContent.Margin = new Thickness(10, 8);
            var selectorSurface = new Grid
            {
                Background = Brushes.Transparent,
            };
            selectorSurface.Children.Add(selectorContent);
            var selector = new Button
            {
                Tag = $"alert-selector:{item.Type}",
                Template = new FuncControlTemplate<Button>((_, _) => selectorSurface),
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0),
                MinHeight = 40,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Left,
                VerticalContentAlignment = VerticalAlignment.Center,
                Cursor = new Cursor(StandardCursorType.Hand),
            };
            AutomationProperties.SetName(selector, $"{(selected ? "Selected, " : "")}edit {item.Label} popup");
            selector.Click += (_, _) =>
            {
                _selectedAlertType = item.Type;
                Rebuild();
            };
            Grid.SetColumnSpan(selector, 2);
            row.Children.Add(selector);

            var toggle = AlertPopupToggle(enabled, on => _controller.SetAlert(item.Type, on));
            toggle.Tag = $"alert-toggle:{item.Type}";
            toggle.HorizontalAlignment = HorizontalAlignment.Right;
            toggle.Margin = new Thickness(0, 0, 10, 0);
            AutomationProperties.SetName(toggle, $"{(enabled ? "Disable" : "Enable")} {item.Label} popup");
            Grid.SetColumn(toggle, 1);
            row.Children.Add(toggle);

            var rowContainer = new Border
            {
                Tag = $"alert-row:{item.Type}",
                Background = selected ? Graphite.Panel3Brush : Graphite.Panel2Brush,
                BorderBrush = Graphite.LineBrush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(Graphite.RadiusControl),
                Padding = new Thickness(0),
                Child = row,
            };
            selector.GotFocus += (_, _) =>
            {
                rowContainer.BorderBrush = Graphite.AccentBrush;
                rowContainer.BorderThickness = new Thickness(Graphite.FocusThickness);
            };
            selector.LostFocus += (_, _) =>
            {
                rowContainer.BorderBrush = Graphite.LineBrush;
                rowContainer.BorderThickness = new Thickness(1);
            };
            list.Children.Add(rowContainer);
        }

        surface.Children.Add(list);
        return new Border
        {
            Background = Graphite.PanelBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(0, 0, 1, 0),
            Padding = new Thickness(12),
            Child = surface,
        };
    }

    private static ToggleButton AlertPopupToggle(bool enabled, Action<bool> set)
    {
        var knob = new Border
        {
            Width = 18,
            Height = 18,
            CornerRadius = new CornerRadius(Graphite.RadiusPill),
            Background = Graphite.TextBrush,
            HorizontalAlignment = enabled ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(3, 0),
        };
        var track = new Border
        {
            Width = 44,
            Height = 24,
            Background = enabled ? Graphite.GreenBrush : Graphite.Panel2Brush,
            BorderBrush = enabled ? Graphite.GreenBrush : Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusPill),
            Child = knob,
        };
        var toggle = new ToggleButton
        {
            IsChecked = enabled,
            Template = new FuncControlTemplate<ToggleButton>((_, _) => track),
            Width = 44,
            MinWidth = 44,
            Height = 24,
            MinHeight = 24,
            Padding = new Thickness(0),
            Background = Brushes.Transparent,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            VerticalContentAlignment = VerticalAlignment.Stretch,
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        toggle.Click += (_, _) => set(toggle.IsChecked == true);
        toggle.GotFocus += (_, _) =>
        {
            track.BorderBrush = Graphite.AccentBrush;
            track.BorderThickness = new Thickness(2);
        };
        toggle.LostFocus += (_, _) =>
        {
            track.BorderBrush = enabled ? Graphite.GreenBrush : Graphite.LineBrush;
            track.BorderThickness = new Thickness(1);
        };
        return toggle;
    }

    private static TextBlock AlertDisabledMessage() => Graphite.TextBlock(
        "Enable this popup from the list to configure it.",
        11,
        FontWeight.Normal,
        Graphite.Text3Brush,
        TextWrapping.Wrap);

    private Control BuildAlertCanvas(DashAlert alert)
    {
        var palette = DashPalette.FromLayout(_controller.Layout);
        _alertPreviewBitmap = DashImageRenderer.RenderReusing(
            _alertPreviewBitmap,
            _controller.Layout,
            _controller.ResolveRenderFrame(_frameProvider()),
            _settings,
            CanvasWidth,
            CanvasHeight,
            pageId: _controller.ActivePageId,
            palette: palette);

        var canvas = new Canvas
        {
            Width = CanvasWidth,
            Height = CanvasHeight,
            Background = Graphite.BgBrush,
            ClipToBounds = true,
        };
        _alertCanvas = canvas;
        canvas.Children.Add(new Image
        {
            Width = CanvasWidth,
            Height = CanvasHeight,
            Source = _alertPreviewBitmap,
            Stretch = Stretch.Fill,
            Opacity = 0.22,
            IsHitTestVisible = false,
        });
        canvas.Children.Add(new Rectangle
        {
            Width = CanvasWidth,
            Height = CanvasHeight,
            Fill = new SolidColorBrush(Color.FromArgb(72, 0, 0, 0)),
            IsHitTestVisible = false,
        });

        var effective = _controller.EffectiveAlertConfig(alert.Type);
        var (title, value) = AlertSample(alert.Type);
        var color = AlertTokenBrush(effective.ColorToken, alert.Type);
        var content = new Grid { RowDefinitions = new RowDefinitions("Auto,*"), Margin = new Thickness(12, 10) };
        var titleText = Graphite.TextBlock(title, 11, FontWeight.SemiBold, effective.InvertColors ? Graphite.BgBrush : color);
        titleText.HorizontalAlignment = HorizontalAlignment.Center;
        Grid.SetRow(titleText, 0);
        content.Children.Add(titleText);
        var widgetWidth = alert.ColSpan * CellW;
        var widgetHeight = alert.RowSpan * CellH;
        titleText.FontSize = Math.Clamp(Math.Min(widgetHeight * 0.13, widgetWidth / Math.Max(8, title.Length * 0.78)), 9, 24);
        titleText.MaxWidth = Math.Max(1, widgetWidth - 24);
        titleText.TextTrimming = TextTrimming.CharacterEllipsis;
        var valueText = new TextBlock
        {
            Text = value,
            FontFamily = "avares://Sprint.Desktop.Client/Assets/Fonts#Saira SemiCondensed",
            FontSize = Math.Clamp(Math.Min(widgetHeight * 0.52, widgetWidth * 0.52), 24, 120),
            FontWeight = FontWeight.Bold,
            Foreground = effective.InvertColors ? Graphite.BgBrush : Graphite.TextBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetRow(valueText, 1);
        content.Children.Add(valueText);

        var resizeHandle = new Border
        {
            Width = 12,
            Height = 12,
            Background = effective.InvertColors ? Graphite.BgBrush : color,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            CornerRadius = new CornerRadius(2),
            Margin = new Thickness(5),
        };
        Grid.SetRowSpan(resizeHandle, 2);
        content.Children.Add(resizeHandle);

        var widget = new Border
        {
            Width = widgetWidth,
            Height = widgetHeight,
            Background = effective.InvertColors ? color : new SolidColorBrush(Color.FromArgb(246, 8, 8, 10)),
            BorderBrush = color,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Cursor = new Cursor(StandardCursorType.SizeAll),
            Focusable = true,
            Tag = $"alert-widget:{alert.Type}",
            Opacity = alert.Enabled ? 1.0 : 0.48,
            Child = content,
        };
        AutomationProperties.SetName(widget, $"{title} alert position and size");
        ToolTip.SetTip(widget, "Arrow keys move; Shift+arrow keys resize");
        Canvas.SetLeft(widget, alert.Col * CellW);
        Canvas.SetTop(widget, alert.Row * CellH);
        widget.PointerPressed += (_, e) => BeginAlertDrag(widget, alert, e);
        widget.PointerMoved += (_, e) => ContinueAlertDrag(widget, e);
        widget.PointerReleased += (_, e) => EndAlertDrag(widget, e);
        widget.KeyDown += (_, e) => OnAlertWidgetKeyDown(alert, e);
        widget.GotFocus += (_, _) =>
        {
            widget.BorderBrush = Graphite.AccentBrush;
            widget.BorderThickness = new Thickness(2);
        };
        widget.LostFocus += (_, _) =>
        {
            widget.BorderBrush = color;
            widget.BorderThickness = new Thickness(1);
        };
        canvas.Children.Add(widget);

        return new Border
        {
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            ClipToBounds = true,
            Child = canvas,
        };
    }

    private void OnAlertWidgetKeyDown(DashAlert alert, KeyEventArgs e)
    {
        var dc = e.Key == Key.Left ? -1 : e.Key == Key.Right ? 1 : 0;
        var dr = e.Key == Key.Up ? -1 : e.Key == Key.Down ? 1 : 0;
        if (dc == 0 && dr == 0)
        {
            return;
        }

        if (e.KeyModifiers.HasFlag(KeyModifiers.Shift))
        {
            _controller.SetAlertGeometry(alert.Type, alert.Col, alert.Row, alert.ColSpan + dc, alert.RowSpan + dr);
        }
        else
        {
            _controller.SetAlertGeometry(alert.Type, alert.Col + dc, alert.Row + dr, alert.ColSpan, alert.RowSpan);
        }

        e.Handled = true;
    }

    private void BeginAlertDrag(Border widget, DashAlert alert, PointerPressedEventArgs e)
    {
        var point = e.GetPosition(widget);
        _dragAlertType = alert.Type;
        _resizingAlert = point.X >= widget.Width - 24 && point.Y >= widget.Height - 24;
        _alertDragStart = e.GetPosition(_alertCanvas);
        _alertStartCol = _alertPreviewCol = alert.Col;
        _alertStartRow = _alertPreviewRow = alert.Row;
        _alertStartColSpan = _alertPreviewColSpan = alert.ColSpan;
        _alertStartRowSpan = _alertPreviewRowSpan = alert.RowSpan;
        e.Pointer.Capture(widget);
        e.Handled = true;
    }

    private void ContinueAlertDrag(Border widget, PointerEventArgs e)
    {
        if (_dragAlertType is null)
        {
            return;
        }

        var point = e.GetPosition(_alertCanvas);
        var dc = (int)Math.Round((point.X - _alertDragStart.X) / CellW);
        var dr = (int)Math.Round((point.Y - _alertDragStart.Y) / CellH);
        if (_resizingAlert)
        {
            _alertPreviewColSpan = Math.Clamp(_alertStartColSpan + dc, 2, Cols - _alertStartCol);
            _alertPreviewRowSpan = Math.Clamp(_alertStartRowSpan + dr, 2, Rows - _alertStartRow);
        }
        else
        {
            _alertPreviewCol = Math.Clamp(_alertStartCol + dc, 0, Cols - _alertStartColSpan);
            _alertPreviewRow = Math.Clamp(_alertStartRow + dr, 0, Rows - _alertStartRowSpan);
        }

        widget.Width = _alertPreviewColSpan * CellW;
        widget.Height = _alertPreviewRowSpan * CellH;
        Canvas.SetLeft(widget, _alertPreviewCol * CellW);
        Canvas.SetTop(widget, _alertPreviewRow * CellH);
        e.Handled = true;
    }

    private void EndAlertDrag(Border widget, PointerReleasedEventArgs e)
    {
        if (_dragAlertType is { } type)
        {
            _controller.SetAlertGeometry(type, _alertPreviewCol, _alertPreviewRow, _alertPreviewColSpan, _alertPreviewRowSpan);
        }

        _dragAlertType = null;
        _resizingAlert = false;
        e.Pointer.Capture(null);
        e.Handled = true;
    }

    private Control BuildGlobalAlertSettings()
    {
        var config = _controller.AlertConfig;
        var stack = new StackPanel { Spacing = 10 };
        stack.Children.Add(Graphite.SectionLabel("Global defaults"));
        stack.Children.Add(Graphite.TextBlock("Used by every alert unless it has an individual override.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        stack.Children.Add(AlertColorPicker("Color", config.ColorToken, _selectedAlertType, _controller.SetAlertColorToken));
        stack.Children.Add(DurationRow(config.DurationSeconds,
            () => _controller.SetAlertDuration(config.DurationSeconds - 0.1),
            () => _controller.SetAlertDuration(config.DurationSeconds + 0.1)));
        stack.Children.Add(AlertInvertRow(config.InvertColors, _controller.SetAlertInvertColors));
        return stack;
    }

    private Control BuildIndividualAlertSettings(DashAlert? alert)
    {
        var stack = new StackPanel { Spacing = 10 };
        var label = AlertTypes.First(item => string.Equals(item.Type, _selectedAlertType, StringComparison.OrdinalIgnoreCase)).Label;
        stack.Children.Add(Graphite.SectionLabel(label));
        if (alert is null)
        {
            stack.Children.Add(AlertDisabledMessage());
            return stack;
        }

        stack.Children.Add(AlertToggleRow("Use global settings", alert.UsesGlobalSettings,
            useGlobal => _controller.SetAlertUseGlobal(alert.Type, useGlobal)));
        var effective = _controller.EffectiveAlertConfig(alert.Type);
        if (alert.UsesGlobalSettings)
        {
            stack.Children.Add(Graphite.TextBlock(
                $"{AlertColorName(effective.ColorToken)} · {effective.DurationSeconds:0.0}s · {(effective.InvertColors ? "Inverted" : "Normal")}",
                12, FontWeight.Medium, AlertTokenBrush(effective.ColorToken, alert.Type)));
            return stack;
        }

        stack.Children.Add(AlertColorPicker("Color", effective.ColorToken, alert.Type, token => _controller.SetAlertColorToken(alert.Type, token)));
        stack.Children.Add(DurationRow(effective.DurationSeconds,
            () => _controller.SetAlertDuration(alert.Type, effective.DurationSeconds - 0.1),
            () => _controller.SetAlertDuration(alert.Type, effective.DurationSeconds + 0.1)));
        stack.Children.Add(AlertInvertRow(effective.InvertColors, invert => _controller.SetAlertInvertColors(alert.Type, invert)));
        return stack;
    }

    private Control AlertColorPicker(string label, string current, string type, Action<string> onPick)
    {
        var stack = new StackPanel { Spacing = 5 };
        stack.Children.Add(Graphite.TextBlock(label, 11, FontWeight.Normal, Graphite.Text2Brush));
        var currentToken = DashThemePresets.CanonicalAlertColorToken(current);
        if (DashThemePresets.FindByAlertColorToken(currentToken) is null && !string.IsNullOrWhiteSpace(currentToken))
        {
            var legacyContent = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 7,
                VerticalAlignment = VerticalAlignment.Center,
            };
            legacyContent.Children.Add(new Border
            {
                Width = 14,
                Height = 14,
                Background = AlertTokenBrush(currentToken, type),
                BorderBrush = Graphite.Line2Brush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(Graphite.RadiusPill),
            });
            legacyContent.Children.Add(Graphite.TextBlock(
                $"Legacy color · {char.ToUpperInvariant(currentToken[0]) + currentToken[1..]}",
                11,
                FontWeight.Medium,
                Graphite.Text2Brush));
            var legacy = new Border
            {
                Tag = "alert-color-legacy",
                Background = Graphite.Panel2Brush,
                BorderBrush = Graphite.LineBrush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(Graphite.RadiusControl),
                Padding = new Thickness(8, 7),
                Margin = new Thickness(0, 0, 0, 1),
                Child = legacyContent,
            };
            AutomationProperties.SetName(legacy, $"Legacy {currentToken} alert color");
            stack.Children.Add(legacy);
        }

        var themes = new WrapPanel { Orientation = Orientation.Horizontal };
        foreach (var preset in DashThemePresets.All)
        {
            var token = preset.AlertColorToken;
            var selected = string.Equals(currentToken, token, StringComparison.OrdinalIgnoreCase);
            var content = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
                ColumnSpacing = 7,
            };
            var indicator = new Border
            {
                Tag = $"alert-color-indicator:{preset.Name.ToLowerInvariant()}",
                Width = 14,
                Height = 14,
                Background = AlertThemeIndicatorBrush(preset, type),
                BorderBrush = Graphite.Line2Brush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(Graphite.RadiusPill),
                VerticalAlignment = VerticalAlignment.Center,
            };
            content.Children.Add(indicator);
            var nameText = Graphite.TextBlock(preset.Name, 11, FontWeight.Medium, Graphite.Text2Brush);
            nameText.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(nameText, 1);
            content.Children.Add(nameText);
            if (selected)
            {
                var check = Icons.Create("check", 12, Graphite.TextBrush);
                Grid.SetColumn(check, 2);
                content.Children.Add(check);
            }

            var button = new Button
            {
                Tag = $"alert-color:{preset.Name.ToLowerInvariant()}",
                Content = content,
                Width = 132,
                MinHeight = 34,
                Margin = new Thickness(0, 0, 6, 6),
                Padding = new Thickness(8, 5),
                Background = selected ? Graphite.Panel3Brush : Graphite.Panel2Brush,
                BorderBrush = selected ? Graphite.AccentBrush : Graphite.LineBrush,
                BorderThickness = new Thickness(selected ? 2 : 1),
                CornerRadius = new CornerRadius(Graphite.RadiusControl),
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                VerticalContentAlignment = VerticalAlignment.Center,
                Cursor = new Cursor(StandardCursorType.Hand),
            };
            AutomationProperties.SetName(button, $"{preset.Name} alert color{(selected ? ", selected" : string.Empty)}");
            button.Click += (_, _) => onPick(token);
            themes.Children.Add(button);
        }
        stack.Children.Add(themes);
        return stack;
    }

    private IBrush AlertThemeIndicatorBrush(DashThemePresets.Preset preset, string type)
    {
        if (!string.Equals(preset.AlertColorToken, "auto", StringComparison.OrdinalIgnoreCase))
        {
            return new SolidColorBrush(Color.Parse(preset.SwatchColor));
        }

        return AlertTokenBrush("auto", type);
    }

    private static Control AlertInvertRow(bool value, Action<bool> set)
    {
        var stack = new StackPanel { Spacing = 3 };
        stack.Children.Add(AlertToggleRow("Invert colors", value: false, set, enabled: false));
        stack.Children.Add(Graphite.TextBlock(
            "Critical alerts only · preview remains stable.",
            10,
            FontWeight.Normal,
            Graphite.Text3Brush));
        ToolTip.SetTip(stack, "Parameter-change alerts are not Critical and cannot invert.");
        return stack;
    }

    private static Control AlertToggleRow(string label, bool value, Action<bool> set, bool enabled = true)
    {
        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var text = Graphite.TextBlock(label, 12, FontWeight.Medium, Graphite.Text2Brush);
        text.VerticalAlignment = VerticalAlignment.Center;
        row.Children.Add(text);
        var toggle = Graphite.Toggle(value, set, enabled);
        Grid.SetColumn(toggle, 1);
        row.Children.Add(toggle);
        return row;
    }

    private static (string Title, string Value) AlertSample(string type) => type switch
    {
        "abs_change" => ("ABS", "4"),
        "enginemap_change" => ("ENGINE MAP", "3"),
        _ => ("TRACTION CONTROL", "5"),
    };

    private IBrush AlertTokenBrush(string token, string type)
    {
        var preset = DashThemePresets.FindByAlertColorToken(token);
        if (preset is not null && !string.Equals(preset.AlertColorToken, "auto", StringComparison.OrdinalIgnoreCase))
        {
            return new SolidColorBrush(Color.Parse(preset.SwatchColor));
        }

        return token.ToLowerInvariant() switch
        {
            "yellow" => AlertWarningBrush(),
            _ => AlertFallbackBrush(type),
        };
    }

    private IBrush AlertWarningBrush()
    {
        var color = DashPalette.FromLayout(_controller.Layout).Warning;
        return AlertSkiaBrush(color);
    }

    private IBrush AlertFallbackBrush(string type)
    {
        var palette = DashPalette.FromLayout(_controller.Layout);
        var color = type switch
        {
            "abs_change" => palette.Warning,
            "enginemap_change" => palette.Primary,
            _ => palette.AssistActive,
        };
        return AlertSkiaBrush(color);
    }

    private static IBrush AlertSkiaBrush(SkiaSharp.SKColor color)
    {
        return new SolidColorBrush(Color.FromArgb(color.Alpha, color.Red, color.Green, color.Blue));
    }

    private static string AlertColorName(string token) =>
        DashThemePresets.FindByAlertColorToken(token)?.Name
        ?? char.ToUpperInvariant(token[0]) + token[1..];

    private static Control DurationRow(double value, Action decrement, Action increment)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var text = Graphite.TextBlock("Duration", 12, FontWeight.SemiBold, Graphite.Text2Brush);
        text.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);

        var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, HorizontalAlignment = HorizontalAlignment.Right };
        controls.Children.Add(Stepper("-", decrement));
        var valueBox = new Border
        {
            MinWidth = 48,
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(6),
            Padding = new Thickness(8, 4),
            Child = Graphite.TextBlock($"{Math.Clamp(value, 0.5, 5.0):0.0}s", 12, FontWeight.Bold, Graphite.TextBrush)
        };
        controls.Children.Add(valueBox);
        controls.Children.Add(Stepper("+", increment));
        Grid.SetColumn(controls, 1);
        grid.Children.Add(controls);
        return grid;
    }

    private static Control StepperRow(string label, int value, Action decrement, Action increment)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var text = Graphite.TextBlock(label, 12, FontWeight.Normal, Graphite.Text2Brush);
        text.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);

        var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2, HorizontalAlignment = HorizontalAlignment.Right };
        controls.Children.Add(Stepper("-", decrement));
        var valueBox = new Border
        {
            MinWidth = 30,
            Background = Brushes.Transparent,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(0),
            Padding = new Thickness(4, 4),
            Child = Graphite.TextBlock(value.ToString(), 12, FontWeight.Medium, Graphite.TextBrush)
        };
        controls.Children.Add(valueBox);
        controls.Children.Add(Stepper("+", increment));
        Grid.SetColumn(controls, 1);
        grid.Children.Add(controls);
        return grid;
    }

    private static Button Stepper(string label, Action action)
    {
        var button = Graphite.Button(label, ButtonTone.Ghost);
        button.Width = 24;
        button.MinHeight = 24;
        button.Padding = new Thickness(0);
        button.Click += (_, _) => action();
        return button;
    }
}
