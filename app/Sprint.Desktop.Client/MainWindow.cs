using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Controls.Chrome;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
#if DEBUG
using Sprint.Desktop.Features.Development;
#endif
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Engineer;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Features.Updates;
using Sprint.Desktop.Runtime;
using Sprint.Desktop.Shell;
using Sprint.Games;

namespace Sprint.Desktop;

public sealed class MainWindow : Window
{
    private const double ToastLifetimeSeconds = 8;

    private readonly IDesktopRuntime _runtime;
    private readonly ShellState _shell;
    private readonly TelemetryEngine _engine;
    private readonly DeviceScreenService _screens;
    private readonly ILog _log;
    private readonly LiveLogStore _liveLog;
    private readonly DiagnosticsPaths? _diagnosticsPaths;
    private readonly Grid _root = new();
    private readonly Border _windowFrame = new();
    private readonly DispatcherTimer _timer;
    private ContentControl _body = new();
    private Border? _bodyTray;
    private StackPanel _navRail = new() { Spacing = 8 };
    private TextBlock _breadcrumb = null!;
    private TextBlock _groupCrumb = null!;
    private TextBlock _signalText = null!;
    private TextBlock _hzText = null!;
    private Border _hzIndicator = null!;
    private Border _signalDot = null!;
    private TelemetrySnapshot _telemetry;
    private TelemetryStatusView _statusView = new();
    private SurfaceState? _surfaceState;
    private SetupProgram _selectedSetup;
    private SetupProgram? _setupCompareBaseline;
    private DashEditorView? _dashEditor;
    private bool _restoreSidebarAfterEditor;
    private readonly CommandBus _commands = new();
    private readonly Dictionary<string, List<Border>> _deviceStatusPills = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, List<TextBlock>> _deviceStatusDetails = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _renderedDeviceStatuses = new(StringComparer.OrdinalIgnoreCase);
    private readonly ShellCommandRegistry _shellCommands;
    private Border? _commandOverlay;
    private Border? _confirmOverlay;
    private Action? _pendingConfirmCancel;
    private Border? _deviceCatalogOverlay;
    // Transient notification stack (bottom-right). Re-attached on demand because
    // BuildShell clears _root; the timers are tracked so window close stops them.
    private StackPanel? _toastHost;
    private readonly List<DispatcherTimer> _toastTimers = [];
    private Control? _focusBeforeDeviceCatalog;
    private TextBox? _commandSearch;
    private StackPanel? _commandResults;
    private IReadOnlyList<ShellCommand> _visibleCommands = [];
    private int _commandSelection;
    private Control? _focusBeforePalette;
    private InputCaptureState _capture = InputCaptureState.Idle;
    private string? _captureDeviceId;
    private string? _selectedDeviceId;
    private bool _deviceBindingPickerOpen;
    // Device detail live preview: a persistent painter renders the assigned dash
    // upright at the panel's native size into an in-place WriteableBitmap, animated
    // from the shell's ~30Hz tick without rebuilding the body. Torn down whenever
    // the body rebuilds or the window closes (see DisposeDevicePreview).
    private DashPreviewState _devicePreviewState = DashPreviewState.Live;
    private DashPainter? _devicePreviewPainter;
    private DashLayout? _devicePreviewLayout;
    private WriteableBitmap? _devicePreviewBitmap;
    private Image? _devicePreviewImage;
    private SetupProgram? _deletedSetup;
    private int _deletedSetupIndex;
    private DispatcherTimer? _setupUndoTimer;
#if DEBUG
    private DiagnosticsWindow? _diagnosticsWindow;
    private readonly DevelopmentGameState _developmentGameState;

    internal DiagnosticsWindow? ActiveDiagnosticsWindow => _diagnosticsWindow;
#endif

    public MainWindow(IDesktopRuntime runtime, ShellState shell, ITelemetrySource telemetrySource)
        : this(runtime, shell, telemetrySource, null, null, null)
    {
    }

    public MainWindow(
        IDesktopRuntime runtime,
        ShellState shell,
        ITelemetrySource telemetrySource,
        ILog? log,
        LiveLogStore? liveLog)
        : this(runtime, shell, telemetrySource, log, liveLog, null)
    {
    }

    public MainWindow(
        IDesktopRuntime runtime,
        ShellState shell,
        ITelemetrySource telemetrySource,
        ILog? log,
        LiveLogStore? liveLog,
        Func<string, IScreenDriver>? screenDriverFactory)
        : this(runtime, shell, telemetrySource, log, liveLog, screenDriverFactory, null)
    {
    }

    internal MainWindow(
        IDesktopRuntime runtime,
        ShellState shell,
        ITelemetrySource telemetrySource,
        ILog? log,
        LiveLogStore? liveLog,
        Func<string, IScreenDriver>? screenDriverFactory,
        DiagnosticsPaths? diagnosticsPaths)
    {
        _runtime = runtime;
        _shell = shell;
        _liveLog = liveLog ?? new LiveLogStore();
        _log = log ?? _liveLog;
        _diagnosticsPaths = diagnosticsPaths;
#if DEBUG
        _developmentGameState = new DevelopmentGameState(_log);
#endif
        // The window owns the WS4 engine wrapping the source: a background reader, a
        // 5s reconnect loop, real-rate measurement and delta augmentation, all draining
        // into a buffer this window samples at ~30Hz. Start() connects synchronously so
        // the first paint reflects the real link state (Connect never throws for
        // recoverable failures — it reflects them in Status).
        _engine = new TelemetryEngine(telemetrySource);
        _selectedSetup = _runtime.SetupPrograms.FirstOrDefault()
            ?? _runtime.SetupTemplates.FirstOrDefault()
            ?? new SetupProgram { Id = "setup-empty", Name = "No setup" };

        _engine.Start();
        var snapshot = _engine.Snapshot;
        _telemetry = LiveTelemetryPresenter.ToSnapshot(CurrentTelemetryFrame());
        var health = TelemetryStatusPresenter.Present(snapshot.Status, snapshot.Hz, DateTimeOffset.UtcNow);
        _statusView = health.Titlebar;
        _surfaceState = health.Surface;

        // WS7: keep a hardware publisher running for each enabled screen device,
        // rendering its assigned dash off the UI thread. Feeds live per-device status.
        _screens = new DeviceScreenService(
            _runtime,
            CurrentTelemetryFrame,
            screenDriverFactory,
            log: _log);
        _screens.Sync();

        // WS8: the UI-independent command bus. Handlers are wired here (the shell owns
        // the effects); input devices / the bindings UI dispatch by id. The on-wheel
        // page-cycle effect on live hardware pages is a follow-up, so page commands
        // dispatch cleanly today without a visible screen effect yet.
        SprintCommands.RegisterDefaults(_commands);
        _commands.Handle(SprintCommands.DashPageNext, _ => { });
        _commands.Handle(SprintCommands.DashPagePrev, _ => { });
        _commands.Handle(SprintCommands.DashTargetSet, _ => { });
        _shellCommands = CreateShellCommands();
        KeyDown += OnGlobalKeyDown;

        // Retain semantic window identity for task switching and accessibility;
        // SprintComponentTheme suppresses only its duplicate visual title panel.
        Title = "Sprint";
        Width = 1440;
        Height = 900;
        MinWidth = 1120;
        MinHeight = 720;
        Background = Graphite.PanelBrush;
        TransparencyBackgroundFallback = Graphite.PanelBrush;
        TransparencyLevelHint = OperatingSystem.IsWindows()
            ? [WindowTransparencyLevel.Mica, WindowTransparencyLevel.AcrylicBlur, WindowTransparencyLevel.None]
            : [WindowTransparencyLevel.None];
        FontFamily = Graphite.FontStack;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        // Extend Sprint beneath Avalonia's Windows decoration overlay. The app theme
        // removes the duplicate title and fullscreen part, leaving exactly the three
        // native-role caption buttons above our single product toolbar.
        this.WindowDecorations = Avalonia.Controls.WindowDecorations.Full;
        ExtendClientAreaToDecorationsHint = true;
        ExtendClientAreaTitleBarHeightHint = Graphite.ToolbarHeight;

        var iconPath = System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "appicon.png");
        if (File.Exists(iconPath))
        {
            Icon = new WindowIcon(iconPath);
        }

        _windowFrame.Background = Graphite.PanelBrush;
        _windowFrame.BorderBrush = Brushes.Transparent;
        _windowFrame.BorderThickness = new Thickness(0);
        _windowFrame.ClipToBounds = true;
        _windowFrame.Child = _root;
        Content = _windowFrame;
        ApplyMaximizedChrome();
        BuildShell();
        RenderBody();
        AddHandler(Button.ClickEvent, OnAnyButtonClick, RoutingStrategies.Bubble, handledEventsToo: true);

