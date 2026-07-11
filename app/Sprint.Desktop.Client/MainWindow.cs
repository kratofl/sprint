using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Chrome;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
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
    private readonly IDesktopRuntime _runtime;
    private readonly ShellState _shell;
    private readonly TelemetryEngine _engine;
    private readonly DeviceScreenService _screens;
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
    private readonly ShellCommandRegistry _shellCommands;
    private Border? _commandOverlay;
    private Border? _confirmOverlay;
    private TextBox? _commandSearch;
    private StackPanel? _commandResults;
    private IReadOnlyList<ShellCommand> _visibleCommands = [];
    private int _commandSelection;
    private Control? _focusBeforePalette;
    private InputCaptureState _capture = InputCaptureState.Idle;
    private string? _captureDeviceId;
    private string? _selectedDeviceId;
    private bool _showDeviceCatalog;

    public MainWindow(IDesktopRuntime runtime, ShellState shell, ITelemetrySource telemetrySource)
    {
        _runtime = runtime;
        _shell = shell;
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
        _telemetry = LiveTelemetryPresenter.ToSnapshot(snapshot.Frame);
        var health = TelemetryStatusPresenter.Present(snapshot.Status, snapshot.Hz, DateTimeOffset.UtcNow);
        _statusView = health.Titlebar;
        _surfaceState = health.Surface;

        // WS7: keep a hardware publisher running for each enabled screen device,
        // rendering its assigned dash off the UI thread. Feeds live per-device status.
        _screens = new DeviceScreenService(_runtime, () => _engine.Snapshot.Frame);
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
        var collapsed = _shell.SidebarCollapsed;

        _navRail = new StackPanel { Spacing = 4, Margin = new Thickness(8, 12, 8, 0) };
        AddNavGroup(null,
            (AppView.Home, "Home"),
            (AppView.Dashes, "Dashes"),
            (AppView.Devices, "Devices"),
            (AppView.Setups, "Setups"));

        // Settings/Help pin to the bottom of the rail (matches the Figma sidebar).
        var footer = new StackPanel { Spacing = 4, Margin = new Thickness(8, 6, 8, 12) };
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

    private void AddNavGroup(string? label, params (AppView View, string Label)[] items)
    {
        if (!string.IsNullOrWhiteSpace(label) && !_shell.SidebarCollapsed)
        {
            _navRail.Children.Add(Graphite.SectionLabel(label));
        }

        foreach (var item in items)
        {
            _navRail.Children.Add(NavButton(item.View, item.Label));
        }
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
        CloseCommandPalette();
        CloseConfirmDialog();
        if (_dashEditor is not null && _restoreSidebarAfterEditor && _shell.SidebarCollapsed)
        {
            _shell.ToggleSidebar();
            _restoreSidebarAfterEditor = false;
        }

        _dashEditor = null;
        if (view == AppView.Devices)
        {
            _selectedDeviceId = null;
        }

        _shell.Navigate(view);
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
                _showDeviceCatalog = true;
                BuildShell();
                RenderBody();
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
        return new DashEditorView(controller, _runtime.Settings, () => _engine.Snapshot.Frame, CloseDashEditor);
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

    private void TickTelemetry()
    {
        var now = DateTimeOffset.UtcNow;

        // Drain the engine's latest published snapshot (a consistent, atomic value).
        // The background reader owns acquisition, rate measurement and delta; freshness
        // is applied here against the UI clock inside the status presenter.
        var snapshot = _engine.Snapshot;
        _telemetry = LiveTelemetryPresenter.ToSnapshot(snapshot.Frame);
        var health = TelemetryStatusPresenter.Present(snapshot.Status, snapshot.Hz, now);
        _statusView = health.Titlebar;
        _surfaceState = health.Surface;

        UpdateTitlebar();
        if (_shell.View == AppView.DebugLive)
        {
            RenderBody();
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
        _showDeviceCatalog = false;
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
        stack.Children.Add(PageHeader("Engineer", "Race control, staged car controls, radio log",
            Graphite.StatusPill(dirty == 0 ? "In sync" : $"{dirty} staged", dirty == 0 ? Graphite.GreenBrush : Graphite.YellowBrush)));

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
        actions.Children.Add(ActionButton("Revert", ButtonTone.Ghost, () =>
        {
            _runtime.RevertEngineerChanges();
            RenderBody();
        }));
        actions.Children.Add(ActionButton("Push staged changes", ButtonTone.Primary, () =>
        {
            _runtime.PushEngineerChanges();
            RenderBody();
        }));
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
            programActions.Children.Add(ActionButton("Delete", ButtonTone.Danger, () => ShowConfirmDialog(
                "Delete setup?",
                $"{_selectedSetup.Name} will be removed permanently.",
                "Delete setup",
                () =>
                {
                    var removed = _selectedSetup;
                    _runtime.SetupPrograms.Remove(removed);
                    _selectedSetup = _runtime.SetupPrograms.FirstOrDefault()
                        ?? _runtime.SetupTemplates.FirstOrDefault()
                        ?? new SetupProgram { Id = "setup-empty", Name = "No setup" };
                    _runtime.SaveSetupPrograms();
                    RenderBody();
                })));
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
        var stack = PageStack();
        stack.Children.Add(PageHeader("Devices", "Screens, wheels, bindings, and dash assignments",
            Graphite.StatusPill($"{_runtime.Devices.Count} saved", _runtime.Devices.Count > 0 ? Graphite.GreenBrush : Graphite.Text3Brush)));

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Left };
        actions.Children.Add(ActionButton(_showDeviceCatalog ? "Cancel add" : "Add device", _showDeviceCatalog ? ButtonTone.Ghost : ButtonTone.Primary, () =>
        {
            _showDeviceCatalog = !_showDeviceCatalog;
            RenderBody();
        }));
        stack.Children.Add(actions);

        var split = new Grid { ColumnDefinitions = new ColumnDefinitions("300,*") };
        var saved = new StackPanel { Spacing = 6 };
        saved.Children.Add(Graphite.SectionLabel("Saved devices"));
        if (_runtime.Devices.Count == 0)
        {
            saved.Children.Add(Graphite.TextBlock("No devices yet. Add a wheel or screen to begin.", 12, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        }
        else
        {
            foreach (var device in _runtime.Devices)
            {
                saved.Children.Add(DeviceSummaryCard(device));
            }
        }

        AddGrid(split, new Border
        {
            Background = Graphite.Panel2Brush,
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Padding = new Thickness(10),
            Child = saved,
        }, 0, 0);

        var selected = _runtime.Devices.FirstOrDefault(device => device.Id == _selectedDeviceId);
        Control detail = _showDeviceCatalog
            ? DeviceCatalogPopup()
            : selected is null
                ? DeviceEmptyDetail()
                : DeviceDetail(selected);
        var detailWrap = new Border { Margin = new Thickness(20, 0, 0, 0), Child = detail };
        AddGrid(split, detailWrap, 0, 1);
        stack.Children.Add(split);
        return Scroll(stack);
    }

    private Control DeviceSummaryCard(SavedDevice device)
    {
        var text = new StackPanel { Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        text.Children.Add(Graphite.TextBlock(device.Name, 13, FontWeight.Medium, Graphite.TextBrush, TextWrapping.Wrap));
        text.Children.Add(Graphite.TextBlock(
            IsScreenDevice(device) ? $"{device.Driver} · {device.Width} × {device.Height}" : device.Driver,
            11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        var content = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(content, text, 0, 0);
        AddGrid(content, DeviceStatusPill(device), 0, 1);

        var button = Graphite.Button(device.Name, ButtonTone.Ghost);
        button.Content = content;
        button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        button.VerticalContentAlignment = VerticalAlignment.Stretch;
        button.Padding = new Thickness(10, 8);
        button.Background = string.Equals(_selectedDeviceId, device.Id, StringComparison.Ordinal)
            ? Graphite.Panel3Brush
            : Brushes.Transparent;
        button.Click += (_, _) =>
        {
            _selectedDeviceId = device.Id;
            _showDeviceCatalog = false;
            RenderBody();
        };

        return new Border
        {
            Tag = $"device-card:{device.Id}",
            MinHeight = 54,
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            Child = button
        };
    }

    private Control DeviceThumbnail(SavedDevice device, double width, double height)
    {
        var isWheel = device.Name.Contains("Omega", StringComparison.OrdinalIgnoreCase)
            || device.Type.Contains("wheel", StringComparison.OrdinalIgnoreCase);
        var icon = isWheel ? "gauge" : "device-desktop";
        return new Border
        {
            Tag = $"device-thumb:{device.Id}",
            Width = width,
            Height = height,
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Child = new Grid
            {
                Children =
                {
                    Icons.Create(icon, 34, Graphite.AccentBrush),
                }
            }
        };
    }

    private Control DeviceCatalogPopup()
    {
        var panel = new StackPanel { Spacing = 12 };
        panel.Children.Add(Graphite.SectionLabel("Add device"));

        foreach (var group in _runtime.Catalog.GroupBy(entry => IsGenericDevice(entry) ? "Generic" : "Preconfigured wheels"))
        {
            panel.Children.Add(Graphite.SectionLabel(group.Key));
            var wrap = new WrapPanel { Orientation = Orientation.Horizontal };
            foreach (var entry in group)
            {
                var item = new StackPanel { Spacing = 5, Width = 245, Margin = new Thickness(0, 0, 10, 10) };
                var button = Graphite.Button(entry.Name, ButtonTone.Neutral);
                button.HorizontalContentAlignment = HorizontalAlignment.Left;
                button.Click += (_, _) =>
                {
                    var saved = _runtime.AddDevice(entry);
                    _selectedDeviceId = saved.Id;
                    _showDeviceCatalog = false;
                    _screens.Sync();
                    RenderBody();
                };
                item.Children.Add(button);
                item.Children.Add(Graphite.TextBlock(entry.Description, 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
                wrap.Children.Add(item);
            }

            panel.Children.Add(wrap);
        }

        return Graphite.Card(panel);
    }

    private static bool IsGenericDevice(CatalogDevice entry) => entry.Vid == 0 && entry.Pid == 0;

    private static bool IsScreenDevice(SavedDevice device) =>
        string.Equals(device.Type, "screen", StringComparison.OrdinalIgnoreCase) && device.Width > 0 && device.Height > 0;

    private Control DeviceEmptyDetail()
    {
        var text = new StackPanel
        {
            Spacing = 6,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        var title = Graphite.TextBlock("No device selected", 15, FontWeight.Medium, Graphite.TextBrush);
        title.HorizontalAlignment = HorizontalAlignment.Center;
        text.Children.Add(title);
        var detail = Graphite.TextBlock("Add or select a saved device to edit its screen, name, and command bindings.", 12, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap);
        detail.MaxWidth = 420;
        detail.TextAlignment = TextAlignment.Center;
        text.Children.Add(detail);
        return new Grid { MinHeight = 220, Children = { text } };
    }

    private Control DeviceDetailPage(SavedDevice device)
    {
        return DeviceDetail(device);
    }

    private Control DeviceDetail(SavedDevice device)
    {
        var stack = new StackPanel { Spacing = 12 };
        var title = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(title, EditableDeviceName(device), 0, 0);
        AddGrid(title, DeviceStatusPill(device), 0, 1);
        stack.Children.Add(title);
        stack.Children.Add(Graphite.TextBlock(
            $"{device.Driver} / {device.Width}x{device.Height} / rot {device.Rotation} / offset {device.OffsetX},{device.OffsetY} / margin {device.Margin}",
            12, FontWeight.Normal, Graphite.Text2Brush));

        if (string.Equals(device.Type, "screen", StringComparison.OrdinalIgnoreCase))
        {
            stack.Children.Add(DeviceScreenControls(device));
        }

        var deviceActions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        deviceActions.Children.Add(ActionButton(device.Disabled ? "Enable" : "Disable", ButtonTone.Ghost, () =>
        {
            device.Disabled = !device.Disabled;
            _runtime.SaveDevices();
            _screens.Sync();
            RenderBody();
        }));
        deviceActions.Children.Add(ActionButton("Remove", ButtonTone.Danger, () => ShowConfirmDialog(
            "Remove device?",
            $"{device.Name} and its command bindings will be removed.",
            "Remove device",
            () =>
            {
                CancelDeviceCapture(device.Id);
                _runtime.RemoveDevice(device);
                _selectedDeviceId = null;
                _screens.Sync();
                RenderBody();
            })));
        stack.Children.Add(deviceActions);
        stack.Children.Add(DeviceBindingsCard(device));
        return stack;
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

    private Control DeviceBindingsCard(SavedDevice device)
    {
        var panel = new StackPanel { Spacing = 8 };
        panel.Children.Add(Graphite.SectionLabel("Device bindings"));
        panel.Children.Add(Graphite.TextBlock(
            "Bind this device's buttons or keyboard keys to Sprint commands. Click Listen, then press a key.",
            11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));

        foreach (var meta in _commands.Catalog())
        {
            var bound = device.Bindings.FirstOrDefault(binding => binding.Command == meta.Id);
            var capturing = _capture.IsListening && _capture.Command == meta.Id && _captureDeviceId == device.Id;

            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Margin = new Thickness(0, 2) };
            var text = new StackPanel { Spacing = 2 };
            text.Children.Add(Graphite.TextBlock(meta.Label, 13, FontWeight.SemiBold, Graphite.TextBrush));
            text.Children.Add(Graphite.TextBlock(
                capturing ? "Press a key... (Esc to cancel)" : bound?.Input ?? "Unbound",
                11, FontWeight.Normal, capturing ? Graphite.AccentBrush : Graphite.Text3Brush));
            Grid.SetColumn(text, 0);
            row.Children.Add(text);

            var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
            controls.Children.Add(ActionButton(capturing ? "Cancel" : "Listen", capturing ? ButtonTone.Neutral : ButtonTone.Ghost, () => ToggleDeviceListen(device.Id, meta.Id)));
            if (bound is not null)
            {
                controls.Children.Add(ActionButton("Clear", ButtonTone.Ghost, () => ClearDeviceBinding(device, meta.Id)));
            }

            Grid.SetColumn(controls, 1);
            row.Children.Add(controls);
            panel.Children.Add(row);
        }

        return panel;
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

    private void ShowConfirmDialog(string title, string message, string confirmLabel, Action confirm)
    {
        CloseCommandPalette(restoreFocus: false);
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
        actions.Children.Add(ActionButton("Cancel", ButtonTone.Ghost, CloseConfirmDialog));
        actions.Children.Add(ActionButton(confirmLabel, ButtonTone.Danger, () =>
        {
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
    }

    private void OpenCommandPalette()
    {
        if (_commandOverlay is not null)
        {
            _commandSearch?.Focus();
            return;
        }

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
            ItemsSource = new[] { "stable", "beta", "alpha" },
            SelectedItem = _runtime.Settings.UpdateChannel,
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
        channel.SelectionChanged += (_, _) =>
        {
            _runtime.Settings.UpdateChannel = channel.SelectedItem?.ToString() ?? "stable";
            MarkSaved();
        };

        var form = new StackPanel { Spacing = 12, MaxWidth = 620 };
        form.Children.Add(Graphite.SectionLabel("Profile"));
        form.Children.Add(FormRow("Driver name", driverName));
        form.Children.Add(FormRow("Driver number", driverNumber));
        form.Children.Add(Graphite.SectionLabel("Dash defaults"));
        form.Children.Add(FormRow("Speed unit", speedUnit));
        form.Children.Add(FormRow("Temperature unit", tempUnit));
        form.Children.Add(Graphite.SectionLabel("Release"));
        form.Children.Add(FormRow("Update channel", channel));
        form.Children.Add(Graphite.SectionLabel("About"));
        form.Children.Add(FormRow("Version", Graphite.Chip(
            $"v{BuildInfo.Version} · {BuildInfo.DisplayChannel(_runtime.Settings.UpdateChannel)}", Graphite.BlueBrush)));
        var updateStatus = Graphite.TextBlock("Manual check — auto-install is deferred.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap);
        var checkRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, VerticalAlignment = VerticalAlignment.Center };
        checkRow.Children.Add(ActionButton("Check for updates", ButtonTone.Ghost, () => CheckForUpdates(updateStatus)));
        checkRow.Children.Add(updateStatus);
        form.Children.Add(FormRow("Updates", checkRow));

        form.HorizontalAlignment = HorizontalAlignment.Left;
        stack.Children.Add(form);
        return Scroll(stack);
    }

    private async void CheckForUpdates(TextBlock status)
    {
        status.Text = "Checking…";
        try
        {
            var releases = await new GitHubReleaseSource().FetchAsync("kratofl/sprint");
            var result = UpdateChecker.Check(BuildInfo.Version, _runtime.Settings.UpdateChannel, releases);
            status.Text = result is { UpdateAvailable: true, Latest: { } latest }
                ? $"Update {latest.Version} available"
                : "Up to date";
        }
        catch (Exception)
        {
            // Manual check is best-effort; a network failure must not crash the app.
            status.Text = "Check failed — try again later.";
        }
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
            _engine.Snapshot.Frame,
            _runtime.Settings,
            width,
            height,
            palette: DashPalette.FromTheme(layout.Theme));

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
        if (device.Disabled)
        {
            return Graphite.StatusPill("Disabled", Graphite.Text3Brush);
        }

        var status = _screens.StatusFor(device.Id);
        return status?.State switch
        {
            ScreenConnectionState.Connected => Graphite.StatusPill("Connected", Graphite.GreenBrush),
            ScreenConnectionState.Connecting => Graphite.StatusPill("Connecting", Graphite.YellowBrush),
            ScreenConnectionState.PermissionDenied => Graphite.StatusPill("Driver needed", Graphite.YellowBrush),
            ScreenConnectionState.DeviceBusy => Graphite.StatusPill("Busy", Graphite.YellowBrush),
            ScreenConnectionState.Unsupported => Graphite.StatusPill("Unsupported", Graphite.Text3Brush),
            ScreenConnectionState.Faulted => Graphite.StatusPill("Fault", Graphite.RedBrush),
            _ => Graphite.StatusPill("Offline", Graphite.Text3Brush),
        };
    }

    private Control DeviceScreenControls(SavedDevice device)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Margin = new Thickness(0, 2) };

        row.Children.Add(ActionButton("Rotate", ButtonTone.Ghost, () =>
        {
            _runtime.UpdateDevice(device, device.Name, (device.Rotation + 90) % 360, device.OffsetX, device.OffsetY, device.Margin, device.DashId);
            _screens.Sync();
            RenderBody();
        }));

        row.Children.Add(OffsetStepper("X", () => Nudge(device, -1, 0), () => Nudge(device, 1, 0)));
        row.Children.Add(OffsetStepper("Y", () => Nudge(device, 0, -1), () => Nudge(device, 0, 1)));

        var dashCombo = new ComboBox
        {
            ItemsSource = _runtime.DashLayouts.Select(layout => layout.Name).ToArray(),
            SelectedItem = _runtime.DashLayouts.FirstOrDefault(layout => layout.Id == device.DashId)?.Name
                ?? _runtime.DashLayouts.FirstOrDefault()?.Name,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            MinWidth = 130
        };
        dashCombo.SelectionChanged += (_, _) =>
        {
            var chosen = _runtime.DashLayouts.FirstOrDefault(layout => layout.Name == dashCombo.SelectedItem?.ToString());
            if (chosen is not null && chosen.Id != device.DashId)
            {
                _runtime.UpdateDevice(device, device.Name, device.Rotation, device.OffsetX, device.OffsetY, device.Margin, chosen.Id);
                _screens.Sync();
            }
        };
        row.Children.Add(dashCombo);

        return row;
    }

    private void Nudge(SavedDevice device, int dx, int dy)
    {
        var x = Math.Max(0, device.OffsetX + dx);
        var y = Math.Max(0, device.OffsetY + dy);
        _runtime.UpdateDevice(device, device.Name, device.Rotation, x, y, device.Margin, device.DashId);
        _screens.Sync();
        RenderBody();
    }

    private Control OffsetStepper(string label, Action decrement, Action increment)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 4, VerticalAlignment = VerticalAlignment.Center };
        panel.Children.Add(Graphite.TextBlock(label, 11, FontWeight.Bold, Graphite.Text3Brush));
        panel.Children.Add(StepButton("-", decrement));
        panel.Children.Add(StepButton("+", increment));
        return panel;
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
