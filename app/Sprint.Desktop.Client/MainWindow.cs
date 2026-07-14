using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
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
    private readonly IDesktopRuntime _runtime;
    private readonly ShellState _shell;
    private readonly TelemetryEngine _engine;
    private readonly DeviceScreenService _screens;
    private readonly Grid _root = new();
    private readonly DispatcherTimer _timer;
    private ContentControl _body = new();
    private Border? _bodyTray;
    private StackPanel _navRail = new() { Spacing = 8 };
    private TextBlock _breadcrumb = null!;
    private TextBlock _signalText = null!;
    private TextBlock _hzText = null!;
    private Border _signalDot = null!;
    private TelemetrySnapshot _telemetry;
    private TelemetryStatusView _statusView = new();
    private SurfaceState? _surfaceState;
    private SetupProgram _selectedSetup;
    private SetupProgram? _setupCompareBaseline;
    private DashEditorView? _dashEditor;
    private readonly CommandBus _commands = new();
    private InputCaptureState _capture = InputCaptureState.Idle;

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
        _selectedSetup = _runtime.SetupPrograms.First();

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
        KeyDown += OnGlobalKeyDown;

        Title = "Sprint";
        Width = 1440;
        Height = 900;
        MinWidth = 1120;
        MinHeight = 720;
        Background = Graphite.BgBrush;
        FontFamily = Graphite.FontStack;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        WindowDecorations = Avalonia.Controls.WindowDecorations.None;
        ExtendClientAreaToDecorationsHint = true;

        var iconPath = System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "appicon.png");
        if (File.Exists(iconPath))
        {
            Icon = new WindowIcon(iconPath);
        }

        Content = _root;
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
        _root.RowDefinitions = new RowDefinitions($"{Graphite.TitlebarHeight},*");
        _root.ColumnDefinitions = new ColumnDefinitions($"{_shell.SidebarWidth},*");
        _root.Background = Graphite.PanelBrush;
        _root.Children.Clear();

        var titlebar = BuildTitlebar();
        Grid.SetRow(titlebar, 0);
        Grid.SetColumnSpan(titlebar, 2);
        _root.Children.Add(titlebar);

        var sidebar = BuildSidebar();
        Grid.SetRow(sidebar, 1);
        Grid.SetColumn(sidebar, 0);
        _root.Children.Add(sidebar);

        var tray = new Border
        {
            Background = Graphite.BgBrush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(12),
            Margin = new Thickness(0, 0, 10, 10),
            Child = _body
        };
        _bodyTray = tray;
        Grid.SetRow(tray, 1);
        Grid.SetColumn(tray, 1);
        _root.Children.Add(tray);
    }

    private Control BuildTitlebar()
    {
        _breadcrumb = Graphite.TextBlock("", 11, FontWeight.Bold, Graphite.Text3Brush);
        _signalText = Graphite.TextBlock("", 10, FontWeight.Bold, Graphite.Text2Brush);
        _hzText = Graphite.TextBlock("", 10, FontWeight.SemiBold, Graphite.Text3Brush);
        _signalDot = new Border
        {
            Width = 7,
            Height = 7,
            CornerRadius = new CornerRadius(999),
            Background = Graphite.Text3Brush
        };

        var grid = new Grid
        {
            Background = Graphite.PanelBrush,
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto,*,Auto,Auto,Auto"),
            Height = Graphite.TitlebarHeight
        };
        grid.PointerPressed += BeginDrag;

        var logo = new Border
        {
            Margin = new Thickness(Graphite.Space6, 0, Graphite.Space4, 0),
            VerticalAlignment = VerticalAlignment.Center,
            Child = Brand.LogoMark(20)
        };
        Grid.SetColumn(logo, 0);
        grid.Children.Add(logo);

        var controls = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            VerticalAlignment = VerticalAlignment.Center
        };
        controls.Children.Add(ChromeButton("layout-sidebar", () =>
        {
            _shell.ToggleSidebar();
            BuildShell();
            RenderBody();
        }, "Toggle sidebar"));
        controls.Children.Add(ChromeButton("chevron-left", () => Navigate(AppView.Live), "Go to Live"));
        controls.Children.Add(ChromeButton("chevron-right", () => Navigate(AppView.Settings), "Go to Settings"));
        Grid.SetColumn(controls, 1);
        grid.Children.Add(controls);

        var crumbWrap = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(10, 0, 0, 0)
        };
        var brandCrumb = Graphite.TextBlock("SPRINT TELEMETRY", 11, FontWeight.Bold, Graphite.Text3Brush);
        brandCrumb.FontFamily = Graphite.DisplayFontStack;
        brandCrumb.LetterSpacing = 1;
        crumbWrap.Children.Add(brandCrumb);
        crumbWrap.Children.Add(Graphite.TextBlock("/", 11, FontWeight.Bold, Graphite.Line2Brush));
        crumbWrap.Children.Add(_breadcrumb);
        Grid.SetColumn(crumbWrap, 2);
        grid.Children.Add(crumbWrap);

        var signal = new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(10, 4),
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
        Grid.SetColumn(signal, 3);
        grid.Children.Add(signal);

        var hz = new Border
        {
            Padding = new Thickness(12, 0),
            VerticalAlignment = VerticalAlignment.Center,
            Child = _hzText
        };
        Grid.SetColumn(hz, 4);
        grid.Children.Add(hz);

        var windowButtons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 4,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 10, 0)
        };
        windowButtons.Children.Add(ChromeButton("minus", () => WindowState = WindowState.Minimized, "Minimize"));
        windowButtons.Children.Add(ChromeButton("square", ToggleMaximized, "Maximize / restore"));
        windowButtons.Children.Add(ChromeButton("x", Close, "Close"));
        Grid.SetColumn(windowButtons, 5);
        grid.Children.Add(windowButtons);

        UpdateTitlebar();
        return grid;
    }

    private Control BuildSidebar()
    {
        var collapsed = _shell.SidebarCollapsed;

        var brand = collapsed ? Brand.LogoMark(28) : Brand.Wordmark(30);
        brand.HorizontalAlignment = collapsed ? HorizontalAlignment.Center : HorizontalAlignment.Left;
        var header = new Border
        {
            Padding = new Thickness(collapsed ? 10 : 14, 14, 14, 14),
            Child = brand
        };

        _navRail = new StackPanel { Spacing = 4, Margin = new Thickness(10, 2) };
        AddNavGroup(null, (AppView.Live, "Live"), (AppView.Engineer, "Engineer"), (AppView.Setup, "Setup"));
        AddNavGroup("Dash Studio", (AppView.Dashes, "Dashes"), (AppView.Devices, "Devices"));

        // Settings/Help pin to the bottom of the rail (matches the Figma sidebar).
        var footer = new StackPanel { Spacing = 4, Margin = new Thickness(10, 6, 10, 12) };
        footer.Children.Add(NavButton(AppView.Settings, "Settings"));
        footer.Children.Add(NavButton(AppView.Help, "Help"));

        var dock = new DockPanel { LastChildFill = true };
        DockPanel.SetDock(header, Dock.Top);
        DockPanel.SetDock(footer, Dock.Bottom);
        dock.Children.Add(header);
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
            BorderThickness = new Thickness(0, 0, 1, 0),
            Child = dock
        };
    }

    private static string NavIconName(AppView view) => view switch
    {
        AppView.Live => "activity",
        AppView.Engineer => "tool",
        AppView.Setup => "adjustments",
        AppView.Dashes => "layout-dashboard",
        AppView.Devices => "device-desktop",
        AppView.Settings => "settings",
        AppView.Help => "help-circle",
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

    private Button NavButton(AppView view, string label)
    {
        var active = view == _shell.View;
        var collapsed = _shell.SidebarCollapsed;
        var tint = active ? Graphite.AccentBrush : Graphite.Text2Brush;
        var icon = Icons.Create(NavIconName(view), 16, tint);

        Control content;
        if (collapsed)
        {
            content = icon;
        }
        else
        {
            var row = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 10,
                VerticalAlignment = VerticalAlignment.Center
            };
            row.Children.Add(icon);
            row.Children.Add(new TextBlock
            {
                Text = label,
                FontFamily = Graphite.FontStackMedium,
                FontSize = 13,
                Foreground = tint,
                VerticalAlignment = VerticalAlignment.Center
            });
            content = row;
        }

        var button = new Button
        {
            Content = content,
            // Figma NavigationItem: selected = filled #1A1A1A pill + hairline + ember
            // content; default = panel fill, muted content (docs/FIGMA_COMPONENTS.md).
            Background = active ? Graphite.Panel3Brush : Graphite.PanelBrush,
            Foreground = tint,
            BorderBrush = active ? Graphite.LineBrush : Graphite.PanelBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(collapsed ? 0 : 10, 8),
            MinHeight = 32,
            Margin = new Thickness(0),
            HorizontalAlignment = HorizontalAlignment.Stretch,
            HorizontalContentAlignment = collapsed ? HorizontalAlignment.Center : HorizontalAlignment.Left,
            VerticalContentAlignment = VerticalAlignment.Center
        };
        button.Click += (_, _) => Navigate(view);
        if (collapsed)
        {
            ToolTip.SetTip(button, label); // full label as accessible name when collapsed to an icon
        }

        return button;
    }

    private Button ChromeButton(string iconName, Action action, string? tooltip = null)
    {
        var button = Graphite.Button(string.Empty, ButtonTone.Ghost);
        button.Content = Icons.Create(iconName, 16, Graphite.Text2Brush);
        button.Width = 30;
        button.MinHeight = 30;
        button.Padding = new Thickness(0);
        button.HorizontalContentAlignment = HorizontalAlignment.Center;
        button.VerticalContentAlignment = VerticalAlignment.Center;
        button.Click += (_, _) => action();
        ToolTip.SetTip(button, tooltip ?? iconName); // accessible name for icon-only chrome
        return button;
    }

    private void Navigate(AppView view)
    {
        _dashEditor = null;
        _shell.Navigate(view);
        BuildShell();
        RenderBody();
    }

    private void OpenDashEditor(DashLayout layout)
    {
        var controller = new DashEditorController(layout, _runtime.SaveDashLayout);
        _dashEditor = new DashEditorView(controller, _runtime.Settings, () => _engine.Snapshot.Frame, CloseDashEditor);
        RenderBody();
    }

    private void CloseDashEditor()
    {
        _dashEditor = null;
        RenderBody();
    }

    private void BeginDrag(object? sender, PointerPressedEventArgs e)
    {
        var point = e.GetCurrentPoint(this);
        if (point.Properties.IsLeftButtonPressed && WindowDragPolicy.ShouldBeginDrag(e.Source))
        {
            BeginMoveDrag(e);
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
        if (_shell.View == AppView.Live)
        {
            RenderBody();
        }
    }

    private void UpdateTitlebar()
    {
        _breadcrumb.Text = _shell.CurrentTitle;
        _signalText.Text = _statusView.Label;
        _hzText.Text = _statusView.RateText;
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
            AppView.Live => LivePage(),
            AppView.Engineer => EngineerPage(),
            AppView.Setup => SetupPage(),
            AppView.Dashes => _dashEditor as Control ?? DashesPage(),
            AppView.Devices => DevicesPage(),
            AppView.Settings => SettingsPage(),
            AppView.Help => HelpPage(),
            _ => LivePage()
        };
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
        stack.Children.Add(PageHeader("Setup", "Setup programs and A/B comparison cues",
            Graphite.StatusPill(_selectedSetup.Name, Graphite.BlueBrush)));

        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("280,*"),
            RowDefinitions = new RowDefinitions("Auto")
        };

        var programs = new StackPanel { Spacing = 8 };
        programs.Children.Add(Graphite.SectionLabel("Programs"));
        foreach (var program in _runtime.SetupPrograms)
        {
            var button = Graphite.Button(program.Name, program == _selectedSetup ? ButtonTone.Primary : ButtonTone.Ghost);
            button.HorizontalContentAlignment = HorizontalAlignment.Left;
            button.Click += (_, _) =>
            {
                _selectedSetup = program;
                RenderBody();
            };
            programs.Children.Add(button);
        }
        var programActions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        programActions.Children.Add(ActionButton("Duplicate", ButtonTone.Neutral, () =>
        {
            var copy = new SetupProgram
            {
                Id = $"setup-{DateTimeOffset.UtcNow:HHmmss}",
                Name = $"{_selectedSetup.Name} copy",
                Values = new Dictionary<string, double>(_selectedSetup.Values, StringComparer.OrdinalIgnoreCase)
            };
            _runtime.SetupPrograms.Add(copy);
            _selectedSetup = copy;
            _runtime.SaveSetupPrograms();
            RenderBody();
        }));
        if (_runtime.SetupPrograms.Count > 1)
        {
            programActions.Children.Add(ActionButton("Delete", ButtonTone.Danger, () =>
            {
                var removed = _selectedSetup;
                _runtime.SetupPrograms.Remove(removed);
                _selectedSetup = _runtime.SetupPrograms.First();
                _runtime.SaveSetupPrograms();
                RenderBody();
            }));
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
                        _selectedSetup.Values[parameter.Key] = Math.Max(parameter.Min, value - parameter.Step);
                        _runtime.SaveSetupPrograms();
                        RenderBody();
                    },
                    () =>
                    {
                        _selectedSetup.Values[parameter.Key] = Math.Min(parameter.Max, value + parameter.Step);
                        _runtime.SaveSetupPrograms();
                        RenderBody();
                    }));
            }
            editor.Children.Add(Graphite.Card(groupStack, new Thickness(12)));
        }
        AddGrid(grid, editor, 0, 1);

        stack.Children.Add(grid);
        return Scroll(stack);
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
        actions.Children.Add(ActionButton("Create dash", ButtonTone.Primary, () =>
        {
            _runtime.CreateDashLayout();
            RenderBody();
        }));
        stack.Children.Add(actions);

        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,*,*")
        };
        var index = 0;
        foreach (var layout in _runtime.DashLayouts)
        {
            var card = DashLayoutCard(layout);
            AddGrid(grid, card, index / 3, index % 3);
            index += 1;
        }

        stack.Children.Add(grid);
        return Scroll(stack);
    }

    private Control SetupComparePanel()
    {
        var panel = new StackPanel { Spacing = 6, Margin = new Thickness(0, 6, 0, 0) };
        panel.Children.Add(Graphite.SectionLabel("A/B Compare"));

        var others = _runtime.SetupPrograms.Where(program => program != _selectedSetup).ToArray();
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
            ItemsSource = others.Select(program => program.Name).ToArray(),
            SelectedItem = _setupCompareBaseline.Name,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            HorizontalAlignment = HorizontalAlignment.Stretch
        };
        combo.SelectionChanged += (_, _) =>
        {
            _setupCompareBaseline = others.FirstOrDefault(program => program.Name == combo.SelectedItem?.ToString()) ?? others[0];
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

        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("300,*"),
            RowDefinitions = new RowDefinitions("Auto")
        };

        var catalog = new StackPanel { Spacing = 8 };
        catalog.Children.Add(Graphite.SectionLabel("Catalog"));
        foreach (var entry in _runtime.Catalog)
        {
            var button = Graphite.Button(entry.Name, ButtonTone.Neutral);
            button.HorizontalContentAlignment = HorizontalAlignment.Left;
            button.Click += (_, _) =>
            {
                _runtime.AddDevice(entry);
                _screens.Sync();
                RenderBody();
            };
            catalog.Children.Add(button);
            catalog.Children.Add(Graphite.TextBlock(entry.Description, 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
        }
        AddGrid(grid, Graphite.Card(catalog), 0, 0);

        var saved = new StackPanel { Spacing = 10 };
        saved.Children.Add(Graphite.SectionLabel("Saved Devices"));
        if (_runtime.Devices.Count == 0)
        {
            var empty = SurfaceStatePresenter.Describe(SurfaceState.Empty);
            saved.Children.Add(Graphite.StatePanel("No saved devices", "Add a screen or wheel from the catalog on the left.", BrushForTone(empty.Tone)));
        }
        foreach (var device in _runtime.Devices)
        {
            saved.Children.Add(DeviceCard(device));
        }
        AddGrid(grid, saved, 0, 1);

        stack.Children.Add(grid);
        stack.Children.Add(BindingsCard());
        return Scroll(stack);
    }

    private Control BindingsCard()
    {
        var panel = new StackPanel { Spacing = 8 };
        panel.Children.Add(Graphite.SectionLabel("Command Bindings"));
        panel.Children.Add(Graphite.TextBlock(
            "Bind wheel buttons or keyboard keys to Sprint commands. Click Listen, then press a key (physical wheel-button capture uses Windows Raw Input — deferred).",
            11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));

        foreach (var meta in _commands.Catalog())
        {
            var bound = _runtime.Controls.Bindings.FirstOrDefault(binding => binding.Command == meta.Id);
            var capturing = _capture.IsListening && _capture.Command == meta.Id;

            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Margin = new Thickness(0, 2) };
            var text = new StackPanel { Spacing = 2 };
            text.Children.Add(Graphite.TextBlock(meta.Label, 13, FontWeight.SemiBold, Graphite.TextBrush));
            text.Children.Add(Graphite.TextBlock(
                capturing ? "Press a key…  (Esc to cancel)" : bound?.Input ?? "Unbound",
                11, FontWeight.Normal, capturing ? Graphite.AccentBrush : Graphite.Text3Brush));
            Grid.SetColumn(text, 0);
            row.Children.Add(text);

            var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
            controls.Children.Add(ActionButton(capturing ? "Cancel" : "Listen", capturing ? ButtonTone.Neutral : ButtonTone.Ghost, () => ToggleListen(meta.Id)));
            if (bound is not null)
            {
                controls.Children.Add(ActionButton("Clear", ButtonTone.Ghost, () => ClearBinding(meta.Id)));
            }

            Grid.SetColumn(controls, 1);
            row.Children.Add(controls);
            panel.Children.Add(row);
        }

        return Graphite.Card(panel);
    }

    private void ToggleListen(string commandId)
    {
        _capture = _capture.IsListening && _capture.Command == commandId
            ? InputCaptureReducer.Cancel(_capture)
            : InputCaptureReducer.Start(commandId, DateTimeOffset.UtcNow);
        RenderBody();
    }

    private void ClearBinding(string commandId)
    {
        _runtime.Controls.Bindings.RemoveAll(binding => binding.Command == commandId);
        _runtime.SaveControls();
        RenderBody();
    }

    private void OnGlobalKeyDown(object? sender, KeyEventArgs e)
    {
        if (_capture.IsListening)
        {
            HandleCaptureKey(e);
            return;
        }

        // Alt+1..7 jumps between the seven views (keyboard navigation, WS11 a11y).
        if (e.KeyModifiers.HasFlag(KeyModifiers.Alt) && TryViewDigit(e.Key, out var index))
        {
            Navigate((AppView)index);
            e.Handled = true;
        }
    }

    private void HandleCaptureKey(KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            _capture = InputCaptureReducer.Cancel(_capture);
            RenderBody();
            e.Handled = true;
            return;
        }

        _capture = InputCaptureReducer.Capture(_capture, $"key:{e.Key}");
        if (InputCaptureReducer.ToBinding(_capture) is { } binding)
        {
            // One binding per command and per input token (avoid duplicates).
            _runtime.Controls.Bindings.RemoveAll(existing => existing.Command == binding.Command || existing.Input == binding.Input);
            _runtime.Controls.Bindings.Add(binding);
            _runtime.SaveControls();
        }

        _capture = InputCaptureState.Idle;
        RenderBody();
        e.Handled = true;
    }

    private static bool TryViewDigit(Key key, out int index)
    {
        index = key switch
        {
            Key.D1 or Key.NumPad1 => 0,
            Key.D2 or Key.NumPad2 => 1,
            Key.D3 or Key.NumPad3 => 2,
            Key.D4 or Key.NumPad4 => 3,
            Key.D5 or Key.NumPad5 => 4,
            Key.D6 or Key.NumPad6 => 5,
            Key.D7 or Key.NumPad7 => 6,
            _ => -1,
        };
        return index >= 0;
    }

    private Control SettingsPage()
    {
        var stack = PageStack();
        stack.Children.Add(PageHeader("Settings", "Global desktop defaults",
            Graphite.StatusPill(_runtime.Settings.UpdateChannel, Graphite.BlueBrush)));

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

        var form = new StackPanel { Spacing = 12, MaxWidth = 620 };
        form.Children.Add(Graphite.SectionLabel("Profile"));
        form.Children.Add(FormRow("Driver name", driverName));
        form.Children.Add(FormRow("Driver number", driverNumber));
        form.Children.Add(Graphite.SectionLabel("Release"));
        form.Children.Add(FormRow("Update channel", channel));
        form.Children.Add(ActionButton("Save settings", ButtonTone.Primary, () =>
        {
            _runtime.Settings.DriverName = driverName.Text?.Trim() is { Length: > 0 } name ? name : "Your Name";
            _runtime.Settings.DriverNumber = driverNumber.Text?.Trim() is { Length: > 0 } number ? number : "22";
            _runtime.Settings.UpdateChannel = channel.SelectedItem?.ToString() ?? "stable";
            _runtime.SaveSettings();
            RenderBody();
        }));

        form.Children.Add(Graphite.SectionLabel("About"));
        form.Children.Add(FormRow("Version", Graphite.Chip(
            $"v{BuildInfo.Version} · {BuildInfo.DisplayChannel(_runtime.Settings.UpdateChannel)}", Graphite.BlueBrush)));
        var updateStatus = Graphite.TextBlock("Manual check — auto-install is deferred.", 11, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap);
        var checkRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, VerticalAlignment = VerticalAlignment.Center };
        checkRow.Children.Add(ActionButton("Check for updates", ButtonTone.Ghost, () => CheckForUpdates(updateStatus)));
        checkRow.Children.Add(updateStatus);
        form.Children.Add(FormRow("Updates", checkRow));

        stack.Children.Add(Graphite.Card(form));
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
        catch (Exception ex)
        {
            // Manual check is best-effort; a network failure must not crash the app.
            AppDiagnostics.Log.Warn("Update check failed", ex);
            status.Text = "Check failed — try again later.";
        }
    }

    private Control HelpPage()
    {
        var stack = PageStack();
        stack.Children.Add(PageHeader("Help", "Reference cards and desktop shortcuts", Graphite.StatusPill("Avalonia", Graphite.BlueBrush)));

        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,*,*") };
        AddGrid(grid, ReferenceCard("Telemetry", "Live data runs in the desktop process; the shell status pill shows the active link state and the measured update rate."), 0, 0);
        AddGrid(grid, ReferenceCard("Dash Studio", "Dash layouts are persisted as JSON and copied from the default preset on creation."), 0, 1);
        AddGrid(grid, ReferenceCard("Devices", "Device catalog presets remain with the desktop client for portable builds."), 0, 2);
        AddGrid(grid, ReferenceCard("Window", "The custom titlebar owns drag, minimise, maximise, and close controls."), 1, 0);
        AddGrid(grid, ReferenceCard("Settings", "Profile and release-channel settings save to the Sprint app-data folder."), 1, 1);
        AddGrid(grid, ReferenceCard("Graphite", "The shell follows the figma branch's flat Graphite color, border, and density rules."), 1, 2);
        stack.Children.Add(grid);
        return Scroll(stack);
    }

    private Control PageHeader(string heading, string caption, Control status)
    {
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Margin = new Thickness(0, 0, 0, 4)
        };
        var text = new StackPanel { Spacing = 3 };
        text.Children.Add(Graphite.TextBlock(heading, 22, FontWeight.Bold, Graphite.TextBrush));
        text.Children.Add(Graphite.TextBlock(caption, 12, FontWeight.Normal, Graphite.Text3Brush));
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);
        Grid.SetColumn(status, 1);
        grid.Children.Add(status);
        return grid;
    }

    private static StackPanel PageStack()
    {
        return new StackPanel
        {
            Spacing = 14,
            Margin = new Thickness(22)
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
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(10),
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
        var stack = new StackPanel { Spacing = 10 };
        var title = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(title, Graphite.TextBlock(layout.Name, 15, FontWeight.Bold, Graphite.TextBrush), 0, 0);
        AddGrid(title, Graphite.StatusPill(layout.IsDefault ? "Default" : "Custom", layout.IsDefault ? Graphite.GreenBrush : Graphite.BlueBrush), 0, 1);
        stack.Children.Add(title);
        stack.Children.Add(DashPreview(layout));

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        actions.Children.Add(ActionButton("Edit", ButtonTone.Primary, () => OpenDashEditor(layout)));
        if (!layout.IsDefault)
        {
            actions.Children.Add(ActionButton("Set default", ButtonTone.Neutral, () =>
            {
                _runtime.SetDefaultDashLayout(layout);
                RenderBody();
            }));
            actions.Children.Add(ActionButton("Delete", ButtonTone.Danger, () =>
            {
                _runtime.DeleteDashLayout(layout);
                RenderBody();
            }));
        }

        stack.Children.Add(actions);
        return Graphite.Card(stack);
    }

    private Control DashPreview(DashLayout layout)
    {
        const int width = 300;
        const int height = 180;

        // Real on-wheel pixels via the SkiaSharp painter — the same output the
        // hardware screen and saved thumbnail use, not a labelled-box mock.
        var bitmap = DashImageRenderer.Render(
            layout,
            _engine.Snapshot.Frame,
            _runtime.Settings,
            width,
            height);

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

    private Control DeviceCard(SavedDevice device)
    {
        var stack = new StackPanel { Spacing = 8 };
        var title = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        AddGrid(title, Graphite.TextBlock(device.Name, 15, FontWeight.Bold, Graphite.TextBrush), 0, 0);
        AddGrid(title, DeviceStatusPill(device), 0, 1);
        stack.Children.Add(title);
        stack.Children.Add(Graphite.TextBlock(
            $"{device.Driver} · {device.Width}×{device.Height} · rot {device.Rotation}° · offset {device.OffsetX},{device.OffsetY} · margin {device.Margin}",
            12, FontWeight.Normal, Graphite.Text2Brush));

        if (string.Equals(device.Type, "screen", StringComparison.OrdinalIgnoreCase))
        {
            stack.Children.Add(DeviceScreenControls(device));
        }

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        actions.Children.Add(ActionButton(device.Disabled ? "Enable" : "Disable", ButtonTone.Ghost, () =>
        {
            device.Disabled = !device.Disabled;
            _screens.Sync();
            RenderBody();
        }));
        actions.Children.Add(ActionButton("Remove", ButtonTone.Danger, () =>
        {
            _runtime.RemoveDevice(device);
            _screens.Sync();
            RenderBody();
        }));
        stack.Children.Add(actions);
        return Graphite.Card(stack);
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
        var stack = new StackPanel { Spacing = 8 };
        stack.Children.Add(Graphite.TextBlock(title, 15, FontWeight.Bold, Graphite.TextBrush));
        stack.Children.Add(Graphite.TextBlock(body, 12, FontWeight.Normal, Graphite.Text2Brush, TextWrapping.Wrap));
        return Graphite.Card(stack);
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