        // ~30Hz UI handoff: drain the engine's latest-value buffer. Decoupled frontend
        // emitter — the reader thread fills the buffer at the game's cadence; the UI
        // samples the latest value here and never blocks on a read.
        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(33) };
        _timer.Tick += (_, _) => TickTelemetry();
        _timer.Start();
    }

    private void BuildShell()
    {
        _bodyTray?.Child = null;
        // The shell is one column of two rows: a single Sprint-owned product toolbar
        // sharing the native title-bar region, then the sidebar + body tray.
        _root.RowDefinitions = new RowDefinitions("Auto,*");
        _root.ColumnDefinitions = new ColumnDefinitions("*");
        _root.Background = Graphite.PanelBrush;
        _root.Children.Clear();

        var toolbar = BuildToolbar();
        Grid.SetRow(toolbar, 0);
        Grid.SetColumn(toolbar, 0);
        _root.Children.Add(toolbar);

        var content = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions($"{_shell.SidebarWidth},*"),
            Background = Graphite.PanelBrush
        };

        var sidebar = BuildSidebar();
        Grid.SetColumn(sidebar, 0);
        content.Children.Add(sidebar);

        var tray = new Border
        {
            Background = Graphite.BgBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(0),
            Margin = new Thickness(0),
            Child = _body
        };
        _bodyTray = tray;
        Grid.SetColumn(tray, 1);
        content.Children.Add(tray);

        Grid.SetRow(content, 1);
        Grid.SetColumn(content, 0);
        _root.Children.Add(content);

        // Live toasts outlive a shell rebuild: clearing _root detached the host, so put
        // it back while it still holds notifications instead of dropping them on navigation.
        if (_toastHost is { } toastHost && toastHost.Children.Count > 0)
        {
            EnsureToastHost();
        }
    }

    /// <summary>
    /// Suppresses the app-drawn rounded corners and hairline border when the window
    /// is maximized so Sprint sits full-bleed against the screen edges (US6); a
    /// normal window keeps the OS-provided rounded corners (US5).
    /// </summary>
    private void ApplyMaximizedChrome()
    {
        _windowFrame.CornerRadius = new CornerRadius(0);
        _windowFrame.BorderThickness = new Thickness(0);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == WindowStateProperty)
        {
            ApplyMaximizedChrome();
        }
    }

    private Control BuildToolbar()
    {
        _breadcrumb = Graphite.TextBlock("", 13, FontWeight.Medium, Graphite.TextBrush);
        _groupCrumb = Graphite.TextBlock("", 12, FontWeight.Normal, Graphite.Text3Brush);
        _signalText = Graphite.TextBlock("", 11, FontWeight.Medium, Graphite.Text2Brush);
        _hzText = Graphite.TextBlock("", 11, FontWeight.Normal, Graphite.Text3Brush);
        _signalDot = new Border
        {
            Width = 6,
            Height = 6,
            CornerRadius = new CornerRadius(999),
            Background = Graphite.Text3Brush
        };

        var grid = new Grid
        {
            Tag = "product-toolbar",
            Background = Graphite.PanelBrush,
            ColumnDefinitions =
            {
                new ColumnDefinition(GridLength.Auto),
                new ColumnDefinition(GridLength.Auto),
                new ColumnDefinition(new GridLength(1, GridUnitType.Star)),
                new ColumnDefinition(GridLength.Auto),
                new ColumnDefinition(GridLength.Auto),
                new ColumnDefinition(GridLength.Auto),
                new ColumnDefinition(new GridLength(Graphite.CaptionButtonsWidth)),
            },
            Height = Graphite.ToolbarHeight
        };
        WindowDecorationProperties.SetElementRole(grid, WindowDecorationsElementRole.TitleBar);

        var logo = new Border
        {
            Width = Graphite.SidebarCollapsedWidth,
            VerticalAlignment = VerticalAlignment.Center,
            Child = Brand.LogoMark(18)
        };
        Grid.SetColumn(logo, 0);
        grid.Children.Add(logo);

        var sidebarToggle = ChromeButton("layout-sidebar", ToggleSidebar, "Toggle sidebar");
        sidebarToggle.Margin = new Thickness(2, 0, 10, 0);
        WindowDecorationProperties.SetElementRole(sidebarToggle, WindowDecorationsElementRole.User);
        Grid.SetColumn(sidebarToggle, 1);
        grid.Children.Add(sidebarToggle);

        var location = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 12, 0)
        };
        location.Children.Add(_breadcrumb);
        location.Children.Add(_groupCrumb);
        Grid.SetColumn(location, 2);
        grid.Children.Add(location);

        var commandButton = Graphite.Button("Search commands   Ctrl+K", ButtonTone.Ghost);
        commandButton.Tag = "command-palette-trigger";
        commandButton.FontSize = 11;
        commandButton.Foreground = Graphite.Text3Brush;
        WindowDecorationProperties.SetElementRole(commandButton, WindowDecorationsElementRole.User);
        commandButton.Click += (_, _) => OpenCommandPalette();
        Grid.SetColumn(commandButton, 3);
        grid.Children.Add(commandButton);

        var signal = new Border
        {
            Background = Brushes.Transparent,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(12, 4),
            VerticalAlignment = VerticalAlignment.Center,
            Child = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 7,
                Children =
                {
                    _signalDot,
                    _signalText
                }
            }
        };
        ToolTip.SetTip(signal, "Telemetry connection state");
        Grid.SetColumn(signal, 4);
        grid.Children.Add(signal);

        _hzIndicator = new Border
        {
            Tag = "telemetry-rate",
            Padding = new Thickness(12, 0),
            VerticalAlignment = VerticalAlignment.Center,
            Child = _hzText
        };
        Grid.SetColumn(_hzIndicator, 5);
        grid.Children.Add(_hzIndicator);

        UpdateTitlebar();
        return grid;
    }

    private Control BuildSidebar()
    {
        _navRail = new StackPanel
        {
            Tag = "primary-navigation",
            Spacing = 4,
            Margin = new Thickness(8, 12, 8, 0)
        };
        AddNavGroup(null, null, (AppView.Home, "Home"));
        AddNavGroup("Workspace", "layout-dashboard",
            (AppView.Devices, "Devices"),
            (AppView.Dashes, "Dashboards"));

        // Settings/Help pin to the bottom of the rail (matches the Figma sidebar).
        var footer = new StackPanel
        {
            Tag = "utility-navigation",
            Spacing = 4,
            Margin = new Thickness(8, 6, 8, 12)
        };
        footer.Children.Add(NavButton(AppView.Settings, "Settings"));
        footer.Children.Add(NavButton(AppView.Help, "Help"));

        var dock = new DockPanel { LastChildFill = true };
        DockPanel.SetDock(footer, Dock.Bottom);
        dock.Children.Add(footer);
        dock.Children.Add(new ScrollViewer
        {
            HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
            Content = _navRail
        });

        return new Border
        {
            Background = Graphite.PanelBrush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(0),
            Child = dock
        };
    }

    private static string NavIconName(AppView view) => view switch
    {
        AppView.Home => "home",
        AppView.Dashes => "layout-dashboard",
        AppView.Devices => "device-desktop",
        AppView.Setups => "adjustments",
        AppView.RaceEngineer => "route",
        AppView.Settings => "settings",
        AppView.Help => "help-circle",
        AppView.DebugLive => "activity",
        AppView.DebugEngineer => "tool",
        AppView.DebugSetup => "adjustments",
        _ => "square"
    };

    private void AddNavGroup(string? label, string? icon, params (AppView View, string Label)[] items)
    {
        if (!string.IsNullOrWhiteSpace(label) && !_shell.SidebarCollapsed)
        {
            _navRail.Children.Add(NavGroupHeader(label, icon));
        }

        foreach (var item in items)
        {
            _navRail.Children.Add(NavButton(item.View, item.Label));
        }
    }

    // A sidebar group header: a leading muted icon + dim, condensed, uppercase
    // label, with clear top margin so groups read as distinct sections rather than
    // crowding the item above them.
    private static Control NavGroupHeader(string label, string? icon)
    {
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 7,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(10, 16, 10, 2),
        };
        if (!string.IsNullOrWhiteSpace(icon))
        {
            var glyph = Icons.Create(icon, 13, Graphite.Text3Brush);
            glyph.VerticalAlignment = VerticalAlignment.Center;
            row.Children.Add(glyph);
        }

        row.Children.Add(new TextBlock
        {
            Text = label.ToUpperInvariant(),
            FontFamily = Graphite.CondensedFontStack,
            FontSize = 11,
            FontWeight = FontWeight.SemiBold,
            Foreground = Graphite.Text3Brush,
            VerticalAlignment = VerticalAlignment.Center,
        });
        return row;
    }

    // An upcoming pillar: the destination is navigable (it routes to a placeholder
    // page) but the rail marks it as not-yet-shipped with a muted "Soon" chip so the
    // roadmap is visible and the navigation never rearranges as pillars land (US10).
    private void AddUpcomingNavGroup(string label, (AppView View, string Label) item)
    {
        if (!_shell.SidebarCollapsed)
        {
            _navRail.Children.Add(Graphite.SectionLabel(label));
        }

        var button = NavButton(item.View, item.Label);
        if (_shell.SidebarCollapsed)
        {
            _navRail.Children.Add(button);
            return;
        }

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        Grid.SetColumn(button, 0);
        row.Children.Add(button);
        var soon = Graphite.Chip("Soon", Graphite.Text3Brush);
        soon.IsHitTestVisible = false;
        soon.HorizontalAlignment = HorizontalAlignment.Right;
        soon.Margin = new Thickness(0, 0, 6, 0);
        Grid.SetColumn(soon, 1);
        row.Children.Add(soon);
        _navRail.Children.Add(row);
    }

    private Button NavButton(AppView view, string label)
    {
        var active = view == _shell.View;
        var collapsed = _shell.SidebarCollapsed;
        var button = Graphite.NavigationItem(NavIconName(view), label, active, collapsed);
        button.Click += (_, _) => Navigate(view);

        return button;
    }

    private Button ChromeButton(string iconName, Action action, string? tooltip = null)
    {
        return Graphite.ChromeIconButton(iconName, tooltip ?? iconName, action);
    }

    private void Navigate(AppView view)
    {
        var previous = _shell.View;
        CloseCommandPalette();
        CloseConfirmDialog();
        CloseDeviceCatalogDialog();
        if (_dashEditor is not null && _restoreSidebarAfterEditor && _shell.SidebarCollapsed)
        {
            _shell.ToggleSidebar();
            _restoreSidebarAfterEditor = false;
        }

        _dashEditor = null;
        if (view == AppView.Devices)
        {
            _selectedDeviceId = null;
            _deviceBindingPickerOpen = false;
        }

        _shell.Navigate(view);
        _log.Info($"UI navigation: from={previous} to={view}.");
        BuildShell();
        RenderBody();
    }

    private ShellCommandRegistry CreateShellCommands()
    {
        return new ShellCommandRegistry(
        [
            new("nav.home", "Go to Home", "overview session", "Alt+1", () => Navigate(AppView.Home)),
            new("nav.dashes", "Go to Dashes", "dash layouts dashboard", "Alt+2", () => Navigate(AppView.Dashes)),
            new("nav.devices", "Go to Devices", "screens wheels bindings", "Alt+3", () => Navigate(AppView.Devices)),
            new("nav.setups", "Go to Setups", "car setup compare", "Alt+4", () => Navigate(AppView.Setups)),
            new("nav.settings", "Go to Settings", "preferences profile updates", "Alt+5", () => Navigate(AppView.Settings)),
            new("nav.help", "Open Help", "reference shortcuts", "Alt+6", () => Navigate(AppView.Help)),
            new("dash.create", "Create dash", "new layout dashboard", null, () =>
            {
                _shell.Navigate(AppView.Dashes);
                BuildShell();
                OpenDashEditor(_runtime.CreateDashLayout(ScreenProfileCatalog.Default));
            }),
            new("device.add", "Add device", "screen wheel catalog", null, () =>
            {
                _shell.Navigate(AppView.Devices);
                _selectedDeviceId = null;
                BuildShell();
                RenderBody();
                ShowDeviceCatalogDialog();
            }),
            new("shell.sidebar", "Toggle sidebar", "collapse expand navigation", null, ToggleSidebar),
            new("updates.check", "Check for updates", "release version", null, () => Navigate(AppView.Settings)),
            new("help.shortcuts", "Open keyboard shortcuts", "keys commands", null, () => Navigate(AppView.Help)),
        ]);
    }

    private void ToggleSidebar()
    {
        _shell.ToggleSidebar();
        _runtime.Settings.SidebarCollapsed = _shell.SidebarCollapsed;
        _runtime.SaveSettings();
        BuildShell();
        RenderBody();
    }

    private void OpenDashEditor(DashLayout layout)
    {
        if (Bounds.Width > 0 && Bounds.Width < 1240 && !_shell.SidebarCollapsed)
        {
            _shell.ToggleSidebar();
            _restoreSidebarAfterEditor = true;
            BuildShell();
        }

        _dashEditor = CreateDashEditor(layout);
        RenderBody();
    }

    private DashEditorView CreateDashEditor(DashLayout layout)
    {
        var controller = new DashEditorController(layout, _runtime.SaveDashLayout, () => ResolveApplyAvailability(layout.Id));
        // Explicit Apply-to-screen: persist the current design, then re-sync the
        // hardware publishers so the assigned physical screen renders it through the
        // canonical painter → RGB565 → device pipeline (US27/US28). No live mirroring
        // happens during editing; only this intent reaches the wheel.
        controller.ApplyToScreenRequested += (_, applied) =>
        {
            _runtime.SaveDashLayout(applied);
            _screens.Sync();
        };
        return new DashEditorView(controller, _runtime.Settings, CurrentTelemetryFrame, CloseDashEditor);
    }

    /// <summary>
    /// The honest Apply-to-screen state for a dash: available only when at least one enabled
    /// screen device targets it, with a summary naming the target screens (US27/US34). The
    /// summary drives the editor button's tooltip and disabled state.
    /// </summary>
    private DashApplyAvailability ResolveApplyAvailability(string dashId)
    {
        var screens = DashDeviceAssignments.EnabledScreensFor(_runtime.Devices, dashId);
        if (screens.Count == 0)
        {
            return DashApplyAvailability.None;
        }

        var names = string.Join(", ", screens.Select(screen => screen.Name));
        return new DashApplyAvailability(true, $"Apply to {names}");
    }

    private void CloseDashEditor()
    {
        _dashEditor = null;
        if (_restoreSidebarAfterEditor && _shell.SidebarCollapsed)
        {
            _shell.ToggleSidebar();
        }

        _restoreSidebarAfterEditor = false;
        Navigate(AppView.Dashes);
    }

    private Control DashEditorPage()
    {
        if (_dashEditor is null)
        {
            var layout = _runtime.DashLayouts.FirstOrDefault(item => item.IsDefault)
                ?? _runtime.DashLayouts.First();
            _dashEditor = CreateDashEditor(layout);
        }

        return _dashEditor;
    }

    private void BeginDrag(object? sender, PointerPressedEventArgs e)
    {
        var point = e.GetCurrentPoint(this);
        if (point.Properties.IsLeftButtonPressed && WindowDragPolicy.ShouldBeginDrag(e.Source))
        {
            BeginMoveDrag(e);
            e.Handled = true;
        }
    }

    private void ToggleMaximized()
    {
        WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;
    }

    private TelemetryFrame CurrentTelemetryFrame()
    {
        var frame = _engine.Snapshot.Frame;
#if DEBUG
        return _developmentGameState.Resolve(frame);
#else
        return frame;
#endif
    }

    private void TickTelemetry()
    {
        var now = DateTimeOffset.UtcNow;

        // Drain the engine's latest published snapshot (a consistent, atomic value).
        // The background reader owns acquisition, rate measurement and delta; freshness
        // is applied here against the UI clock inside the status presenter.
        var snapshot = _engine.Snapshot;
        var displayedFrame = CurrentTelemetryFrame();
        _telemetry = LiveTelemetryPresenter.ToSnapshot(displayedFrame);
        var health = TelemetryStatusPresenter.Present(snapshot.Status, snapshot.Hz, now);
#if DEBUG
        if (_developmentGameState.Enabled)
        {
            _statusView = new TelemetryStatusView
            {
                Label = "DEV SIMULATION",
                RateText = "LOCAL",
                Tone = StatusTone.Warn,
                Detail = "Global development telemetry override is active.",
            };
            _surfaceState = null;
        }
        else
        {
            _statusView = health.Titlebar;
            _surfaceState = health.Surface;
        }
#else
        _statusView = health.Titlebar;
        _surfaceState = health.Surface;
#endif

        UpdateTitlebar();
        RefreshScreenStatusIndicators();
        // Animate the device detail mirror in place (no body rebuild) while the user
        // is watching the live preview of the assigned dash.
        if (_shell.View == AppView.Devices
            && _devicePreviewPainter is not null
            && _devicePreviewState == DashPreviewState.Live
            && _runtime.Settings.DevicesUI.LivePreview)
        {
            RenderDevicePreviewFrame();
        }

        if (_shell.View == AppView.DebugLive)
        {
            RenderBody();
        }
    }

    internal void RefreshScreenStatusIndicators()
    {
        foreach (var device in _runtime.Devices.Where(DeviceCapabilities.HasScreen))
        {
            var view = DeviceStatusView(device);
            var signature = $"{view.Label}|{view.Detail}";
            if (_renderedDeviceStatuses.TryGetValue(device.Id, out var previous)
                && string.Equals(previous, signature, StringComparison.Ordinal))
            {
                continue;
            }

            _renderedDeviceStatuses[device.Id] = signature;
            if (_deviceStatusPills.TryGetValue(device.Id, out var pills))
            {
                foreach (var pill in pills)
                {
                    ApplyDeviceStatusPill(pill, view);
                }
            }

            if (_deviceStatusDetails.TryGetValue(device.Id, out var details))
            {
                foreach (var detail in details)
                {
                    detail.Text = view.Detail;
                }
            }

            _log.Debug(
                $"Screen status UI refreshed: device={device.Id} state={view.Label} view={_shell.View}.");
        }
    }

    private void UpdateTitlebar()
    {
        if (_breadcrumb is null || _signalText is null || _hzText is null || _signalDot is null)
        {
            return;
        }

        _breadcrumb.Text = _shell.CurrentTitle;
        if (_groupCrumb is not null)
        {
            _groupCrumb.Text = $"· {_shell.CurrentGroup}";
        }
        _signalText.Text = _statusView.Label;
        _hzText.Text = _statusView.RateText;
        _hzIndicator.IsVisible = !string.Equals(_statusView.RateText, "—", StringComparison.Ordinal);
        _signalDot.Background = BrushForTone(_statusView.Tone);
    }

    private static IBrush BrushForTone(StatusTone tone) => tone switch
    {
        StatusTone.Live => Graphite.GreenBrush,
        StatusTone.Warn => Graphite.YellowBrush,
        StatusTone.Fault => Graphite.RedBrush,
        _ => Graphite.Text3Brush
    };

    protected override void OnClosed(EventArgs e)
    {
        _timer.Stop();
        _setupUndoTimer?.Stop();
        foreach (var toastTimer in _toastTimers)
        {
            toastTimer.Stop();
        }

        _toastTimers.Clear();
        DisposeDevicePreview();
#if DEBUG
        _diagnosticsWindow?.Close();
        _diagnosticsWindow = null;
#endif
        _log.Info("Main window closed; stopping screen and telemetry services.");
        // Stop + release all hardware screen publishers before tearing down telemetry.
        _screens.Dispose();
        // Disposing the engine cancels + joins the reader thread, then disposes the
        // wrapped source (terminal) — synchronous, so the source is fully released
        // before we return (the headless close-then-assert path relies on this).
        _engine.Dispose();
        base.OnClosed(e);
    }

    private void RenderBody()
    {
        UpdateTitlebar();
        _deviceStatusPills.Clear();
        _deviceStatusDetails.Clear();
        // The device preview owns a live frame source + bitmap tied to the controls
        // in the tree we are about to discard; drop it so the detail rebuild (if any)
        // recreates a fresh one bound to the new visuals.
        DisposeDevicePreview();
        _body.Content = _shell.View switch
        {
            AppView.Home => HomePage(),
            AppView.Dashes => _dashEditor is null ? DashesPage() : DashEditorPage(),
            AppView.Devices => DevicesPage(),
            AppView.Setups => SetupPage(),
            AppView.RaceEngineer => UpcomingPillarPage(),
            AppView.Settings => SettingsPage(),
            AppView.Help => HelpPage(),
            AppView.DebugLive => LivePage(),
            AppView.DebugEngineer => EngineerPage(),
            AppView.DebugSetup => SetupPage(),
            _ => DashesPage()
        };
    }

    // Home is a runtime-driven launchpad (US11/US12): the live session, the user's
    // dashes with direct entry into the editor, and the connected wheel screens with
    // their assigned dash. No sample data — everything is read from the runtime.
    private Control HomePage()
    {
        var stack = PageStack();
        stack.Children.Add(PageHeader("Home", "Session, dashes, and connected hardware",
            Graphite.StatusPill(_statusView.Label, BrushForTone(_statusView.Tone))));

        var screens = _runtime.Devices.Where(IsScreenDevice).ToList();
        var connected = screens.Count(device => !device.Disabled && _screens.StatusFor(device.Id)?.IsConnected == true);

        var sessionText = new StackPanel { Spacing = 3 };
        sessionText.Children.Add(Graphite.TextBlock(_statusView.Label, 15, FontWeight.Medium, Graphite.TextBrush));
        sessionText.Children.Add(Graphite.TextBlock(
            $"{_statusView.RateText} · {connected} of {screens.Count} screens connected",
            12, FontWeight.Normal, Graphite.Text3Brush));
        if (_surfaceState is { } surface)
        {
            var detail = SurfaceStatePresenter.Describe(surface);
            sessionText.Children.Add(Graphite.TextBlock(detail.Detail, 12, FontWeight.Normal, Graphite.Text2Brush, TextWrapping.Wrap));
        }

        var session = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto") };
        var sessionDot = new Border
        {
            Width = 9,
            Height = 9,
            Margin = new Thickness(0, 4, 12, 0),
            CornerRadius = new CornerRadius(Graphite.RadiusPill),
            Background = BrushForTone(_statusView.Tone),
            VerticalAlignment = VerticalAlignment.Top,
        };
        AddGrid(session, sessionDot, 0, 0);
        AddGrid(session, sessionText, 0, 1);
        AddGrid(session, ActionButton("Review devices", ButtonTone.Ghost, () => Navigate(AppView.Devices)), 0, 2);
        stack.Children.Add(new Border
        {
            Background = Graphite.Panel2Brush,
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Padding = new Thickness(16, 14),
            Child = session,
        });

        stack.Children.Add(LaunchpadDashes());
        stack.Children.Add(LaunchpadScreens(screens));

        return Scroll(stack);
    }

    // "Your dashes": every saved design as an openable card, plus a direct route into
    // the Dashboards pillar (US11).
    private Control LaunchpadDashes()
    {
        var panel = new StackPanel { Spacing = 10 };
        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(header, Graphite.SectionLabel("Your dashes"), 0, 0);
        AddGrid(header, ActionButton("Manage dashes", ButtonTone.Ghost, () => Navigate(AppView.Dashes)), 0, 1);
        panel.Children.Add(header);

        if (_runtime.DashLayouts.Count == 0)
        {
            panel.Children.Add(Graphite.StatePanel("No dashes yet", "Create your first dash to start designing for a wheel screen.", Graphite.Text3Brush));
        }
        else
        {
            foreach (var layout in _runtime.DashLayouts)
            {
                panel.Children.Add(LaunchpadDashCard(layout));
            }
        }

        return panel;
    }

    private Control LaunchpadDashCard(DashLayout layout)
    {
        var profile = ScreenProfileCatalog.Resolve(layout.ScreenProfileId);
        var assigned = DashDeviceAssignments.EnabledScreensFor(_runtime.Devices, layout.Id);
        var assignedText = assigned.Count == 0 ? "Not on a screen" : $"On {string.Join(", ", assigned.Select(screen => screen.Name))}";

        var text = new StackPanel { Spacing = 4, VerticalAlignment = VerticalAlignment.Center };
        text.Children.Add(Graphite.TextBlock(layout.Name, 14, FontWeight.Medium, Graphite.TextBrush));
        text.Children.Add(Graphite.TextBlock($"{profile.Orientation} {profile.ResolutionLabel} · {assignedText}", 12, FontWeight.Normal, Graphite.Text3Brush));
        if (layout.IsDefault)
        {
            text.Children.Add(Graphite.TextBlock("Default dash", 11, FontWeight.Medium, Graphite.GreenBrush));
        }

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto") };
        AddGrid(row, DashPreview(layout, 112, 67), 0, 0);
        text.Margin = new Thickness(14, 0);
        AddGrid(row, text, 0, 1);
        AddGrid(row, ActionButton("Open", ButtonTone.Ghost, () => OpenDashFromHome(layout)), 0, 2);

        return new Border
        {
            Tag = $"home-dash-card:{layout.Id}",
            MinHeight = 88,
            Background = Graphite.Panel2Brush,
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Padding = new Thickness(10),
            Child = row
        };
    }

    // "Connected screens": each saved wheel screen with model/resolution/status and the
    // dash currently assigned to it (US11/US29/US33), routing into the Devices pillar.
    private Control LaunchpadScreens(IReadOnlyList<SavedDevice> screens)
    {
        var panel = new StackPanel { Spacing = 8 };
        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(header, Graphite.SectionLabel("Connected screens"), 0, 0);
        AddGrid(header, ActionButton("Manage devices", ButtonTone.Ghost, () => Navigate(AppView.Devices)), 0, 1);
        panel.Children.Add(header);

        if (screens.Count == 0)
        {
            panel.Children.Add(Graphite.StatePanel("No screens added", "Add your wheel screen in Devices to assign a dash to it.", Graphite.Text3Brush));
        }
        else
        {
            foreach (var device in screens)
            {
                panel.Children.Add(LaunchpadScreenRow(device));
            }
        }

        return panel;
    }

    private Control LaunchpadScreenRow(SavedDevice device)
    {
        var dash = _runtime.DashLayouts.FirstOrDefault(layout => layout.Id == device.DashId);
        var text = new StackPanel { Spacing = 2 };
        text.Children.Add(Graphite.TextBlock(device.Name, 13, FontWeight.SemiBold, Graphite.TextBrush));
        text.Children.Add(Graphite.TextBlock($"{device.Width} × {device.Height} · {dash?.Name ?? "No dash assigned"}", 11, FontWeight.Normal, Graphite.Text3Brush));

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(row, text, 0, 0);
        AddGrid(row, DeviceStatusPill(device), 0, 1);

        var button = Graphite.Button(device.Name, ButtonTone.Ghost);
        button.Content = row;
        button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        button.Padding = new Thickness(10, 8);
        button.MinHeight = 52;
        button.Tag = $"home-screen-row:{device.Id}";
        button.Click += (_, _) => OpenDeviceDetail(device);
        return button;
    }

    private void OpenDashFromHome(DashLayout layout)
    {
        // Land on the Dashboards pillar with the editor already open on this dash.
        _shell.Navigate(AppView.Dashes);
        BuildShell();
        OpenDashEditor(layout);
    }

    private void OpenDeviceDetail(SavedDevice device)
    {
        _shell.Navigate(AppView.Devices);
        _selectedDeviceId = device.Id;
        CloseDeviceCatalogDialog();
        BuildShell();
        RenderBody();
    }

    private Control RuntimeSummaryCard(string label, string value, string caption)
    {
        var stack = new StackPanel { Spacing = 6 };
        stack.Children.Add(Graphite.SectionLabel(label));
        stack.Children.Add(Graphite.TextBlock(value, 22, FontWeight.Bold, Graphite.TextBrush));
        stack.Children.Add(Graphite.TextBlock(caption, 11, FontWeight.Normal, Graphite.Text3Brush));
        return Graphite.Card(stack);
    }

    private Control LivePage()
    {
        var stack = PageStack();
        stack.Children.Add(PageHeader("Live", "Telemetry grid, timing, pedals, tyres", Graphite.StatusPill(_statusView.Label, BrushForTone(_statusView.Tone))));

        // Honest shared failure/empty state when the link isn't live + healthy.
        if (_surfaceState is { } surface)
        {
            var view = SurfaceStatePresenter.Describe(surface);
            stack.Children.Add(Graphite.StatePanel(view.Title, view.Detail, BrushForTone(view.Tone)));
        }

        var metricGrid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,*,*,*"),
            RowDefinitions = new RowDefinitions("Auto,Auto")
        };
        var telemetry = _telemetry;
        AddGrid(metricGrid, MetricTile("Speed", $"{telemetry.SpeedKph}", "km/h"), 0, 0);
        AddGrid(metricGrid, MetricTile("Gear", telemetry.Gear.ToString(), "current"), 0, 1);
        AddGrid(metricGrid, MetricTile("Lap", telemetry.LapTime, $"best {telemetry.BestLap}"), 0, 2);
        AddGrid(metricGrid, MetricTile("Delta", $"{telemetry.Delta:+0.000;-0.000;0.000}", "vs target", telemetry.Delta <= 0 ? Graphite.GreenBrush : Graphite.RedBrush), 0, 3);
        AddGrid(metricGrid, MetricTile("RPM", $"{telemetry.Rpm}", $"{telemetry.RpmMax} max"), 1, 0);
        AddGrid(metricGrid, MetricTile("Fuel", $"{telemetry.FuelLiters}", "liters"), 1, 1);
        AddGrid(metricGrid, MetricTile("Sector", $"S{telemetry.Sector}", "active"), 1, 2);
        AddGrid(metricGrid, PedalTile(), 1, 3);
        stack.Children.Add(metricGrid);

        var lower = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("2*,*"),
            RowDefinitions = new RowDefinitions("Auto")
        };
        AddGrid(lower, Graphite.Card(TrackMap()), 0, 0);
        AddGrid(lower, Graphite.Card(TyrePanel()), 0, 1);
        stack.Children.Add(lower);

        return Scroll(stack);
    }

    private Control EngineerPage()
    {
        var stack = PageStack();
        var dirty = _runtime.EngineerControls.Count(control => Math.Abs(control.CarValue - control.StagedValue) > 0.001);
        var (operationLabel, operationBrush) = _runtime.EngineerPushState switch
        {
            ExternalOperationState.Pending => ("Pending acknowledgement", Graphite.YellowBrush),
            ExternalOperationState.Confirmed => ("Confirmed", Graphite.GreenBrush),
            ExternalOperationState.Failed => ("Push failed", Graphite.RedBrush),
            _ => (dirty == 0 ? "In sync" : $"{dirty} staged", dirty == 0 ? Graphite.GreenBrush : Graphite.YellowBrush),
        };
        stack.Children.Add(PageHeader("Engineer", "Race control, staged car controls, radio log",
            Graphite.StatusPill(operationLabel, operationBrush)));

        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("2*,*"),
            RowDefinitions = new RowDefinitions("Auto")
        };

        var controls = new StackPanel { Spacing = 10 };
        controls.Children.Add(Graphite.SectionLabel("Car Controls"));
        foreach (var control in _runtime.EngineerControls)
        {
            controls.Children.Add(ControlRow(
                control.Label,
                $"Car {DesktopRuntime.FormatControlValue(control, control.CarValue)}",
                DesktopRuntime.FormatControlValue(control, control.StagedValue),
                () =>
                {
                    control.StagedValue = Math.Max(control.Min, control.StagedValue - control.Step);
                    RenderBody();
                },
                () =>
                {
                    control.StagedValue = Math.Min(control.Max, control.StagedValue + control.Step);
                    RenderBody();
                }));
        }

        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right
        };
        var pending = _runtime.EngineerPushState == ExternalOperationState.Pending;
        var revert = ActionButton("Revert", ButtonTone.Ghost, () =>
        {
            _runtime.RevertEngineerChanges();
            RenderBody();
        });
        revert.IsEnabled = dirty > 0 && !pending;
        if (!revert.IsEnabled)
        {
            ToolTip.SetTip(revert, pending ? "Waiting for car acknowledgement." : "No staged changes to revert.");
        }
        actions.Children.Add(revert);

        var push = ActionButton("Push staged changes", ButtonTone.Primary, () =>
        {
            _runtime.PushEngineerChanges();
            RenderBody();
        });
        push.IsEnabled = dirty > 0 && !pending;
        if (!push.IsEnabled)
        {
            ToolTip.SetTip(push, pending ? "Waiting for car acknowledgement." : "Stage a change before pushing.");
        }
        actions.Children.Add(push);
        controls.Children.Add(actions);
        AddGrid(grid, Graphite.Card(controls), 0, 0);

        var side = new StackPanel { Spacing = 12 };
        side.Children.Add(StagedChangesPanel());
        side.Children.Add(QuickMessagePanel());
        side.Children.Add(RadioLogPanel());
        AddGrid(grid, side, 0, 1);

        stack.Children.Add(grid);
        return Scroll(stack);
    }

    private Control SetupPage()
    {
        var stack = PageStack();
        EnsureSelectedSetup();
        var selectedIsTemplate = IsSetupTemplate(_selectedSetup);
        stack.Children.Add(PageHeader("Setups", "Templates, user setup copies, and A/B comparison cues",
            Graphite.StatusPill(selectedIsTemplate ? "Template" : "User setup", selectedIsTemplate ? Graphite.Text3Brush : Graphite.BlueBrush)));
        if (_deletedSetup is not null)
        {
            stack.Children.Add(SetupDeletionUndoPanel(_deletedSetup.Name));
        }

        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("280,*"),
            RowDefinitions = new RowDefinitions("Auto")
        };

        var programs = new StackPanel { Spacing = 8 };
        programs.Children.Add(Graphite.SectionLabel("Setup templates"));
        foreach (var program in _runtime.SetupTemplates)
        {
            var button = Graphite.Button(program.Name, ButtonTone.Ghost);
            button.Background = program == _selectedSetup ? Graphite.Panel3Brush : Brushes.Transparent;
            button.Foreground = program == _selectedSetup ? Graphite.TextBrush : Graphite.Text2Brush;
            button.HorizontalContentAlignment = HorizontalAlignment.Left;
            button.Click += (_, _) =>
            {
                _selectedSetup = program;
                RenderBody();
            };
            programs.Children.Add(button);
        }

        programs.Children.Add(Graphite.SectionLabel("User setups"));
        if (_runtime.SetupPrograms.Count == 0)
        {
            programs.Children.Add(Graphite.TextBlock("Duplicate a template before editing.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        }
        else
        {
            foreach (var program in _runtime.SetupPrograms)
            {
                var button = Graphite.Button(program.Name, ButtonTone.Ghost);
                button.Background = program == _selectedSetup ? Graphite.Panel3Brush : Brushes.Transparent;
                button.Foreground = program == _selectedSetup ? Graphite.TextBrush : Graphite.Text2Brush;
                button.HorizontalContentAlignment = HorizontalAlignment.Left;
                button.Click += (_, _) =>
                {
                    _selectedSetup = program;
                    RenderBody();
                };
                programs.Children.Add(button);
            }
        }

        var programActions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        programActions.Children.Add(ActionButton(selectedIsTemplate ? "Duplicate template" : "Duplicate setup", ButtonTone.Neutral, () =>
        {
            var copy = _runtime.DuplicateSetup(_selectedSetup);
            _selectedSetup = copy;
            RenderBody();
        }));
        if (!selectedIsTemplate && _runtime.SetupPrograms.Count > 0)
        {
            programActions.Children.Add(ActionButton("Delete", ButtonTone.Danger, DeleteSelectedSetup));
        }

        programs.Children.Add(programActions);
        programs.Children.Add(SetupComparePanel());
        AddGrid(grid, Graphite.Card(programs), 0, 0);

        var editor = new StackPanel { Spacing = 12 };
        foreach (var group in DesktopRuntime.SetupParameters.GroupBy(parameter => parameter.Group))
        {
            var groupStack = new StackPanel { Spacing = 8 };
                groupStack.Children.Add(Graphite.SectionLabel(group.Key));
            foreach (var parameter in group)
            {
                var value = _selectedSetup.Values.TryGetValue(parameter.Key, out var current)
                    ? current
                    : parameter.Min;
                groupStack.Children.Add(ControlRow(
                    parameter.Label,
                    $"{parameter.Min:0.#} - {parameter.Max:0.#} {parameter.Unit}".Trim(),
                    DesktopRuntime.FormatSetupValue(parameter, value),
                    () =>
                    {
                        if (selectedIsTemplate)
                        {
                            return;
                        }

                        _selectedSetup.Values[parameter.Key] = Math.Max(parameter.Min, value - parameter.Step);
                        _runtime.SaveSetupPrograms();
                        RenderBody();
                    },
                    () =>
                    {
                        if (selectedIsTemplate)
                        {
                            return;
                        }

                        _selectedSetup.Values[parameter.Key] = Math.Min(parameter.Max, value + parameter.Step);
                        _runtime.SaveSetupPrograms();
                        RenderBody();
                    }));
            }
            editor.Children.Add(new Border
            {
                BorderBrush = Graphite.LineBrush,
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(0, 6, 0, 18),
                Child = groupStack,
            });
        }
        AddGrid(grid, editor, 0, 1);

        stack.Children.Add(grid);
        return Scroll(stack);
    }

    private void DeleteSelectedSetup()
    {
        if (IsSetupTemplate(_selectedSetup))
        {
            return;
        }

        _setupUndoTimer?.Stop();
        _deletedSetup = _selectedSetup;
        _deletedSetupIndex = Math.Max(0, _runtime.SetupPrograms.IndexOf(_selectedSetup));
        _runtime.SetupPrograms.Remove(_selectedSetup);
        _selectedSetup = _runtime.SetupPrograms.FirstOrDefault()
            ?? _runtime.SetupTemplates.FirstOrDefault()
            ?? new SetupProgram { Id = "setup-empty", Name = "No setup" };
        _runtime.SaveSetupPrograms();

        _setupUndoTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(8) };
        _setupUndoTimer.Tick += (_, _) =>
        {
            _setupUndoTimer?.Stop();
            _setupUndoTimer = null;
            _deletedSetup = null;
            if (_shell.View is AppView.Setups or AppView.DebugSetup)
            {
                RenderBody();
            }
        };
        _setupUndoTimer.Start();
        RenderBody();
    }

    private Control SetupDeletionUndoPanel(string name)
    {
        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), ColumnSpacing = 12 };
        var copy = new StackPanel { Spacing = 2 };
        copy.Children.Add(Graphite.TextBlock("Setup deleted", 13, FontWeight.Medium));
        copy.Children.Add(Graphite.TextBlock($"{name} can be restored for 8 seconds.", 11, FontWeight.Normal, Graphite.Text2Brush));
        AddGrid(row, copy, 0, 0);
        AddGrid(row, ActionButton("Undo", ButtonTone.Neutral, UndoSetupDeletion), 0, 1);
        return new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusGroup),
            Padding = new Thickness(12, 10),
            Child = row,
        };
    }

    private void UndoSetupDeletion()
    {
        if (_deletedSetup is null)
        {
            return;
        }

        _setupUndoTimer?.Stop();
        _setupUndoTimer = null;
        var restored = _deletedSetup;
        _runtime.SetupPrograms.Insert(Math.Clamp(_deletedSetupIndex, 0, _runtime.SetupPrograms.Count), restored);
        _selectedSetup = restored;
        _deletedSetup = null;
        _runtime.SaveSetupPrograms();
        RenderBody();
    }

    private void EnsureSelectedSetup()
    {
        if (_runtime.SetupPrograms.Contains(_selectedSetup) || _runtime.SetupTemplates.Contains(_selectedSetup))
        {
            return;
        }

        _selectedSetup = _runtime.SetupPrograms.FirstOrDefault()
            ?? _runtime.SetupTemplates.FirstOrDefault()
            ?? new SetupProgram { Id = "setup-empty", Name = "No setup" };
    }

    private bool IsSetupTemplate(SetupProgram setup)
    {
        return setup.IsTemplate || _runtime.SetupTemplates.Contains(setup);
    }

    private Control DashesPage()
    {
        var stack = PageStack();
        stack.Children.Add(PageHeader("Dashes", "Saved wheel-display layouts and live previews",
            Graphite.StatusPill($"{_runtime.DashLayouts.Count} layouts", Graphite.BlueBrush)));

        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right
        };
        // Pick the target wheel-screen size at creation so a new dash is designed at the
        // exact shape it will run on from the first widget (US15).
        var createSize = Graphite.ComboBox(
            ScreenProfileCatalog.All.Select(profile => profile.Name),
            ScreenProfileCatalog.Default.Name,
            180);
        ToolTip.SetTip(createSize, "Target wheel-screen size for the new dash");
        actions.Children.Add(createSize);
        actions.Children.Add(ActionButton("Create dash", ButtonTone.Primary, () =>
        {
            var profile = ScreenProfileCatalog.All.FirstOrDefault(p => string.Equals(p.Name, createSize.SelectedItem?.ToString(), StringComparison.Ordinal))
                ?? ScreenProfileCatalog.Default;
            var created = _runtime.CreateDashLayout(profile);
            OpenDashEditor(created);
        }));
        stack.Children.Add(actions);

        var library = new StackPanel { Spacing = 8 };
        foreach (var layout in _runtime.DashLayouts)
        {
            library.Children.Add(DashLayoutCard(layout));
        }

        stack.Children.Add(library);
        return Scroll(stack);
    }

    private Control SetupComparePanel()
    {
        var panel = new StackPanel { Spacing = 6, Margin = new Thickness(0, 6, 0, 0) };
        panel.Children.Add(Graphite.SectionLabel("A/B Compare"));

        var others = _runtime.SetupPrograms
            .Concat(_runtime.SetupTemplates)
            .Where(program => program != _selectedSetup)
            .ToArray();
        if (others.Length == 0)
        {
            panel.Children.Add(Graphite.TextBlock("Add another program to compare.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
            return panel;
        }

        if (_setupCompareBaseline is null || !others.Contains(_setupCompareBaseline))
        {
            _setupCompareBaseline = others[0];
        }

        var combo = new ComboBox
        {
            ItemsSource = others,
            SelectedItem = _setupCompareBaseline,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            HorizontalAlignment = HorizontalAlignment.Stretch
        };
        combo.SelectionChanged += (_, _) =>
        {
            _setupCompareBaseline = combo.SelectedItem as SetupProgram ?? others[0];
            RenderBody();
        };
        panel.Children.Add(combo);

        var prediction = SetupComparison.Compare(_setupCompareBaseline, _selectedSetup);
        var delta = prediction.LapDeltaSeconds;
        var brush = delta < 0 ? Graphite.GreenBrush : delta > 0 ? Graphite.RedBrush : Graphite.Text2Brush;
        panel.Children.Add(Graphite.TextBlock($"{_selectedSetup.Name} vs {_setupCompareBaseline.Name}", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        panel.Children.Add(Graphite.TextBlock($"{delta:+0.000;-0.000;0.000} s predicted", 17, FontWeight.Bold, brush));
        return panel;
    }

    private Control DevicesPage()
    {
        var selected = _selectedDeviceId is null
            ? null
            : _runtime.Devices.FirstOrDefault(device => device.Id == _selectedDeviceId);
        return selected is null ? DevicesOverview() : DeviceDetailPage(selected);
    }

    // The overview lists saved devices as either a visual gallery (default) or a
    // compact list; both drill into the same full-page detail. The chosen view
    // persists in settings so the page opens the way the user left it.
    private Control DevicesOverview()
    {
        var stack = PageStack();

        var isList = IsDeviceListView();
        var actions = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var addButton = ActionButton("Add device", ButtonTone.Primary, () => ShowDeviceCatalogDialog());
        addButton.HorizontalAlignment = HorizontalAlignment.Left;
        AddGrid(actions, addButton, 0, 0);
        if (_runtime.Devices.Count > 0)
        {
            AddGrid(actions, Graphite.Segmented(
                ["Gallery", "List"],
                isList ? 1 : 0,
                index => SetDeviceViewMode(index == 1 ? "list" : "gallery")), 0, 1);
        }

        stack.Children.Add(actions);

        if (_runtime.Devices.Count == 0)
        {
            stack.Children.Add(Graphite.StatePanel(
                "No devices yet",
                "Add a wheel or screen to assign a dash, tune its display, and bind its buttons.",
                Graphite.Text3Brush));
            return Scroll(stack);
        }

        stack.Children.Add(isList ? DeviceListView() : DeviceGalleryView());
        return Scroll(stack);
    }

    private bool IsDeviceListView() =>
        string.Equals(_runtime.Settings.DevicesUI.ViewMode, "list", StringComparison.OrdinalIgnoreCase);

    private void SetDeviceViewMode(string mode)
    {
        if (string.Equals(_runtime.Settings.DevicesUI.ViewMode, mode, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        _runtime.Settings.DevicesUI.ViewMode = mode;
        _runtime.SaveSettings();
        RenderBody();
    }

    private void SelectDeviceDetail(SavedDevice device)
    {
        _selectedDeviceId = device.Id;
        _deviceBindingPickerOpen = false;
        _devicePreviewState = DashPreviewState.Live;
        RenderBody();
    }

    private Control DeviceGalleryView()
    {
        var wrap = new WrapPanel { Orientation = Orientation.Horizontal };
        foreach (var device in _runtime.Devices)
        {
            wrap.Children.Add(DeviceGalleryCard(device));
        }

        wrap.Children.Add(AddDeviceTile());
        return wrap;
    }

    private const double GalleryCardWidth = 240;
    private const double GalleryPreviewHeight = 138;

    private Control DeviceGalleryCard(SavedDevice device)
    {
        var body = new StackPanel { Spacing = 10 };
        body.Children.Add(DeviceCardVisual(device, GalleryCardWidth - 28, GalleryPreviewHeight));

        var titleRow = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var name = Graphite.TextBlock(device.Name, 14, FontWeight.SemiBold, Graphite.TextBrush, TextWrapping.NoWrap);
        name.TextTrimming = TextTrimming.CharacterEllipsis;
        name.VerticalAlignment = VerticalAlignment.Center;
        AddGrid(titleRow, name, 0, 0);
        AddGrid(titleRow, DeviceCardActions(device), 0, 1);

        body.Children.Add(titleRow);
        body.Children.Add(Graphite.TextBlock(DeviceSubtitle(device), 11, FontWeight.Normal, Graphite.Text3Brush));

        var card = Graphite.Card(body);
        card.Width = GalleryCardWidth;
        card.Margin = new Thickness(0, 0, 12, 12);
        return WrapClickable(card, $"device-card:{device.Id}", device.Name, () => SelectDeviceDetail(device));
    }

    // The trailing controls shown on a card/row: the live status pill (screen
    // devices) plus a kebab menu that enables/disables or removes the device
    // without opening the detail (US quick actions).
    private Control DeviceCardActions(SavedDevice device)
    {
        var group = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 4, VerticalAlignment = VerticalAlignment.Center };
        if (IsScreenDevice(device))
        {
            group.Children.Add(DeviceStatusPill(device));
        }

        group.Children.Add(DeviceKebab(device));
        return group;
    }

    private Control DeviceKebab(SavedDevice device)
    {
        var button = Graphite.Button(string.Empty, ButtonTone.Ghost);
        button.Content = Icons.Create("dots-vertical", 16, Graphite.Text3Brush);
        button.Width = 28;
        button.MinHeight = 28;
        button.Padding = new Thickness(0);
        button.Tag = $"device-menu:{device.Id}";
        button.VerticalAlignment = VerticalAlignment.Center;
        button.Cursor = new Cursor(StandardCursorType.Hand);
        ToolTip.SetTip(button, "Device actions");
        AutomationProperties.SetName(button, $"{device.Name} actions");

        var flyout = new MenuFlyout();
        var toggle = new MenuItem { Header = device.Disabled ? "Enable" : "Disable" };
        toggle.Click += (_, _) =>
        {
            device.Disabled = !device.Disabled;
            _runtime.SaveDevices();
            _screens.Sync();
            RenderBody();
        };
        flyout.Items.Add(toggle);
        var remove = new MenuItem { Header = "Remove" };
        remove.Click += (_, _) => ShowConfirmDialog(
            "Remove device?",
            $"{device.Name} and its command bindings will be removed.",
            "Remove device",
            () =>
            {
                CancelDeviceCapture(device.Id);
                _runtime.RemoveDevice(device);
                if (string.Equals(_selectedDeviceId, device.Id, StringComparison.Ordinal))
                {
                    _selectedDeviceId = null;
                }

                _deviceBindingPickerOpen = false;
                _screens.Sync();
                RenderBody();
            });
        flyout.Items.Add(remove);
        button.Flyout = flyout;
        return button;
    }

    // The card visual is the whole point of the gallery: a screen device shows a
    // static mirror of its assigned dash (rendered through the real hardware
    // pipeline), a buttons-only device shows an icon + its bound-button count.
    private Control DeviceCardVisual(SavedDevice device, double width, double height)
    {
        // A dash mirror is only truthful for a dash-purpose screen; anything else is
        // idle, so the card falls through to the icon tile with its purpose label.
        if (DeviceCapabilities.DrivesDash(device)
            && RenderDeviceMirrorBitmap(device, DashPreviewFrames.For(DashPreviewState.MidLap)) is { } bitmap)
        {
            return DeviceMirrorDisplay(device, new Image { Source = bitmap }, width, height);
        }

        var icon = DeviceIcon(device);
        var inner = new StackPanel { Spacing = 6, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        inner.Children.Add(new Grid { Children = { Icons.Create(icon, 30, Graphite.AccentBrush) }, HorizontalAlignment = HorizontalAlignment.Center });
        if (IsScreenDevice(device) && DevicePurposes.Resolve(device.Purpose) is { Available: false } purpose)
        {
            inner.Children.Add(Graphite.TextBlock(purpose.Label, 11, FontWeight.Medium, Graphite.Text3Brush));
        }
        else if (!IsScreenDevice(device))
        {
            var count = device.Bindings.Count;
            inner.Children.Add(Graphite.TextBlock(count == 1 ? "1 button bound" : $"{count} buttons bound", 11, FontWeight.Medium, Graphite.Text3Brush));
        }

        return new Border
        {
            Width = width,
            Height = height,
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Child = new Grid { Children = { inner } },
        };
    }

    // The preview frame is the physical panel itself — always the device's native
    // pixel grid, never reshaped by rotation. The mirror buffer already has the
    // dash rotated onto that grid, so it is shown as-is: rotation spins the dash
    // within a fixed frame ("Horizontal" sits it upright, "Vertical" turns it).
    private static Control DeviceMirrorDisplay(SavedDevice device, Image image, double maxWidth, double maxHeight)
    {
        var scale = Math.Min(maxWidth / device.Width, maxHeight / device.Height);
        image.Width = device.Width * scale;
        image.Height = device.Height * scale;
        image.Stretch = Stretch.Fill;
        return ScreenBezel(image, device.Width * scale + 8, device.Height * scale + 8);
    }

    // A dark rounded "panel bezel" that frames the rendered dash mirror.
    private static Border ScreenBezel(Control content, double width, double height)
    {
        return new Border
        {
            Width = width,
            Height = height,
            Background = Brushes.Black,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(4),
            Child = new Grid { Children = { content } },
        };
    }

    private Control AddDeviceTile()
    {
        var inner = new StackPanel { Spacing = 8, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        inner.Children.Add(new Grid { Children = { Icons.Create("plus", 26, Graphite.AccentBrush) }, HorizontalAlignment = HorizontalAlignment.Center });
        inner.Children.Add(Graphite.TextBlock("Add device", 13, FontWeight.Medium, Graphite.Text2Brush));

        var tile = new Border
        {
            Width = GalleryCardWidth,
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusGroup),
            Margin = new Thickness(0, 0, 12, 12),
            MinHeight = GalleryPreviewHeight + 64,
            Child = new Grid { Children = { inner } },
        };
        return WrapClickable(tile, "device-add-tile", "Add device", () => ShowDeviceCatalogDialog());
    }

    private Control DeviceListView()
    {
        var list = new StackPanel { Spacing = 6 };
        foreach (var device in _runtime.Devices)
        {
            list.Children.Add(DeviceListRow(device));
        }

        return list;
    }

    private Control DeviceListRow(SavedDevice device)
    {
        var thumb = DeviceCardVisual(device, 76, 46);
        var text = new StackPanel { Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        text.Children.Add(Graphite.TextBlock(device.Name, 13, FontWeight.SemiBold, Graphite.TextBrush));
        text.Children.Add(Graphite.TextBlock(DeviceSubtitle(device), 11, FontWeight.Normal, Graphite.Text3Brush));

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"), ColumnSpacing = 12 };
        AddGrid(row, thumb, 0, 0);
        AddGrid(row, text, 0, 1);
        AddGrid(row, DeviceCardActions(device), 0, 2);

        var card = Graphite.Card(row, new Thickness(10));
        return WrapClickable(card, $"device-row:{device.Id}", device.Name, () => SelectDeviceDetail(device));
    }

    // Makes a card the single clickable, keyboard-focusable target. The margin
    // moves onto the button so its hover fill matches the card exactly (no stray
    // rounded box in the gap), and the Fluent ghost hover is replaced by a clean
    // card background/border lift on pointer-over.
    private Control WrapClickable(Border card, string tag, string name, Action onClick)
    {
        var margin = card.Margin;
        var restBackground = card.Background;
        var restBorder = card.BorderBrush;
        card.Margin = new Thickness(0);
        card.BorderThickness = new Thickness(1);

        var button = Graphite.Button(name, ButtonTone.Ghost);
        button.Content = card;
        button.Tag = tag;
        button.Margin = margin;
        button.Padding = new Thickness(0);
        button.Background = Brushes.Transparent;
        button.BorderThickness = new Thickness(0);
        button.CornerRadius = new CornerRadius(Graphite.RadiusGroup);
        button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        button.VerticalContentAlignment = VerticalAlignment.Stretch;
        button.Cursor = new Cursor(StandardCursorType.Hand);
        button.Resources["ButtonBackgroundPointerOver"] = Brushes.Transparent;
        button.Resources["ButtonBackgroundPressed"] = Brushes.Transparent;
        button.PointerEntered += (_, _) =>
        {
            card.Background = Graphite.Panel3Brush;
            card.BorderBrush = Graphite.Line2Brush;
        };
        button.PointerExited += (_, _) =>
        {
            card.Background = restBackground;
            card.BorderBrush = restBorder;
        };
        AutomationProperties.SetName(button, name);
        button.Click += (_, _) => onClick();
        return button;
    }

    private static string DeviceSubtitle(SavedDevice device) =>
        IsScreenDevice(device) ? $"{device.Driver} · {device.Width} × {device.Height}" : $"{device.Driver} · controller";

    private static string DeviceIcon(SavedDevice device) =>
        IsScreenDevice(device) ? "device-desktop" : "gauge";

    private void ShowDeviceCatalogDialog(bool generic = false)
    {
        var focusToRestore = _deviceCatalogOverlay is null
            ? TopLevel.GetTopLevel(this)?.FocusManager?.GetFocusedElement() as Control
            : _focusBeforeDeviceCatalog;
        CloseCommandPalette(restoreFocus: false);
        CloseConfirmDialog();
        CloseDeviceCatalogDialog(restoreFocus: false);
        _focusBeforeDeviceCatalog = focusToRestore;

        var content = new StackPanel { Spacing = 14 };
        var heading = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var headingText = new StackPanel { Spacing = 4 };
        headingText.Children.Add(Graphite.TextBlock("Add device", 19, FontWeight.Bold, Graphite.TextBrush));
        headingText.Children.Add(Graphite.TextBlock(
            generic
                ? "Pick a generic screen Sprint should auto-detect, or build your own wheel."
                : "Choose a known hardware preset, or switch to Generic to build your own.",
            12,
            FontWeight.Normal,
            Graphite.Text2Brush,
            TextWrapping.Wrap));
        AddGrid(heading, headingText, 0, 0);
        AddGrid(heading, ActionButton("Close", ButtonTone.Ghost, () => CloseDeviceCatalogDialog()), 0, 1);
        content.Children.Add(heading);

        content.Children.Add(Graphite.Segmented(
            ["Preset", "Generic"],
            generic ? 1 : 0,
            index => ShowDeviceCatalogDialog(generic: index == 1)));

        content.Children.Add(Graphite.SectionLabel(generic ? "Generic screens" : "Hardware presets"));
        var entries = _runtime.Catalog
            .Where(entry => IsGenericDevice(entry) == generic)
            .ToArray();
        var catalog = new WrapPanel { Orientation = Orientation.Horizontal };
        foreach (var entry in entries)
        {
            catalog.Children.Add(DeviceCatalogCard(entry));
        }

        if (entries.Length == 0)
        {
            catalog.Children.Add(Graphite.TextBlock(
                "No devices are available in this category.",
                12,
                FontWeight.Normal,
                Graphite.Text3Brush));
        }

        content.Children.Add(new ScrollViewer
        {
            // The generic tab shares its height with the custom-wheel form below it.
            MaxHeight = generic ? 200 : 430,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = catalog,
        });

        if (generic)
        {
            content.Children.Add(CustomWheelForm());
        }

        var panel = new Border
        {
            Width = 700,
            MaxHeight = 650,
            Padding = new Thickness(22),
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusXl),
            BoxShadow = new BoxShadows(new BoxShadow
            {
                OffsetX = 0,
                OffsetY = 12,
                Blur = 32,
                Spread = 0,
                Color = Color.FromArgb(90, 0, 0, 0),
            }),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Child = content,
            Tag = "device-catalog-dialog",
        };
        KeyboardNavigation.SetTabNavigation(panel, KeyboardNavigationMode.Cycle);
        AutomationProperties.SetName(panel, "Add device dialog");
        AutomationProperties.SetHelpText(
            panel,
            "Choose a hardware preset or a generic screen. Escape closes this dialog.");
        panel.PointerPressed += (_, e) => e.Handled = true;

        _deviceCatalogOverlay = new Border
        {
            Background = Graphite.Brush(Color.FromArgb(160, 0, 0, 0)),
            Child = panel,
            Tag = "device-catalog-dialog-overlay",
        };
        _deviceCatalogOverlay.PointerPressed += (_, _) => CloseDeviceCatalogDialog();
        Grid.SetRowSpan(_deviceCatalogOverlay, 2);
        _root.Children.Add(_deviceCatalogOverlay);
        Dispatcher.UIThread.Post(() => panel.Focus(), DispatcherPriority.Input);
    }

    // "Build your own wheel" (issue #49): the shipped presets cannot cover every rim,
    // so the generic tab also lets the user declare one — name, optional integrated
    // screen, its transport and resolution. Validation lives in the pure
    // CustomWheelBuilder; this method only collects the fields and reports the error.
    private Control CustomWheelForm()
    {
        const string autoResolution = "Auto-detect";

        var form = new StackPanel { Spacing = 8 };
        form.Children.Add(Graphite.SectionLabel("Custom wheel"));

        var name = new TextBox
        {
            PlaceholderText = "e.g. My GT rim",
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            FontSize = 12,
            MinWidth = 260,
            HorizontalAlignment = HorizontalAlignment.Left,
            Tag = "custom-wheel-name",
        };

        var driver = Graphite.ComboBox(
            CustomWheelBuilder.ScreenDrivers.Select(CustomWheelBuilder.DriverLabel),
            CustomWheelBuilder.DriverLabel(CustomWheelBuilder.ScreenDrivers[0]),
            180);
        driver.Tag = "custom-wheel-driver";

        var resolutions = new List<string> { autoResolution };
        resolutions.AddRange(ScreenProfileCatalog.All.Select(profile => $"{profile.Width} × {profile.Height}"));
        var resolution = Graphite.ComboBox(resolutions, autoResolution, 180);
        resolution.Tag = "custom-wheel-resolution";
        ToolTip.SetTip(resolution, "Auto-detect keeps the driver default until the connected panel reports its size.");

        var error = Graphite.TextBlock("", 11, FontWeight.Medium, Graphite.RedBrush, TextWrapping.Wrap);
        error.IsVisible = false;

        var screenFields = new StackPanel { Spacing = 8 };
        screenFields.Children.Add(FormRow("Screen type", driver));
        screenFields.Children.Add(FormRow("Resolution", resolution));

        // Screen yes/no as a segmented choice: it carries the Graphite selection colour
        // by construction, unlike a stock CheckBox. Rebuilt on each pick because the
        // control bakes its selected state when it is built.
        var hasScreen = true;
        var screenChoice = new ContentControl { Tag = "custom-wheel-screen-choice" };
        void RenderScreenChoice() => screenChoice.Content = Graphite.Segmented(
            ["With screen", "No screen"],
            hasScreen ? 0 : 1,
            index =>
            {
                hasScreen = index == 0;
                screenFields.IsVisible = hasScreen;
                RenderScreenChoice();
            });

        RenderScreenChoice();

        var add = Graphite.Button("Add wheel", ButtonTone.Primary);
        add.HorizontalAlignment = HorizontalAlignment.Left;
        add.Click += (_, _) =>
        {
            var (width, height) = ParseResolution(resolution.SelectedItem?.ToString(), autoResolution);
            var request = new CustomWheelRequest(
                name.Text,
                hasScreen,
                CustomWheelBuilder.DriverForLabel(driver.SelectedItem?.ToString()),
                width,
                height);

            if (!CustomWheelBuilder.TryBuild(request, out var entry, out var failure))
            {
                error.Text = failure;
                error.IsVisible = true;
                return;
            }

            AddCatalogDevice(entry);
        };

        form.Children.Add(FormRow("Name", name));
        form.Children.Add(FormRow("Screen", screenChoice));
        form.Children.Add(screenFields);
        form.Children.Add(error);
        form.Children.Add(add);
        return form;
    }

    private static (int Width, int Height) ParseResolution(string? label, string autoLabel)
    {
        if (string.IsNullOrWhiteSpace(label) || string.Equals(label, autoLabel, StringComparison.Ordinal))
        {
            return (0, 0);
        }

        var parts = label.Split('×', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 2
            && int.TryParse(parts[0], out var width)
            && int.TryParse(parts[1], out var height)
                ? (width, height)
                : (0, 0);
    }

    // A catalog entry rendered as a visual card: type icon, name, resolution chip,
    // and description. Clicking adds the device and opens its detail.
    private Control DeviceCatalogCard(CatalogDevice entry)
    {
        var item = new StackPanel { Spacing = 7 };

        var titleRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        titleRow.Children.Add(Icons.Create(entry.Width > 0 ? "device-desktop" : "gauge", 20, Graphite.AccentBrush));
        titleRow.Children.Add(Graphite.TextBlock(entry.Name, 14, FontWeight.SemiBold, Graphite.TextBrush));
        item.Children.Add(titleRow);

        var chips = new WrapPanel { Orientation = Orientation.Horizontal };
        if (!string.IsNullOrWhiteSpace(entry.Type))
        {
            chips.Children.Add(SpecChip(entry.Type));
        }

        if (entry.Width > 0 && entry.Height > 0)
        {
            chips.Children.Add(SpecChip($"{entry.Width} × {entry.Height}"));
        }

        item.Children.Add(chips);

        if (!string.IsNullOrWhiteSpace(entry.Description))
        {
            item.Children.Add(Graphite.TextBlock(entry.Description, 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        }

        var card = Graphite.Card(item);
        card.Width = 300;
        card.MinHeight = 118;
        card.Margin = new Thickness(0, 0, 10, 10);
        return WrapClickable(card, $"catalog-entry:{entry.Id}", entry.Name, () => AddCatalogDevice(entry));
    }

    // Shared tail of both add paths (preset/generic card and the custom-wheel form):
    // save the device, close the dialog, and land on its detail page.
    private void AddCatalogDevice(CatalogDevice entry)
    {
        var saved = _runtime.AddDevice(entry);
        _selectedDeviceId = saved.Id;
        _deviceBindingPickerOpen = false;
        CloseDeviceCatalogDialog();
        _screens.Sync();
        RenderBody();
    }

    private void CloseDeviceCatalogDialog(bool restoreFocus = true)
    {
        if (_deviceCatalogOverlay is null)
        {
            return;
        }

        var focusToRestore = _focusBeforeDeviceCatalog;
        _root.Children.Remove(_deviceCatalogOverlay);
        _deviceCatalogOverlay = null;
        _focusBeforeDeviceCatalog = null;
        if (restoreFocus && focusToRestore is not null)
        {
            Dispatcher.UIThread.Post(() => focusToRestore.Focus(), DispatcherPriority.Input);
        }
    }

    private static bool IsGenericDevice(CatalogDevice entry) => entry.Vid == 0 && entry.Pid == 0;

    private static bool IsScreenDevice(SavedDevice device) =>
        DeviceCapabilities.HasScreen(device);

    private Control DeviceDetailPage(SavedDevice device)
    {
        var stack = PageStack();
        stack.Children.Add(DeviceDetailHeader(device));
        if (IsScreenDevice(device))
        {
            stack.Children.Add(DeviceScreenSection(device));
        }

        stack.Children.Add(DeviceBindingsSection(device));
        return Scroll(stack);
    }

    private Control DeviceDetailHeader(SavedDevice device)
    {
        var wrap = new StackPanel { Spacing = 12 };

        var back = Graphite.Button("Back to devices", ButtonTone.Ghost);
        var backContent = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 4, VerticalAlignment = VerticalAlignment.Center };
        backContent.Children.Add(Icons.Create("chevron-left", 16, Graphite.Text2Brush));
        backContent.Children.Add(Graphite.TextBlock("Back to devices", 12, FontWeight.Medium, Graphite.Text2Brush));
        back.Content = backContent;
        back.Tag = "device-detail-back";
        ToolTip.SetTip(back, "Back to devices");
        back.HorizontalAlignment = HorizontalAlignment.Left;
        back.Click += (_, _) =>
        {
            _selectedDeviceId = null;
            _deviceBindingPickerOpen = false;
            RenderBody();
        };
        wrap.Children.Add(back);

        var titleRow = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(titleRow, EditableDeviceName(device), 0, 0);
        if (IsScreenDevice(device))
        {
            AddGrid(titleRow, DeviceStatusPill(device), 0, 1);
        }

        wrap.Children.Add(titleRow);

        var metaRow = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var chips = new WrapPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        // A custom wheel without a screen has no transport to name.
        if (!string.IsNullOrWhiteSpace(device.Driver))
        {
            chips.Children.Add(SpecChip(device.Driver));
        }

        chips.Children.Add(SpecChip(IsScreenDevice(device) ? $"{device.Width} × {device.Height}" : "Controller"));
        // Only a non-default purpose earns a chip; every screen being tagged "Dash"
        // would be noise.
        if (IsScreenDevice(device) && DevicePurposes.Resolve(device.Purpose) is { Available: false } purpose)
        {
            chips.Children.Add(SpecChip(purpose.Label));
        }

        AddGrid(metaRow, chips, 0, 0);

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        actions.Children.Add(ActionButton(device.Disabled ? "Enable" : "Disable", ButtonTone.Ghost, () =>
        {
            device.Disabled = !device.Disabled;
            _runtime.SaveDevices();
            _screens.Sync();
            RenderBody();
        }));
        actions.Children.Add(ActionButton("Remove", ButtonTone.Danger, () => ShowConfirmDialog(
            "Remove device?",
            $"{device.Name} and its command bindings will be removed.",
            "Remove device",
            () =>
            {
                CancelDeviceCapture(device.Id);
                _runtime.RemoveDevice(device);
                _selectedDeviceId = null;
                _deviceBindingPickerOpen = false;
                _screens.Sync();
                RenderBody();
            })));
        AddGrid(metaRow, actions, 0, 1);
        wrap.Children.Add(metaRow);

        return wrap;
    }

    private static Control SpecChip(string text)
    {
        var pill = Graphite.StatusPill(text);
        pill.Margin = new Thickness(0, 0, 6, 4);
        return pill;
    }

    // The screen workspace: the dash mirror on the left with its preview controls,
    // the alignment controls on the right. Every control drives the same live
    // preview so tuning is never blind.
    private Control DeviceScreenSection(SavedDevice device)
    {
        var purpose = DevicePurposes.Resolve(device.Purpose);
        if (!purpose.Available)
        {
            // Honest dead end: the screen is labelled for output Sprint cannot produce
            // yet, so it stays idle instead of quietly showing a dash. No dash
            // assignment, no preview, and no alignment controls for output that isn't
            // running.
            var idle = new StackPanel { Spacing = 12 };
            idle.Children.Add(DevicePurposeField(device));
            idle.Children.Add(Graphite.StatePanel(
                $"{purpose.Label} is not built yet",
                $"{purpose.Description} Sprint keeps this screen idle until that output exists — "
                    + "switch the purpose back to Dash to drive it with a dash layout.",
                Graphite.BlueBrush));
            return idle;
        }

        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*"), ColumnSpacing = 24 };

        var left = new StackPanel { Spacing = 10 };
        left.Children.Add(DevicePurposeField(device));
        left.Children.Add(DashAssignmentField(device));
        left.Children.Add(DeviceScreenPreview(device));
        if (_devicePreviewPainter is not null)
        {
            left.Children.Add(PreviewControlsRow());
        }

        AddGrid(grid, left, 0, 0);

        var right = new StackPanel { Spacing = 8 };
        right.Children.Add(Graphite.SectionLabel("Screen alignment"));
        right.Children.Add(AlignmentRow("Rotation", RotationControl(device)));
        right.Children.Add(AlignmentRow("Offset X", StepperControl(device.OffsetX, "px", value => SetDeviceOffset(device, value, device.OffsetY), 0, 2000)));
        right.Children.Add(AlignmentRow("Offset Y", StepperControl(device.OffsetY, "px", value => SetDeviceOffset(device, device.OffsetX, value), 0, 2000)));
        right.Children.Add(AlignmentRow("Margin", StepperControl(device.Margin, "px", value => SetDeviceMargin(device, value), 0, 400)));
        var detail = DeviceStatusDetail(device);
        detail.Margin = new Thickness(0, 6, 0, 0);
        right.Children.Add(detail);
        AddGrid(grid, right, 0, 1);

        return grid;
    }

    // A label/control row where every label shares one left column so the controls
    // line up in a single column beneath the section heading.
    private static Control AlignmentRow(string label, Control control)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("92,*") };
        var text = Graphite.TextBlock(label, 12, FontWeight.SemiBold, Graphite.Text2Brush);
        text.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);
        control.VerticalAlignment = VerticalAlignment.Center;
        control.HorizontalAlignment = HorizontalAlignment.Left;
        Grid.SetColumn(control, 1);
        grid.Children.Add(control);
        return new Border { Padding = new Thickness(0, 4), Child = grid };
    }

    // What this screen is used for (issue #53). Changing it re-syncs the screen service,
    // because only the dash purpose is allowed to publish frames.
    private Control DevicePurposeField(SavedDevice device)
    {
        var panel = new StackPanel { Spacing = 6 };
        panel.Children.Add(Graphite.SectionLabel("Purpose"));

        var current = DevicePurposes.Resolve(device.Purpose);
        var combo = Graphite.ComboBox(DevicePurposes.Labels, current.Label, 220);
        combo.Tag = "device-purpose";
        ToolTip.SetTip(combo, current.Description);
        combo.SelectionChanged += (_, _) =>
        {
            var chosen = DevicePurposes.FindByLabel(combo.SelectedItem?.ToString());
            if (chosen is null || string.Equals(chosen.Id, DevicePurposes.Normalize(device.Purpose), StringComparison.Ordinal))
            {
                return;
            }

            _runtime.UpdateDevicePurpose(device, chosen.Id);
            _screens.Sync();
            RenderBody();
        };
        panel.Children.Add(combo);
        return panel;
    }

    private Control DashAssignmentField(SavedDevice device)
    {
        var panel = new StackPanel { Spacing = 6 };
        panel.Children.Add(Graphite.SectionLabel("Dash"));
        if (_runtime.DashLayouts.Count == 0)
        {
            panel.Children.Add(Graphite.TextBlock("No dashes yet. Create one on the Dashes page.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
            return panel;
        }

        var current = _runtime.DashLayouts.FirstOrDefault(layout => layout.Id == device.DashId);
        var combo = Graphite.ComboBox(
            _runtime.DashLayouts.Select(layout => layout.Name),
            current?.Name ?? _runtime.DashLayouts.FirstOrDefault()?.Name,
            220,
            "No dash assigned");
        combo.SelectionChanged += (_, _) =>
        {
            var chosen = _runtime.DashLayouts.FirstOrDefault(layout => layout.Name == combo.SelectedItem?.ToString());
            if (chosen is not null && chosen.Id != device.DashId)
            {
                _runtime.UpdateDevice(device, device.Name, device.Rotation, device.OffsetX, device.OffsetY, device.Margin, chosen.Id);
                _screens.Sync();
                RenderBody();
            }
        };
        panel.Children.Add(combo);
        return panel;
    }

    // Builds the persistent preview pipeline and returns the framed image. The
    // source/bitmap live on the window so the shell tick can animate them in place;
    // they are always torn down before the body rebuilds (see DisposeDevicePreview).
    private Control DeviceScreenPreview(SavedDevice device)
    {
        var layout = ResolveDeviceLayout(device);
        if (layout is null || device.Width <= 0 || device.Height <= 0)
        {
            return new Border
            {
                Width = 388,
                Height = 300,
                Background = Graphite.Panel3Brush,
                BorderBrush = Graphite.Line2Brush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(Graphite.RadiusMd),
                Child = new Grid { Children = { Graphite.TextBlock("No dash to preview", 12, FontWeight.Normal, Graphite.Text3Brush) } },
            };
        }

        BuildDevicePreview(device, layout);
        return DeviceMirrorDisplay(device, _devicePreviewImage!, 380, 300);
    }

    private Control PreviewControlsRow()
    {
        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };

        var left = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, VerticalAlignment = VerticalAlignment.Center };
        var previewLabel = Graphite.TextBlock("Preview", 11, FontWeight.Medium, Graphite.Text3Brush);
        previewLabel.VerticalAlignment = VerticalAlignment.Center;
        left.Children.Add(previewLabel);
        var menu = DashPreviewFrames.Menu;
        var combo = Graphite.ComboBox(menu.Select(item => item.Label), menu.First(item => item.State == _devicePreviewState).Label, 120);
        combo.SelectionChanged += (_, _) =>
        {
            if (combo.SelectedItem is string label)
            {
                var match = menu.FirstOrDefault(item => item.Label == label);
                if (match.Label is not null && match.State != _devicePreviewState)
                {
                    _devicePreviewState = match.State;
                    RenderDevicePreviewFrame();
                }
            }
        };
        left.Children.Add(combo);
        AddGrid(row, left, 0, 0);

        var right = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        var liveLabel = Graphite.TextBlock("Live", 11, FontWeight.Medium, Graphite.Text3Brush);
        liveLabel.VerticalAlignment = VerticalAlignment.Center;
        right.Children.Add(liveLabel);
        right.Children.Add(Graphite.Toggle(_runtime.Settings.DevicesUI.LivePreview, on =>
        {
            _runtime.Settings.DevicesUI.LivePreview = on;
            _runtime.SaveSettings();
            // Freeze on the current frame immediately; the shell tick stops updating.
            RenderDevicePreviewFrame();
        }));
        AddGrid(row, right, 0, 1);
        return row;
    }

    private Control RotationControl(SavedDevice device)
    {
        var index = device.Rotation switch { 90 => 1, 180 => 2, 270 => 3, _ => 0 };
        return Graphite.Segmented(
            ["Vertical", "Horizontal", "Vertical Inverted", "Horizontal Inverted"],
            index,
            chosen => SetDeviceRotation(device, chosen * 90));
    }

    private Control StepperControl(int value, string suffix, Action<int> setter, int min, int max)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        row.Children.Add(StepButton("-", () => setter(Math.Max(min, value - 1))));
        var readout = Graphite.TextBlock($"{value} {suffix}", 13, FontWeight.Medium, Graphite.TextBrush);
        readout.MinWidth = 64;
        readout.VerticalAlignment = VerticalAlignment.Center;
        readout.TextAlignment = TextAlignment.Center;
        row.Children.Add(readout);
        row.Children.Add(StepButton("+", () => setter(Math.Min(max, value + 1))));
        return row;
    }

    private void SetDeviceRotation(SavedDevice device, int rotation)
    {
        if (device.Rotation == rotation)
        {
            return;
        }

        _runtime.UpdateDevice(device, device.Name, rotation, device.OffsetX, device.OffsetY, device.Margin, device.DashId);
        _screens.Sync();
        RenderBody();
    }

    private void SetDeviceOffset(SavedDevice device, int x, int y)
    {
        x = Math.Max(0, x);
        y = Math.Max(0, y);
        if (device.OffsetX == x && device.OffsetY == y)
        {
            return;
        }

        _runtime.UpdateDevice(device, device.Name, device.Rotation, x, y, device.Margin, device.DashId);
        _screens.Sync();
        RenderBody();
    }

    private void SetDeviceMargin(SavedDevice device, int margin)
    {
        margin = Math.Max(0, margin);
        if (device.Margin == margin)
        {
            return;
        }

        _runtime.UpdateDevice(device, device.Name, device.Rotation, device.OffsetX, device.OffsetY, margin, device.DashId);
        _screens.Sync();
        RenderBody();
    }

    private DashLayout? ResolveDeviceLayout(SavedDevice device) =>
        _runtime.DashLayouts.FirstOrDefault(layout => string.Equals(layout.Id, device.DashId, StringComparison.OrdinalIgnoreCase))
        ?? _runtime.DashLayouts.FirstOrDefault(layout => layout.IsDefault)
        ?? _runtime.DashLayouts.FirstOrDefault();

    private void BuildDevicePreview(SavedDevice device, DashLayout layout)
    {
        DisposeDevicePreview();
        _devicePreviewLayout = layout;
        _devicePreviewPainter = new DashPainter(device.Width, device.Height, DashPalette.FromLayout(layout));
        _devicePreviewBitmap = new WriteableBitmap(
            new PixelSize(device.Width, device.Height),
            new Vector(96, 96),
            PixelFormat.Bgra8888,
            AlphaFormat.Premul);
        _devicePreviewImage = new Image { Source = _devicePreviewBitmap, Stretch = Stretch.Fill };
        RenderDevicePreviewFrame();
    }

    // Renders the assigned dash upright at the panel's native size and blits it into
    // the on-screen bitmap. Called on build, on preview-state change, and per shell
    // tick while the live preview animates.
    private void RenderDevicePreviewFrame()
    {
        if (_devicePreviewPainter is null || _devicePreviewBitmap is null || _devicePreviewLayout is null)
        {
            return;
        }

        var frame = DashPreviewFrames.Resolve(_devicePreviewState, CurrentTelemetryFrame());
        _devicePreviewPainter.Render(_devicePreviewLayout, frame, _runtime.Settings);
        DashImageRenderer.Copy(_devicePreviewPainter, _devicePreviewBitmap);
        _devicePreviewImage?.InvalidateVisual();
    }

    private void DisposeDevicePreview()
    {
        _devicePreviewPainter?.Dispose();
        _devicePreviewPainter = null;
        _devicePreviewLayout = null;
        _devicePreviewImage = null;
        _devicePreviewBitmap = null;
    }

    // One-shot upright render of the assigned dash for a gallery/list card; returns
    // null when the device has no screen or no assignable dash.
    private WriteableBitmap? RenderDeviceMirrorBitmap(SavedDevice device, TelemetryFrame frame)
    {
        if (!IsScreenDevice(device) || device.Width <= 0 || device.Height <= 0)
        {
            return null;
        }

        var layout = ResolveDeviceLayout(device);
        if (layout is null)
        {
            return null;
        }

        return DashImageRenderer.Render(
            layout,
            frame,
            _runtime.Settings,
            device.Width,
            device.Height,
            palette: DashPalette.FromLayout(layout));
    }

    private Control EditableDeviceName(SavedDevice device)
    {
        var box = new TextBox
        {
            Text = device.Name,
            FontFamily = Graphite.FontStack,
            FontSize = 15,
            FontWeight = FontWeight.Bold,
            Foreground = Graphite.TextBrush,
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            MinHeight = 32,
            Padding = new Thickness(10, 6),
            HorizontalAlignment = HorizontalAlignment.Stretch,
        };

        var lastCommittedText = device.Name;
        void Commit()
        {
            var nextName = box.Text ?? device.Name;
            if (string.Equals(nextName, lastCommittedText, StringComparison.Ordinal))
            {
                return;
            }

            _runtime.UpdateDevice(device, nextName, device.Rotation, device.OffsetX, device.OffsetY, device.Margin, device.DashId);
            lastCommittedText = nextName;
            _screens.Sync();
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

    // Bindings surface only what's actually configured, plus an "Add binding"
    // affordance — instead of a wall of one-row-per-command. While a key is being
    // captured, the capture banner takes over the add area.
    private Control DeviceBindingsSection(SavedDevice device)
    {
        var panel = new StackPanel { Spacing = 10 };
        var capturing = _capture.IsListening && _captureDeviceId == device.Id;
        var unbound = UnboundCommands(device);

        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(header, Graphite.SectionLabel("Command bindings"), 0, 0);
        if (!capturing && !_deviceBindingPickerOpen && unbound.Count > 0)
        {
            AddGrid(header, ActionButton("Add binding", ButtonTone.Ghost, () =>
            {
                _deviceBindingPickerOpen = true;
                RenderBody();
            }), 0, 1);
        }

        panel.Children.Add(header);
        panel.Children.Add(Graphite.TextBlock(
            "Map this device's buttons or keyboard keys to Sprint commands.",
            11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));

        if (capturing)
        {
            panel.Children.Add(BindingCaptureBanner(device));
        }
        else if (_deviceBindingPickerOpen)
        {
            panel.Children.Add(BindingPicker(device, unbound));
        }

        if (device.Bindings.Count == 0)
        {
            panel.Children.Add(Graphite.TextBlock("No bindings yet.", 12, FontWeight.Normal, Graphite.Text3Brush));
        }
        else
        {
            foreach (var binding in device.Bindings)
            {
                panel.Children.Add(BoundBindingRow(device, binding));
            }
        }

        return Graphite.Card(panel);
    }

    private IReadOnlyList<CommandMeta> UnboundCommands(SavedDevice device) =>
        _commands.Catalog()
            .Where(meta => meta.Capturable && device.Bindings.All(binding => binding.Command != meta.Id))
            .ToList();

    private string CommandLabel(string commandId) =>
        _commands.Catalog().FirstOrDefault(meta => meta.Id == commandId)?.Label ?? commandId;

    private Control BoundBindingRow(SavedDevice device, DeviceBinding binding)
    {
        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Margin = new Thickness(0, 2) };
        var text = new StackPanel { Spacing = 2 };
        text.Children.Add(Graphite.TextBlock(CommandLabel(binding.Command), 13, FontWeight.SemiBold, Graphite.TextBrush));
        text.Children.Add(Graphite.TextBlock(binding.Input, 11, FontWeight.Normal, Graphite.Text3Brush));
        AddGrid(row, text, 0, 0);

        var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        controls.Children.Add(ActionButton("Rebind", ButtonTone.Ghost, () => ToggleDeviceListen(device.Id, binding.Command)));
        controls.Children.Add(ActionButton("Clear", ButtonTone.Ghost, () => ClearDeviceBinding(device, binding.Command)));
        AddGrid(row, controls, 0, 1);
        return row;
    }

    private Control BindingCaptureBanner(SavedDevice device)
    {
        var panel = new StackPanel { Spacing = 6 };
        panel.Children.Add(Graphite.TextBlock($"Listening for {CommandLabel(_capture.Command ?? "")}", 13, FontWeight.SemiBold, Graphite.AccentBrush));
        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(row, Graphite.TextBlock("Press a key on this device... (Esc to cancel)", 11, FontWeight.Normal, Graphite.Text2Brush), 0, 0);
        AddGrid(row, ActionButton("Cancel", ButtonTone.Neutral, () => ToggleDeviceListen(device.Id, _capture.Command ?? "")), 0, 1);
        panel.Children.Add(row);
        return new Border
        {
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.AccentBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(12),
            Child = panel,
        };
    }

    private Control BindingPicker(SavedDevice device, IReadOnlyList<CommandMeta> unbound)
    {
        var panel = new StackPanel { Spacing = 8 };
        var combo = Graphite.ComboBox(unbound.Select(meta => meta.Label), unbound.FirstOrDefault()?.Label, 220, "Choose a command");
        panel.Children.Add(Graphite.TextBlock("Add binding", 12, FontWeight.SemiBold, Graphite.Text2Brush));
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        row.Children.Add(combo);
        row.Children.Add(ActionButton("Listen", ButtonTone.Primary, () =>
        {
            var chosen = unbound.FirstOrDefault(meta => meta.Label == combo.SelectedItem?.ToString()) ?? unbound.FirstOrDefault();
            if (chosen is null)
            {
                return;
            }

            _deviceBindingPickerOpen = false;
            ToggleDeviceListen(device.Id, chosen.Id);
        }));
        row.Children.Add(ActionButton("Cancel", ButtonTone.Ghost, () =>
        {
            _deviceBindingPickerOpen = false;
            RenderBody();
        }));
        panel.Children.Add(row);
        return new Border
        {
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(12),
            Child = panel,
        };
    }

    private void ToggleDeviceListen(string deviceId, string commandId)
    {
        var isSameTarget = _capture.IsListening && _capture.Command == commandId && _captureDeviceId == deviceId;
        _capture = isSameTarget
            ? InputCaptureReducer.Cancel(_capture)
            : InputCaptureReducer.Start(commandId, DateTimeOffset.UtcNow);
        _captureDeviceId = _capture.IsListening ? deviceId : null;
        RenderBody();
    }

    private void ClearDeviceBinding(SavedDevice device, string commandId)
    {
        device.Bindings.RemoveAll(binding => binding.Command == commandId);
        _runtime.SaveDevices();
        RenderBody();
    }

    private void CancelDeviceCapture(string deviceId)
    {
        if (_capture.IsListening && string.Equals(_captureDeviceId, deviceId, StringComparison.Ordinal))
        {
            _capture = InputCaptureReducer.Cancel(_capture);
            _captureDeviceId = null;
        }
    }

    private void ShowConfirmDialog(
        string title,
        string message,
        string confirmLabel,
        Action confirm,
        ButtonTone confirmTone = ButtonTone.Danger,
        Action? cancel = null)
    {
        CloseCommandPalette(restoreFocus: false);
        CloseDeviceCatalogDialog();
        CloseConfirmDialog();

        var content = new StackPanel { Spacing = 10 };
        content.Children.Add(Graphite.TextBlock(title, 17, FontWeight.Medium, Graphite.TextBrush));
        content.Children.Add(Graphite.TextBlock(message, 12, FontWeight.Normal, Graphite.Text2Brush, TextWrapping.Wrap));
        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 8, 0, 0),
        };
        // Dismissing the dialog by scrim/Escape counts as cancel; the cancel callback
        // is stored so any dismissal path runs it exactly once (confirm clears it first).
        _pendingConfirmCancel = cancel;
        actions.Children.Add(ActionButton("Cancel", ButtonTone.Ghost, CloseConfirmDialog));
        actions.Children.Add(ActionButton(confirmLabel, confirmTone, () =>
        {
            _pendingConfirmCancel = null;
            CloseConfirmDialog();
            confirm();
        }));
        content.Children.Add(actions);

        var panel = new Border
        {
            Width = 420,
            Padding = new Thickness(20),
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusXl),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Child = content,
        };
        panel.PointerPressed += (_, e) => e.Handled = true;

        _confirmOverlay = new Border
        {
            Background = Graphite.Brush(Color.FromArgb(160, 0, 0, 0)),
            Child = panel,
            Tag = "confirm-dialog-overlay",
        };
        _confirmOverlay.PointerPressed += (_, _) => CloseConfirmDialog();
        Grid.SetRowSpan(_confirmOverlay, 2);
        _root.Children.Add(_confirmOverlay);
    }

    private void CloseConfirmDialog()
    {
        if (_confirmOverlay is null)
        {
            return;
        }

        _root.Children.Remove(_confirmOverlay);
        _confirmOverlay = null;

        var cancel = _pendingConfirmCancel;
        _pendingConfirmCancel = null;
        cancel?.Invoke();
    }

    /// <summary>
    /// Shows a transient Graphite toast bottom-right with an optional action button.
    /// Toasts auto-dismiss after <see cref="ToastLifetimeSeconds"/> seconds and can be
    /// closed manually; the action dismisses the toast before running. Internal so the
    /// headless tests can drive the notification stack without a live update feed.
    /// </summary>
    internal void ShowToast(
        GraphiteIntent intent,
        string title,
        string message,
        string icon,
        (string Label, Action OnClick)? action = null)
    {
        var host = EnsureToastHost();

        Border card = null!;
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(ToastLifetimeSeconds) };
        void Dismiss()
        {
            timer.Stop();
            _toastTimers.Remove(timer);
            host.Children.Remove(card);
        }

        var trailing = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            Margin = new Thickness(12, 0, 0, 0),
        };
        if (action is { } toastAction)
        {
            trailing.Children.Add(ActionButton(toastAction.Label, ButtonTone.Primary, () =>
            {
                Dismiss();
                toastAction.OnClick();
            }));
        }

        trailing.Children.Add(ChromeButton("x", Dismiss, "Dismiss notification"));

        card = (Border)Graphite.Toast(intent, title, message, icon, trailing);
        card.MaxWidth = 460;
        card.Tag = "toast";
        host.Children.Add(card);

        timer.Tick += (_, _) => Dismiss();
        _toastTimers.Add(timer);
        timer.Start();
        _log.Info($"Toast shown: intent={intent} title={title}.");
    }

    private StackPanel EnsureToastHost()
    {
        _toastHost ??= new StackPanel
        {
            Spacing = 10,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 20, 20),
            Tag = "toast-host",
        };

        // BuildShell clears _root on navigation/rebuild; re-attach above the shell.
        if (!_root.Children.Contains(_toastHost))
        {
            Grid.SetRowSpan(_toastHost, 2);
            _root.Children.Add(_toastHost);
        }

        return _toastHost;
    }

    private void OpenCommandPalette()
    {
        if (_commandOverlay is not null)
        {
            _commandSearch?.Focus();
            return;
        }

        CloseDeviceCatalogDialog();
        _focusBeforePalette = TopLevel.GetTopLevel(this)?.FocusManager?.GetFocusedElement() as Control;
        _commandSelection = 0;
        _commandResults = new StackPanel { Spacing = 2 };
        _commandSearch = new TextBox
        {
            PlaceholderText = "Search commands",
            FontSize = 14,
            MinHeight = 38,
            Padding = new Thickness(12, 8),
            Tag = "command-palette-search",
        };
        _commandSearch.TextChanged += (_, _) =>
        {
            _commandSelection = 0;
            RefreshCommandResults();
        };
        _commandSearch.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape)
            {
                CloseCommandPalette();
                e.Handled = true;
            }
            else if (e.Key == Key.Down)
            {
                MoveCommandSelection(1);
                e.Handled = true;
            }
            else if (e.Key == Key.Up)
            {
                MoveCommandSelection(-1);
                e.Handled = true;
            }
            else if (e.Key == Key.Enter && _visibleCommands.Count > 0)
            {
                ExecuteShellCommand(_visibleCommands[_commandSelection]);
                e.Handled = true;
            }
        };

        var content = new StackPanel { Spacing = 8 };
        content.Children.Add(_commandSearch);
        content.Children.Add(new ScrollViewer
        {
            MaxHeight = 320,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = _commandResults,
        });

        var panel = new Border
        {
            Width = 520,
            MaxHeight = 430,
            Margin = new Thickness(0, 68, 0, 0),
            Padding = new Thickness(10),
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusXl),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Top,
            Child = content,
        };
        panel.PointerPressed += (_, e) => e.Handled = true;

        _commandOverlay = new Border
        {
            Background = Graphite.Brush(Color.FromArgb(150, 0, 0, 0)),
            Child = panel,
            Tag = "command-palette-overlay",
        };
        _commandOverlay.PointerPressed += (_, _) => CloseCommandPalette();
        Grid.SetRowSpan(_commandOverlay, 2);
        _root.Children.Add(_commandOverlay);
        RefreshCommandResults();
        Dispatcher.UIThread.Post(() => _commandSearch?.Focus());
    }

    private void RefreshCommandResults()
    {
        if (_commandResults is null)
        {
            return;
        }

        _visibleCommands = _shellCommands.Search(_commandSearch?.Text);
        _commandSelection = Math.Clamp(_commandSelection, 0, Math.Max(0, _visibleCommands.Count - 1));
        _commandResults.Children.Clear();

        if (_visibleCommands.Count == 0)
        {
            _commandResults.Children.Add(new Border
            {
                Padding = new Thickness(12, 18),
                Child = Graphite.TextBlock("No matching commands", 12, FontWeight.Normal, Graphite.Text3Brush),
            });
            return;
        }

        for (var index = 0; index < _visibleCommands.Count; index++)
        {
            var command = _visibleCommands[index];
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
            AddGrid(row, Graphite.TextBlock(command.Title, 13, index == _commandSelection ? FontWeight.Medium : FontWeight.Normal), 0, 0);
            if (!string.IsNullOrWhiteSpace(command.Shortcut))
            {
                AddGrid(row, Graphite.TextBlock(command.Shortcut!, 11, FontWeight.Normal, Graphite.Text3Brush), 0, 1);
            }

            var button = Graphite.Button(command.Title, ButtonTone.Ghost);
            button.Content = row;
            button.Tag = $"shell-command:{command.Id}";
            button.Background = index == _commandSelection ? Graphite.Panel3Brush : Brushes.Transparent;
            button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
            button.Click += (_, _) => ExecuteShellCommand(command);
            _commandResults.Children.Add(button);
        }
    }

    private void MoveCommandSelection(int delta)
    {
        if (_visibleCommands.Count == 0)
        {
            return;
        }

        _commandSelection = (_commandSelection + delta + _visibleCommands.Count) % _visibleCommands.Count;
        RefreshCommandResults();
    }

    private void ExecuteShellCommand(ShellCommand command)
    {
        CloseCommandPalette(restoreFocus: false);
        _shellCommands.Execute(command.Id);
    }

    private void CloseCommandPalette(bool restoreFocus = true)
    {
        if (_commandOverlay is null)
        {
            return;
        }

        _root.Children.Remove(_commandOverlay);
        _commandOverlay = null;
        _commandSearch = null;
        _commandResults = null;
        _visibleCommands = [];
        if (restoreFocus)
        {
            _focusBeforePalette?.Focus();
        }

        _focusBeforePalette = null;
    }

    private void OnGlobalKeyDown(object? sender, KeyEventArgs e)
    {
        if (_deviceCatalogOverlay is not null)
        {
            if (e.Key == Key.Escape)
            {
                CloseDeviceCatalogDialog();
                e.Handled = true;
            }
            else if (e.Key != Key.Tab)
            {
                // The overlay is modal: global commands and background navigation
                // remain dormant until it closes. Tab is handled by the cycle scope.
                e.Handled = true;
            }

            return;
        }

        if (e.Key == Key.Escape && _confirmOverlay is not null)
        {
            CloseConfirmDialog();
            e.Handled = true;
            return;
        }

        if (e.Key == Key.K && e.KeyModifiers.HasFlag(KeyModifiers.Control))
        {
            OpenCommandPalette();
            e.Handled = true;
            return;
        }

        if (_capture.IsListening)
        {
            HandleCaptureKey(e);
            return;
        }

        // Alt+1..6 follows the production sidebar order. Debug views are not exposed
        // through normal keyboard navigation.
        if (e.KeyModifiers.HasFlag(KeyModifiers.Alt) && TryProductionShortcutView(e.Key, out var view))
        {
            Navigate(view);
            e.Handled = true;
        }
    }

    private void HandleCaptureKey(KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            _capture = InputCaptureReducer.Cancel(_capture);
            _captureDeviceId = null;
            RenderBody();
            e.Handled = true;
            return;
        }

        if (_captureDeviceId is not null && !_runtime.Devices.Any(device => device.Id == _captureDeviceId))
        {
            _capture = InputCaptureReducer.Cancel(_capture);
            _captureDeviceId = null;
            RenderBody();
            e.Handled = true;
            return;
        }

        _capture = InputCaptureReducer.Capture(_capture, $"key:{e.Key}");
        if (InputCaptureReducer.ToBinding(_capture) is { } binding)
        {
            if (_captureDeviceId is not null && _runtime.Devices.FirstOrDefault(device => device.Id == _captureDeviceId) is { } device)
            {
                device.Bindings.RemoveAll(existing => existing.Command == binding.Command || existing.Input == binding.Input);
                device.Bindings.Add(new DeviceBinding { Command = binding.Command, Input = binding.Input });
                _runtime.SaveDevices();
            }
            else
            {
                _runtime.Controls.Bindings.RemoveAll(existing => existing.Command == binding.Command || existing.Input == binding.Input);
                _runtime.Controls.Bindings.Add(binding);
                _runtime.SaveControls();
            }
        }

        _capture = InputCaptureState.Idle;
        _captureDeviceId = null;
        RenderBody();
        e.Handled = true;
    }

    private static bool TryProductionShortcutView(Key key, out AppView view)
    {
        switch (key)
        {
            case Key.D1:
            case Key.NumPad1:
                view = AppView.Home;
                return true;
            case Key.D2:
            case Key.NumPad2:
                view = AppView.Dashes;
                return true;
            case Key.D3:
            case Key.NumPad3:
                view = AppView.Devices;
                return true;
            case Key.D4:
            case Key.NumPad4:
                view = AppView.Setups;
                return true;
            case Key.D5:
            case Key.NumPad5:
                view = AppView.Settings;
                return true;
            case Key.D6:
            case Key.NumPad6:
                view = AppView.Help;
                return true;
            default:
                view = default;
                return false;
        }
    }

    private Control SettingsPage()
    {
        var stack = PageStack();
        var saveStatus = Graphite.TextBlock("", 11, FontWeight.Medium, Graphite.GreenBrush);
        saveStatus.VerticalAlignment = VerticalAlignment.Center;
        stack.Children.Add(PageHeader("Settings", "Global desktop defaults", saveStatus));

        var driverName = new TextBox
        {
            Text = _runtime.Settings.DriverName,
            PlaceholderText = "Driver name",
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush
        };
        var driverNumber = new TextBox
        {
            Text = _runtime.Settings.DriverNumber,
            PlaceholderText = "Driver number",
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush
        };
        var channel = new ComboBox
        {
            ItemsSource = AppSettings.Channels,
            SelectedItem = AppSettings.NormalizeChannel(_runtime.Settings.UpdateChannel),
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            MinWidth = 180
        };

        // Global defaults applied to newly created dashes (see NewDashDefaults).
        var speedUnit = new ComboBox
        {
            ItemsSource = new[] { "km/h", "mph" },
            SelectedItem = _runtime.Settings.NewDashDefaults.SpeedUnit,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            MinWidth = 180
        };
        var tempUnit = new ComboBox
        {
            ItemsSource = new[] { "c", "f" },
            SelectedItem = _runtime.Settings.NewDashDefaults.TempUnit,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            MinWidth = 180
        };
        var dashMode = new ComboBox
        {
            ItemsSource = new[] { "Basic", "Advanced" },
            SelectedItem = string.Equals(_runtime.Settings.NewDashDefaults.Mode, "advanced", StringComparison.OrdinalIgnoreCase) ? "Advanced" : "Basic",
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            MinWidth = 180
        };

        void MarkSaved()
        {
            _runtime.SaveSettings();
            saveStatus.Text = "Saved";
        }

        void CommitTextSettings()
        {
            var name = driverName.Text?.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                name = "Your Name";
                driverName.Text = name;
            }

            var number = driverNumber.Text?.Trim();
            if (string.IsNullOrWhiteSpace(number))
            {
                number = "22";
                driverNumber.Text = number;
            }

            _runtime.Settings.DriverName = name;
            _runtime.Settings.DriverNumber = number;
            MarkSaved();
        }

        void CommitOnEnter(TextBox box, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                CommitTextSettings();
                e.Handled = true;
            }
        }

        driverName.LostFocus += (_, _) => CommitTextSettings();
        driverNumber.LostFocus += (_, _) => CommitTextSettings();
        driverName.KeyDown += (_, e) => CommitOnEnter(driverName, e);
        driverNumber.KeyDown += (_, e) => CommitOnEnter(driverNumber, e);
        speedUnit.SelectionChanged += (_, _) =>
        {
            _runtime.Settings.NewDashDefaults.SpeedUnit = speedUnit.SelectedItem?.ToString() ?? "km/h";
            MarkSaved();
        };
        tempUnit.SelectionChanged += (_, _) =>
        {
            _runtime.Settings.NewDashDefaults.TempUnit = tempUnit.SelectedItem?.ToString() ?? "c";
            MarkSaved();
        };
        dashMode.SelectionChanged += (_, _) =>
        {
            _runtime.Settings.NewDashDefaults.Mode = string.Equals(dashMode.SelectedItem?.ToString(), "Advanced", StringComparison.Ordinal) ? "advanced" : "basic";
            MarkSaved();
        };
        // Reverting the combo from the warning dialog raises SelectionChanged again;
        // the guard keeps that programmatic revert from reopening the dialog.
        var revertingChannel = false;
        channel.SelectionChanged += (_, _) =>
        {
            if (revertingChannel)
            {
                return;
            }

            var selected = AppSettings.NormalizeChannel(channel.SelectedItem?.ToString());
            if (selected == "pre-release" && AppSettings.NormalizeChannel(_runtime.Settings.UpdateChannel) != "pre-release")
            {
                ShowConfirmDialog(
                    "Switch to pre-release?",
                    "Pre-release builds ship early and may contain bugs, unfinished features, and breaking changes. "
                        + "Only use this channel if you want to test new Sprint versions. You can switch back to stable at any time.",
                    "Use pre-release",
                    () =>
                    {
                        _runtime.Settings.UpdateChannel = selected;
                        MarkSaved();
                        RenderBody();
                    },
                    confirmTone: ButtonTone.Primary,
                    cancel: () =>
                    {
                        revertingChannel = true;
                        channel.SelectedItem = "stable";
                        revertingChannel = false;
                    });
                return;
            }

            _runtime.Settings.UpdateChannel = selected;
            MarkSaved();
        };

        var form = new StackPanel { Spacing = 12, MaxWidth = 620 };
        form.Children.Add(Graphite.SectionLabel("Profile"));
        form.Children.Add(FormRow("Driver name", driverName));
        form.Children.Add(FormRow("Driver number", driverNumber));
        form.Children.Add(Graphite.SectionLabel("Dash defaults"));
        form.Children.Add(FormRow("Editor mode", dashMode));
        form.Children.Add(FormRow("Speed unit", speedUnit));
        form.Children.Add(FormRow("Temperature unit", tempUnit));
        form.Children.Add(Graphite.SectionLabel("Release"));
        form.Children.Add(FormRow("Update channel", channel));
        form.Children.Add(Graphite.SectionLabel("About"));
        form.Children.Add(FormRow("Version", Graphite.Chip(
            $"v{BuildInfo.Version} · {BuildInfo.DisplayChannel(_runtime.Settings.UpdateChannel)}", Graphite.BlueBrush)));
        var updateStatus = Graphite.TextBlock(
            $"Sprint installs updates from the {AppSettings.NormalizeChannel(_runtime.Settings.UpdateChannel)} channel.",
            11,
            FontWeight.Normal,
            Graphite.Text3Brush,
            TextWrapping.Wrap);
        // The install button stays hidden until a check finds a newer release on the
        // active channel; the found release is what the button then installs.
        var installButton = Graphite.Button("Update", ButtonTone.Primary);
        installButton.IsVisible = false;
        var checkButton = Graphite.Button("Check for updates", ButtonTone.Ghost);
        ReleaseInfo? foundUpdate = null;

        async void RunUpdateCheck()
        {
            checkButton.IsEnabled = false;
            installButton.IsVisible = false;
            updateStatus.Text = "Checking…";
            var result = await FetchUpdateAsync();
            checkButton.IsEnabled = true;

            if (result is null)
            {
                updateStatus.Text = "Check failed — try again later.";
                return;
            }

            if (result is { UpdateAvailable: true, Latest: { } latest })
            {
                foundUpdate = latest;
                updateStatus.Text = $"Sprint {DisplayVersion(latest.Version)} is available.";
                installButton.Content = $"Update to {DisplayVersion(latest.Version)}";
                installButton.IsVisible = true;
                return;
            }

            updateStatus.Text = $"Up to date (v{BuildInfo.Version}).";
        }

        checkButton.Click += (_, _) => RunUpdateCheck();
        installButton.Click += (_, _) =>
        {
            if (foundUpdate is { } release)
            {
                ConfirmAndInstallUpdate(release, updateStatus, installButton);
            }
        };

        var checkRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, VerticalAlignment = VerticalAlignment.Center };
        checkRow.Children.Add(checkButton);
        checkRow.Children.Add(installButton);
        checkRow.Children.Add(updateStatus);
        form.Children.Add(FormRow("Updates", checkRow));

#if DEBUG
        form.Children.Add(Graphite.SectionLabel("Development"));
        var diagnostics = ActionButton("Open development tools", ButtonTone.Neutral, OpenDiagnosticsWindow);
        ToolTip.SetTip(
            diagnostics,
            "Open global game-state simulation, real screen output, and filtered live logs.");
        form.Children.Add(FormRow(
            "Development tools",
            new StackPanel
            {
                Spacing = 4,
                Children =
                {
                    diagnostics,
                    Graphite.TextBlock(
                        "Debug builds only. Run simulation, screen output, logging, and future modules in parallel.",
                        11,
                        FontWeight.Normal,
                        Graphite.Text3Brush,
                        TextWrapping.Wrap),
                },
            }));

        form.Children.Add(Graphite.SectionLabel("Debug"));
        var resetSettings = ActionButton("Reset settings to defaults", ButtonTone.Neutral, () =>
        {
            _runtime.ResetSettingsToDefaults();
            if (_shell.SidebarCollapsed != _runtime.Settings.SidebarCollapsed)
            {
                _shell.ToggleSidebar();
            }

            BuildShell();
            RenderBody();
        });
        ToolTip.SetTip(
            resetSettings,
            "Restore app and dash-editor preferences. Dashboards, devices, and setups are not changed.");
        form.Children.Add(FormRow(
            "App settings",
            new StackPanel
            {
                Spacing = 4,
                Children =
                {
                    resetSettings,
                    Graphite.TextBlock(
                        "Restores UI and default preferences only. Dashboards, devices, and setups stay intact.",
                        11,
                        FontWeight.Normal,
                        Graphite.Text3Brush,
                        TextWrapping.Wrap),
                },
            }));
#endif

        form.HorizontalAlignment = HorizontalAlignment.Left;
        stack.Children.Add(form);
        return Scroll(stack);
    }

#if DEBUG
    private void OpenDiagnosticsWindow()
    {
        if (_diagnosticsWindow is not null)
        {
            _diagnosticsWindow.Activate();
            _log.Debug("Development tools window activation requested.");
            return;
        }

        _diagnosticsWindow = new DiagnosticsWindow(
            _runtime,
            _screens,
            _developmentGameState,
            _liveLog,
            _log,
            _diagnosticsPaths);
        _diagnosticsWindow.Closed += (_, _) => _diagnosticsWindow = null;
        _diagnosticsWindow.Show(this);
    }
#endif

    private void OnAnyButtonClick(object? sender, RoutedEventArgs e)
    {
        if (e.Source is not Button button)
        {
            return;
        }

        var label = AutomationProperties.GetName(button);
        if (string.IsNullOrWhiteSpace(label))
        {
            label = button.Content as string;
        }

        if (string.IsNullOrWhiteSpace(label))
        {
            label = button.GetVisualDescendants()
                .OfType<TextBlock>()
                .Select(text => text.Text)
                .FirstOrDefault(text => !string.IsNullOrWhiteSpace(text));
        }

        _log.Debug(
            $"UI action: control=button label={label ?? "unlabelled"} view={_shell.View}.");
    }

    private static string DisplayVersion(string version) =>
        version.StartsWith('v') || version.StartsWith('V') ? version : $"v{version}";

    /// <summary>
    /// Channel-aware update check shared by the Settings button and the startup notice.
    /// Best-effort: returns <c>null</c> when the release feed cannot be read, so a
    /// network failure never surfaces as a crash.
    /// </summary>
    private async Task<UpdateCheckResult?> FetchUpdateAsync()
    {
        try
        {
            var releases = await new GitHubReleaseSource().FetchAsync(GitHubReleaseSource.DefaultRepo);
            return UpdateChecker.Check(BuildInfo.Version, _runtime.Settings.UpdateChannel, releases);
        }
        catch (Exception ex)
        {
            _log.Warn("Update check failed", ex);
            return null;
        }
    }

    /// <summary>
    /// Confirms the one-click update, then downloads the platform archive and hands it
    /// to the self-replace helper. Windows swaps the install and relaunches; every other
    /// platform (and every failure) falls back to revealing the download so the user can
    /// install manually — the running app is never left broken.
    /// </summary>
    private void ConfirmAndInstallUpdate(ReleaseInfo release, TextBlock status, Button installButton)
    {
        var asset = ReleaseAssetSelector.Select(release.Assets, UpdateInstaller.CurrentRid);
        if (asset is null)
        {
            status.Text = "No download for this platform — get it from the GitHub release page.";
            return;
        }

        var restarts = UpdateInstaller.SupportsSelfReplace;
        ShowConfirmDialog(
            $"Install Sprint {DisplayVersion(release.Version)}?",
            restarts
                ? "Sprint downloads the update, closes, replaces itself, and restarts. Unsaved work in other windows is not affected."
                : "Sprint downloads the update and opens the containing folder. Automatic install is Windows-only, so finish the install manually.",
            restarts ? "Download and install" : "Download",
            () => InstallUpdate(release, asset, status, installButton),
            confirmTone: ButtonTone.Primary);
    }

    private async void InstallUpdate(ReleaseInfo release, ReleaseAsset asset, TextBlock status, Button installButton)
    {
        installButton.IsEnabled = false;
        var progress = new Progress<double>(fraction =>
            status.Text = $"Downloading… {fraction * 100:0}%");

        try
        {
            _log.Info($"Update install started: version={release.Version} asset={asset.Name}.");
            var staged = await new UpdateInstaller().DownloadAsync(release.Version, asset, progress);

            if (UpdateInstaller.SupportsSelfReplace)
            {
                status.Text = "Installing — Sprint will restart.";
                UpdateInstaller.LaunchWindowsSelfReplace(staged.StagingDir);
                _log.Info("Self-replace helper launched; shutting down for the swap.");
                RequestShutdown();
                return;
            }

            status.Text = "Downloaded — finish the install from the opened folder.";
            UpdateInstaller.RevealInFolder(staged.ArchivePath);
            installButton.IsEnabled = true;
        }
        catch (Exception ex)
        {
            // Never brick the running app: report, re-enable, and leave the user on the
            // working build (the manual GitHub download stays available).
            _log.Warn("Update install failed", ex);
            status.Text = "Update failed — download it from the GitHub release page instead.";
            installButton.IsEnabled = true;
        }
    }

    private void RequestShutdown()
    {
        if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.Shutdown();
            return;
        }

        Close();
    }

    protected override void OnOpened(EventArgs e)
    {
        base.OnOpened(e);

        // Only a real desktop session gets the startup notice: it is also the lifetime
        // that can restart for an install, and it keeps headless/test hosts off the network.
        if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime)
        {
            _ = NotifyIfUpdateAvailableAsync();
        }
    }

    private async Task NotifyIfUpdateAvailableAsync()
    {
        var result = await FetchUpdateAsync();
        if (result is not { UpdateAvailable: true, Latest: { } latest })
        {
            // Silent when up to date or unreachable — startup must never nag.
            return;
        }

        ShowToast(
            GraphiteIntent.Info,
            $"Sprint {DisplayVersion(latest.Version)} is available",
            $"You are on v{BuildInfo.Version} ({AppSettings.NormalizeChannel(_runtime.Settings.UpdateChannel)}). Install it from Settings.",
            "info-circle",
            ("Open Settings", () => Navigate(AppView.Settings)));
    }

    private Control UpcomingPillarPage()
    {
        var stack = PageStack();
        stack.Children.Add(PageHeader(_shell.CurrentTitle, "Upcoming pillar", Graphite.StatusPill("Upcoming", Graphite.BlueBrush)));
        stack.Children.Add(Graphite.StatePanel(
            $"{_shell.CurrentTitle} is on the roadmap",
            "This pillar isn't built yet. It's shown here so the navigation stays stable as Sprint grows — the remote race-engineer link will live in this space.",
            Graphite.BlueBrush));
        return Scroll(stack);
    }

    private Control HelpPage()
    {
        var stack = PageStack();
        stack.Children.Add(PageHeader("Help", "Reference and keyboard shortcuts", Graphite.TextBlock("Ctrl+K", 11, FontWeight.Medium, Graphite.Text3Brush)));

        var search = new TextBox
        {
            PlaceholderText = "Search help",
            MaxWidth = 460,
            HorizontalAlignment = HorizontalAlignment.Left,
        };
        stack.Children.Add(search);

        var topics = new StackPanel { Spacing = 2, MaxWidth = 900, HorizontalAlignment = HorizontalAlignment.Left };
        var entries = new (string Title, string Body)[]
        {
            ("Getting started", "Start on Home to review telemetry health, open a dash, or inspect a connected screen."),
            ("Dash editing", "Open Dashes, choose a layout, then drag widgets from the palette. Changes save automatically; Apply to screen is explicit."),
            ("Devices and bindings", "Add a wheel or display in Devices. Select it to assign a dash, tune its screen, or listen for command bindings."),
            ("Telemetry status", "The toolbar reports the active telemetry link and measured update rate. Green is healthy; yellow or red requires attention."),
            ("Settings and updates", "Profile and dash defaults save when committed. Update checks remain a deliberate manual action."),
            ("Keyboard shortcuts", "Ctrl+K opens command search. Alt+1 through Alt+6 navigate Home, Dashes, Devices, Setups, Settings, and Help. Escape closes transient surfaces."),
        };
        foreach (var entry in entries)
        {
            var row = ReferenceCard(entry.Title, entry.Body);
            row.Tag = $"{entry.Title} {entry.Body}";
            topics.Children.Add(row);
        }

        search.TextChanged += (_, _) =>
        {
            var query = search.Text?.Trim();
            foreach (var child in topics.Children)
            {
                child.IsVisible = string.IsNullOrEmpty(query)
                    || (child.Tag?.ToString()?.Contains(query, StringComparison.OrdinalIgnoreCase) ?? false);
            }
        };
        stack.Children.Add(topics);
        return Scroll(stack);
    }

    private Control PageHeader(string heading, string caption, Control status)
    {
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            MinHeight = 32,
            Margin = new Thickness(0, 0, 0, 4)
        };
        var context = Graphite.TextBlock(caption, 12, FontWeight.Normal, Graphite.Text3Brush);
        context.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(context, 0);
        grid.Children.Add(context);
        Grid.SetColumn(status, 1);
        grid.Children.Add(status);
        ToolTip.SetTip(grid, heading);
        return grid;
    }

    private static StackPanel PageStack()
    {
        return new StackPanel
        {
            Spacing = 20,
            Margin = new Thickness(24, 20, 24, 32)
        };
    }

    private static ScrollViewer Scroll(Control content)
    {
        return new ScrollViewer
        {
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Content = content
        };
    }

    private Control MetricTile(string label, string value, string caption, IBrush? valueBrush = null)
    {
        var stack = new StackPanel { Spacing = 5 };
        stack.Children.Add(Graphite.SectionLabel(label));
        stack.Children.Add(Graphite.TextBlock(value, 34, FontWeight.Bold, valueBrush ?? Graphite.TextBrush));
        stack.Children.Add(Graphite.TextBlock(caption, 11, FontWeight.Normal, Graphite.Text3Brush));
        return Graphite.Card(stack);
    }

    private Control PedalTile()
    {
        var telemetry = _telemetry;
        var stack = new StackPanel { Spacing = 8 };
        stack.Children.Add(Graphite.SectionLabel("Pedals"));
        stack.Children.Add(ProgressRow("Throttle", telemetry.Throttle, Graphite.GreenBrush));
        stack.Children.Add(ProgressRow("Brake", telemetry.Brake, Graphite.RedBrush));
        return Graphite.Card(stack);
    }

    private static Control ProgressRow(string label, double value, IBrush brush)
    {
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("80,*"),
            RowDefinitions = new RowDefinitions("Auto")
        };
        AddGrid(grid, Graphite.TextBlock(label, 11, FontWeight.Bold, Graphite.Text2Brush), 0, 0);
        var progress = new ProgressBar
        {
            Minimum = 0,
            Maximum = 1,
            Value = value,
            Height = 8,
            Foreground = brush,
            Background = Graphite.Panel3Brush,
            VerticalAlignment = VerticalAlignment.Center
        };
        AddGrid(grid, progress, 0, 1);
        return grid;
    }

    private Control TrackMap()
    {
        var canvas = new Canvas
        {
            Height = 280,
            ClipToBounds = true,
            Background = Graphite.Panel2Brush
        };
        var points = new[]
        {
            new Point(80, 210), new Point(125, 80), new Point(270, 50), new Point(430, 92),
            new Point(510, 180), new Point(425, 235), new Point(250, 218), new Point(80, 210)
        };
        for (var i = 0; i < points.Length - 1; i++)
        {
            canvas.Children.Add(new Line
            {
                StartPoint = points[i],
                EndPoint = points[i + 1],
                Stroke = Graphite.Line2Brush,
                StrokeThickness = 8,
                StrokeLineCap = PenLineCap.Round
            });
            canvas.Children.Add(new Line
            {
                StartPoint = points[i],
                EndPoint = points[i + 1],
                Stroke = Graphite.AccentBrush,
                StrokeThickness = 3,
                StrokeLineCap = PenLineCap.Round
            });
        }

        var marker = new Border
        {
            Width = 16,
            Height = 16,
            Background = Graphite.GreenBrush,
            CornerRadius = new CornerRadius(999)
        };
        Canvas.SetLeft(marker, 418);
        Canvas.SetTop(marker, 226);
        canvas.Children.Add(marker);
        return canvas;
    }

    private Control TyrePanel()
    {
        var telemetry = _telemetry;
        var stack = new StackPanel { Spacing = 10 };
        stack.Children.Add(Graphite.SectionLabel("Tyres"));
        stack.Children.Add(TyreRow("Front left", telemetry.TireFrontLeft));
        stack.Children.Add(TyreRow("Front right", telemetry.TireFrontRight));
        stack.Children.Add(TyreRow("Rear left", telemetry.TireRearLeft));
        stack.Children.Add(TyreRow("Rear right", telemetry.TireRearRight));
        return stack;
    }

    private static Control TyreRow(string label, int temp)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(grid, Graphite.TextBlock(label, 12, FontWeight.SemiBold, Graphite.Text2Brush), 0, 0);
        AddGrid(grid, Graphite.StatusPill($"{temp}C", temp > 88 ? Graphite.YellowBrush : Graphite.GreenBrush), 0, 1);
        return grid;
    }

    private Control ControlRow(string label, string caption, string value, Action decrement, Action increment)
    {
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Margin = new Thickness(0, 2)
        };
        var text = new StackPanel { Spacing = 3 };
        text.Children.Add(Graphite.TextBlock(label, 13, FontWeight.SemiBold, Graphite.TextBrush));
        text.Children.Add(Graphite.TextBlock(caption, 11, FontWeight.Normal, Graphite.Text3Brush));
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);

        var controls = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center
        };
        controls.Children.Add(StepButton("-", decrement));
        controls.Children.Add(new Border
        {
            MinWidth = 72,
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(10, 6),
            Child = Graphite.TextBlock(value, 12, FontWeight.Bold, Graphite.TextBrush)
        });
        controls.Children.Add(StepButton("+", increment));
        Grid.SetColumn(controls, 1);
        grid.Children.Add(controls);
        return new Border
        {
            Background = Brushes.Transparent,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(0, 0, 0, 1),
            CornerRadius = new CornerRadius(0),
            Padding = new Thickness(10, 12),
            Child = grid
        };
    }

    private static Button StepButton(string label, Action action)
    {
        var button = Graphite.Button(label, ButtonTone.Ghost);
        button.Width = 30;
        button.MinHeight = 30;
        button.Padding = new Thickness(0);
        button.Click += (_, _) => action();
        return button;
    }

    private Control StagedChangesPanel()
    {
        var panel = new StackPanel { Spacing = 8 };
        panel.Children.Add(Graphite.SectionLabel("Staged Changes"));

        var dirty = EngineerStageService.DirtyChanges(_runtime.EngineerControls);
        if (dirty.Count == 0)
        {
            panel.Children.Add(Graphite.TextBlock("In sync with the car", 12, FontWeight.SemiBold, Graphite.GreenBrush));
            return Graphite.Card(panel);
        }

        foreach (var change in dirty)
        {
            var control = _runtime.EngineerControls.First(item => item.Key == change.Key);
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
            var label = Graphite.TextBlock(control.Label, 12, FontWeight.SemiBold, Graphite.Text2Brush);
            Grid.SetColumn(label, 0);
            row.Children.Add(label);
            var pill = Graphite.StatusPill(
                $"{DesktopRuntime.FormatControlValue(control, change.CarValue)} → {DesktopRuntime.FormatControlValue(control, change.StagedValue)}",
                Graphite.YellowBrush);
            Grid.SetColumn(pill, 1);
            row.Children.Add(pill);
            panel.Children.Add(row);
        }

        return Graphite.Card(panel);
    }

    private Control QuickMessagePanel()
    {
        var messages = new[] { "BOX THIS LAP", "PUSH NOW", "FUEL SAVE", "YELLOW S2", "GAP -1.2", "RADIO CHECK" };
        var panel = new StackPanel { Spacing = 10 };
        panel.Children.Add(Graphite.SectionLabel("Quick Message"));
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,*") };
        for (var i = 0; i < messages.Length; i++)
        {
            var message = messages[i];
            AddGrid(grid, ActionButton(message, message.Contains("YELLOW", StringComparison.Ordinal) ? ButtonTone.Neutral : ButtonTone.Ghost, () =>
            {
                _runtime.SendQuickMessage(message);
                RenderBody();
            }), i / 2, i % 2);
        }
        panel.Children.Add(grid);
        return Graphite.Card(panel);
    }

    private Control RadioLogPanel()
    {
        var panel = new StackPanel { Spacing = 8 };
        panel.Children.Add(Graphite.SectionLabel("Radio Log"));
        foreach (var entry in _runtime.RadioLog)
        {
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
            var text = new StackPanel { Spacing = 2 };
            text.Children.Add(Graphite.TextBlock(entry.Message, 12, FontWeight.Bold, Graphite.TextBrush));
            text.Children.Add(Graphite.TextBlock(entry.Detail, 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
            AddGrid(row, text, 0, 0);
            AddGrid(row, Graphite.StatusPill($"L{entry.Lap} {entry.Status}", Graphite.Text2Brush), 0, 1);
            panel.Children.Add(row);
        }
        return Graphite.Card(panel);
    }

    private Control DashLayoutCard(DashLayout layout)
    {
        var details = new StackPanel { Spacing = 7, VerticalAlignment = VerticalAlignment.Center };
        var title = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(title, Graphite.TextBlock(layout.Name, 16, FontWeight.Medium, Graphite.TextBrush), 0, 0);
        AddGrid(title, Graphite.StatusPill(layout.IsDefault ? "Default" : "Custom", layout.IsDefault ? Graphite.GreenBrush : Graphite.BlueBrush), 0, 1);
        details.Children.Add(title);

        var profile = ScreenProfileCatalog.Resolve(layout.ScreenProfileId);
        var assigned = DashDeviceAssignments.EnabledScreensFor(_runtime.Devices, layout.Id);
        var assignment = assigned.Count == 0 ? "Not assigned to a screen" : $"Assigned to {string.Join(", ", assigned.Select(screen => screen.Name))}";
        details.Children.Add(Graphite.TextBlock($"{profile.Orientation} {profile.ResolutionLabel} · {assignment}", 12, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        actions.Children.Add(ActionButton("Edit", ButtonTone.Primary, () => OpenDashEditor(layout)));
        actions.Children.Add(DuplicateToSizeSelector(layout));
        if (layout.IsDefault)
        {
            actions.Children.Add(ActionButton("Reset layout", ButtonTone.Neutral, () => ShowConfirmDialog(
                "Reset dash layout?",
                $"{layout.Name} will return to the bundled default arrangement.",
                "Reset layout",
                () =>
                {
                    _runtime.ResetDashLayout(layout);
                    RenderBody();
                })));
        }
        if (!layout.IsDefault)
        {
            actions.Children.Add(ActionButton("Set default", ButtonTone.Neutral, () =>
            {
                _runtime.SetDefaultDashLayout(layout);
                RenderBody();
            }));
            actions.Children.Add(ActionButton("Delete", ButtonTone.Danger, () => ShowConfirmDialog(
                "Delete dash?",
                $"{layout.Name} and its saved thumbnail will be removed permanently.",
                "Delete dash",
                () =>
                {
                    _runtime.DeleteDashLayout(layout);
                    RenderBody();
                })));
        }

        details.Children.Add(actions);

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*") };
        AddGrid(row, DashPreview(layout, 220, 132), 0, 0);
        details.Margin = new Thickness(18, 0, 0, 0);
        AddGrid(row, details, 0, 1);
        return new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Padding = new Thickness(12),
            Child = row
        };
    }

    // Duplicate-to-size: copies a dash and retargets the copy to a chosen wheel-screen
    // size, refitting its grid while leaving the original intact (US18).
    private Control DuplicateToSizeSelector(DashLayout layout)
    {
        var combo = Graphite.ComboBox(ScreenProfileCatalog.All.Select(profile => profile.Name), selected: null, minWidth: 150, placeholder: "Duplicate to…");
        ToolTip.SetTip(combo, "Duplicate this dash to another screen size");
        combo.SelectionChanged += (_, _) =>
        {
            var chosen = ScreenProfileCatalog.All.FirstOrDefault(profile => string.Equals(profile.Name, combo.SelectedItem?.ToString(), StringComparison.Ordinal));
            if (chosen is not null)
            {
                _runtime.DuplicateDashToProfile(layout, chosen);
                RenderBody();
            }
        };
        return combo;
    }

    private Control DashPreview(DashLayout layout, int width = 300, int height = 180)
    {
        // Real on-wheel pixels via the SkiaSharp painter — the same output the
        // hardware screen and saved thumbnail use, not a labelled-box mock.
        var bitmap = DashImageRenderer.Render(
            layout,
            CurrentTelemetryFrame(),
            _runtime.Settings,
            width,
            height,
            palette: DashPalette.FromLayout(layout));

        return new Border
        {
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(6),
            ClipToBounds = true,
            Child = new Image
            {
                Width = width,
                Height = height,
                Source = bitmap,
                Stretch = Stretch.Fill
            }
        };
    }

    private Border DeviceStatusPill(SavedDevice device)
    {
        var view = DeviceStatusView(device);
        _renderedDeviceStatuses[device.Id] = $"{view.Label}|{view.Detail}";
        var pill = Graphite.StatusPill(view.Label);
        ApplyDeviceStatusPill(pill, view);
        if (!_deviceStatusPills.TryGetValue(device.Id, out var pills))
        {
            pills = [];
            _deviceStatusPills[device.Id] = pills;
        }

        pills.Add(pill);
        return pill;
    }

    private TextBlock DeviceStatusDetail(SavedDevice device)
    {
        var detail = Graphite.TextBlock(
            DeviceStatusView(device).Detail,
            11,
            FontWeight.Normal,
            Graphite.Text3Brush,
            TextWrapping.Wrap);
        if (!_deviceStatusDetails.TryGetValue(device.Id, out var details))
        {
            details = [];
            _deviceStatusDetails[device.Id] = details;
        }

        details.Add(detail);
        return detail;
    }

    private static void ApplyDeviceStatusPill(Border pill, ScreenStatusView view)
    {
        var brush = view.Tone switch
        {
            ScreenStatusTone.Success => Graphite.GreenBrush,
            ScreenStatusTone.Info => Graphite.BlueBrush,
            ScreenStatusTone.Warning => Graphite.ActionMaterialBrush,
            ScreenStatusTone.Error => Graphite.RedBrush,
            _ => Graphite.Text3Brush,
        };
        if (pill.Child is TextBlock text)
        {
            text.Text = view.Label;
            text.Foreground = brush;
        }

        ToolTip.SetTip(pill, view.Detail);
    }

    private ScreenStatusView DeviceStatusView(SavedDevice device)
    {
        if (device.Disabled)
        {
            return new ScreenStatusView("Disabled", "This screen is disabled. Enable it to start output.");
        }

        // A screen labelled for an unbuilt purpose has no publisher by design; report
        // that instead of the generic "no publisher" disconnect, which reads as a fault.
        if (DevicePurposes.Resolve(device.Purpose) is { Available: false } purpose)
        {
            return new ScreenStatusView(
                "Idle",
                $"Set to {purpose.Label}, which Sprint cannot render yet — nothing is being sent to this screen.");
        }

        return ScreenStatusPresentation.Describe(
            _screens.StatusFor(device.Id) ?? ScreenStatus.Disconnected("No active screen publisher."));
    }

    private static Control FormRow(string label, Control input)
    {
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("160,*")
        };
        AddGrid(grid, Graphite.TextBlock(label, 12, FontWeight.SemiBold, Graphite.Text2Brush), 0, 0);
        AddGrid(grid, input, 0, 1);
        return grid;
    }

    private static Control ReferenceCard(string title, string body)
    {
        var stack = new StackPanel { Spacing = 5 };
        stack.Children.Add(Graphite.TextBlock(title, 14, FontWeight.Medium, Graphite.TextBrush));
        stack.Children.Add(Graphite.TextBlock(body, 12, FontWeight.Normal, Graphite.Text2Brush, TextWrapping.Wrap));
        return new Border
        {
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Padding = new Thickness(4, 14),
            Child = stack,
        };
    }

    private Button ActionButton(string label, ButtonTone tone, Action action)
    {
        var button = Graphite.Button(label, tone);
        button.Click += (_, _) => action();
        return button;
    }

    private static void AddGrid(Grid grid, Control control, int row, int column)
    {
        while (grid.RowDefinitions.Count <= row)
        {
            grid.RowDefinitions.Add(new RowDefinition(GridLength.Auto));
        }

        control.Margin = new Thickness(6);
        Grid.SetRow(control, row);
        Grid.SetColumn(control, column);
        grid.Children.Add(control);
    }

}
