#if DEBUG
using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Sprint.Desktop.Features.Development;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop;

/// <summary>
/// Development-only toolbox whose modules can run at the same time: a global
/// game-state override, real screen output, and the process-wide live log.
/// </summary>
public sealed class DiagnosticsWindow : Window
{
    private static readonly ScreenTestPattern[] Patterns =
    [
        ScreenTestPattern.ColorBars,
        ScreenTestPattern.White,
        ScreenTestPattern.Red,
        ScreenTestPattern.Green,
        ScreenTestPattern.Blue,
        ScreenTestPattern.Black,
        ScreenTestPattern.Dashboard,
    ];

    private readonly IDesktopRuntime _runtime;
    private readonly DeviceScreenService _screens;
    private readonly DevelopmentGameState _gameState;
    private readonly LiveLogStore _liveLog;
    private readonly ILog _log;
    private readonly DiagnosticsPaths? _paths;
    private readonly StackPanel _screenList = new() { Spacing = 10 };
    private readonly TextBox _logOutput;
    private readonly ComboBox _levelFilter;
    private readonly TextBox _textFilter;
    private readonly DispatcherTimer _screenTimer;
    private readonly StackPanel _simulationPanel = new() { Spacing = 10 };
    private readonly NumericUpDown _speed;
    private readonly NumericUpDown _rpm;
    private readonly NumericUpDown _gear;
    private readonly NumericUpDown _fuel;
    private readonly NumericUpDown _lap;
    private readonly NumericUpDown _delta;
    private readonly CheckBox _yellow;
    private readonly CheckBox _red;
    private readonly CheckBox _tractionControl;
    private readonly CheckBox _abs;
    private readonly Border _simulationStatus;
    private readonly Button _simulationToggle;
    private bool _updatingSimulationControls;
    private bool _closed;

    public DiagnosticsWindow(
        IDesktopRuntime runtime,
        DeviceScreenService screens,
        DevelopmentGameState gameState,
        LiveLogStore liveLog,
        ILog log,
        DiagnosticsPaths? paths = null)
    {
        _runtime = runtime;
        _screens = screens;
        _gameState = gameState;
        _liveLog = liveLog;
        _log = log;
        _paths = paths;

        Title = "Sprint Development Tools";
        Width = 1500;
        Height = 860;
        MinWidth = 1120;
        MinHeight = 720;
        Background = Graphite.BgBrush;
        FontFamily = Graphite.FontStack;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;

        _levelFilter = Graphite.ComboBox(
            ["All", "Debug", "Info", "Warn", "Error"],
            "All",
            120);
        _levelFilter.Tag = "diagnostics-log-level";

        _textFilter = new TextBox
        {
            Tag = "diagnostics-log-search",
            PlaceholderText = "Filter messages…",
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            MinWidth = 220,
        };

        _logOutput = new TextBox
        {
            Tag = "diagnostics-log-output",
            IsReadOnly = true,
            AcceptsReturn = true,
            TextWrapping = TextWrapping.Wrap,
            FontFamily = new FontFamily("Consolas, Cascadia Mono, monospace"),
            FontSize = 11,
            Background = Graphite.PanelBrush,
            Foreground = Graphite.Text2Brush,
            BorderBrush = Graphite.Line2Brush,
        };

        var values = _gameState.Values;
        _speed = Number(values.SpeedKph, 0, 450, 5);
        _rpm = Number(values.Rpm, 0, 20_000, 100);
        _gear = Number(values.Gear, -1, 10, 1);
        _fuel = Number(values.FuelLiters, 0, 200, 1);
        _lap = Number(values.CurrentLap, 0, 999, 1);
        _delta = Number(values.DeltaSeconds, -60, 60, 0.05m, "0.00");
        _yellow = Toggle("Yellow flag", values.YellowFlag);
        _red = Toggle("Red flag", values.RedFlag);
        _tractionControl = Toggle("TC active", values.TractionControlActive);
        _abs = Toggle("ABS active", values.AbsActive);
        _simulationStatus = Graphite.StatusPill("", Graphite.ActionMaterialBrush);
        _simulationToggle = Graphite.Button("", ButtonTone.Neutral);
        _simulationToggle.Click += (_, _) => _gameState.SetEnabled(!_gameState.Enabled);

        Content = BuildContent();

        _levelFilter.SelectionChanged += (_, _) => RefreshLog();
        _textFilter.TextChanged += (_, _) => RefreshLog();
        _liveLog.EntryWritten += OnEntryWritten;
        _gameState.Changed += OnGameStateChanged;
        WireSimulationInputs();

        _screenTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        _screenTimer.Tick += (_, _) => RefreshScreens();
        _screenTimer.Start();

        Closed += (_, _) =>
        {
            _closed = true;
            _screenTimer.Stop();
            _liveLog.EntryWritten -= OnEntryWritten;
            _gameState.Changed -= OnGameStateChanged;
            _log.Info("Development tools window closed.");
        };

        RefreshSimulation();
        RefreshScreens();
        RefreshLog();
        _log.Info("Development tools window opened.");
    }

    private Control BuildContent()
    {
        var simulationScroll = new ScrollViewer
        {
            Content = _simulationPanel,
            VerticalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto,
        };
        var simulationCard = Graphite.Card(simulationScroll, new Thickness(16));

        var screens = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,Auto,Auto,*"),
            RowSpacing = 10,
        };
        var screenTitle = Graphite.TextBlock("Screen output", 19, FontWeight.SemiBold, Graphite.TextBrush);
        Grid.SetRow(screenTitle, 0);
        screens.Children.Add(screenTitle);
        var screenDescription = Graphite.TextBlock(
            "Real hardware output runs independently. Dashboard uses the global simulated game state when enabled.",
            12,
            FontWeight.Normal,
            Graphite.Text3Brush,
            TextWrapping.Wrap);
        Grid.SetRow(screenDescription, 1);
        screens.Children.Add(screenDescription);

        var globalScreenActions = new WrapPanel
        {
            Orientation = Orientation.Horizontal,
            ItemSpacing = 6,
            LineSpacing = 6,
        };
        var dashboards = Graphite.Button("Dashboard on all", ButtonTone.Neutral);
        dashboards.Click += (_, _) => SetAllScreens(ScreenTestPattern.Dashboard);
        globalScreenActions.Children.Add(dashboards);
        var bars = Graphite.Button("Color bars on all", ButtonTone.Ghost);
        bars.Click += (_, _) => SetAllScreens(ScreenTestPattern.ColorBars);
        globalScreenActions.Children.Add(bars);
        Grid.SetRow(globalScreenActions, 2);
        screens.Children.Add(globalScreenActions);
        var screenListScroll = new ScrollViewer
        {
            Content = _screenList,
            VerticalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto,
        };
        Grid.SetRow(screenListScroll, 3);
        screens.Children.Add(screenListScroll);

        var screenCard = Graphite.Card(screens, new Thickness(16));

        var logging = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,Auto,*"),
            RowSpacing = 10,
        };
        var title = Graphite.TextBlock("Live logging", 19, FontWeight.SemiBold, Graphite.TextBrush);
        Grid.SetRow(title, 0);
        logging.Children.Add(title);

        var filters = new WrapPanel
        {
            Orientation = Orientation.Horizontal,
            ItemSpacing = 8,
            LineSpacing = 6,
            VerticalAlignment = VerticalAlignment.Center,
        };
        filters.Children.Add(Graphite.TextBlock("Minimum level", 11, FontWeight.SemiBold, Graphite.Text2Brush));
        filters.Children.Add(_levelFilter);
        filters.Children.Add(Graphite.TextBlock("Search", 11, FontWeight.SemiBold, Graphite.Text2Brush));
        filters.Children.Add(_textFilter);
        if (_paths is not null)
        {
            var openFolder = Graphite.Button("Open log folder", ButtonTone.Ghost);
            openFolder.Click += (_, _) => OpenLogFolder();
            filters.Children.Add(openFolder);
        }

        Grid.SetRow(filters, 1);
        logging.Children.Add(filters);

        Grid.SetRow(_logOutput, 2);
        logging.Children.Add(_logOutput);

        var logCard = Graphite.Card(logging, new Thickness(16));
        return DevelopmentToolModuleHost.Build(
        [
            new DevelopmentToolModule("game-state", simulationCard),
            new DevelopmentToolModule("screen-output", screenCard),
            new DevelopmentToolModule("live-log", logCard),
        ]);
    }

    private void RefreshSimulation()
    {
        SyncSimulationInputs();
        if (_simulationPanel.Children.Count > 0)
        {
            UpdateSimulationStateControls();
            return;
        }

        _simulationPanel.Children.Add(Graphite.TextBlock(
            "Game state simulation",
            19,
            FontWeight.SemiBold,
            Graphite.TextBrush));
        _simulationPanel.Children.Add(Graphite.TextBlock(
            "Global telemetry override for every dashboard consumer. Screen tests, logging, and future modules remain active in parallel.",
            12,
            FontWeight.Normal,
            Graphite.Text3Brush,
            TextWrapping.Wrap));

        var heading = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center,
        };
        heading.Children.Add(_simulationStatus);
        heading.Children.Add(_simulationToggle);
        _simulationPanel.Children.Add(heading);

        _simulationPanel.Children.Add(Graphite.SectionLabel("Presets"));
        var presets = new WrapPanel
        {
            Orientation = Orientation.Horizontal,
            ItemSpacing = 6,
            LineSpacing = 6,
        };
        foreach (var preset in Enum.GetValues<DevelopmentGamePreset>())
        {
            var button = Graphite.Button(PresetLabel(preset), ButtonTone.Ghost);
            button.Click += (_, _) => _gameState.ApplyPreset(preset);
            presets.Children.Add(button);
        }

        _simulationPanel.Children.Add(presets);
        _simulationPanel.Children.Add(Graphite.SectionLabel("Telemetry"));
        _simulationPanel.Children.Add(SimulationField("Speed", _speed, "km/h"));
        _simulationPanel.Children.Add(SimulationField("RPM", _rpm));
        _simulationPanel.Children.Add(SimulationField("Gear", _gear));
        _simulationPanel.Children.Add(SimulationField("Fuel", _fuel, "L"));
        _simulationPanel.Children.Add(SimulationField("Lap", _lap));
        _simulationPanel.Children.Add(SimulationField("Delta", _delta, "s"));
        _simulationPanel.Children.Add(Graphite.SectionLabel("Conditions"));
        _simulationPanel.Children.Add(_yellow);
        _simulationPanel.Children.Add(_red);
        _simulationPanel.Children.Add(_tractionControl);
        _simulationPanel.Children.Add(_abs);
        UpdateSimulationStateControls();
    }

    private void UpdateSimulationStateControls()
    {
        if (_simulationStatus.Child is TextBlock text)
        {
            text.Text = _gameState.Enabled ? "Simulation enabled" : "Using live telemetry";
            text.Foreground = _gameState.Enabled ? Graphite.ActionMaterialBrush : Graphite.Text3Brush;
        }

        _simulationToggle.Content = _gameState.Enabled ? "Disable simulation" : "Enable simulation";
    }

    private void WireSimulationInputs()
    {
        _speed.ValueChanged += (_, _) => UpdateSimulationFromInputs();
        _rpm.ValueChanged += (_, _) => UpdateSimulationFromInputs();
        _gear.ValueChanged += (_, _) => UpdateSimulationFromInputs();
        _fuel.ValueChanged += (_, _) => UpdateSimulationFromInputs();
        _lap.ValueChanged += (_, _) => UpdateSimulationFromInputs();
        _delta.ValueChanged += (_, _) => UpdateSimulationFromInputs();
        _yellow.IsCheckedChanged += (_, _) => UpdateSimulationFromInputs();
        _red.IsCheckedChanged += (_, _) => UpdateSimulationFromInputs();
        _tractionControl.IsCheckedChanged += (_, _) => UpdateSimulationFromInputs();
        _abs.IsCheckedChanged += (_, _) => UpdateSimulationFromInputs();
    }

    private void UpdateSimulationFromInputs()
    {
        if (_updatingSimulationControls)
        {
            return;
        }

        var values = _gameState.Values with
        {
            SpeedKph = (double)(_speed.Value ?? 0),
            Rpm = (double)(_rpm.Value ?? 0),
            Gear = (int)(_gear.Value ?? 0),
            FuelLiters = (double)(_fuel.Value ?? 0),
            CurrentLap = (int)(_lap.Value ?? 0),
            DeltaSeconds = (double)(_delta.Value ?? 0),
            YellowFlag = _yellow.IsChecked == true,
            RedFlag = _red.IsChecked == true,
            TractionControlActive = _tractionControl.IsChecked == true,
            AbsActive = _abs.IsChecked == true,
        };
        _gameState.Update(values);
    }

    private void SyncSimulationInputs()
    {
        _updatingSimulationControls = true;
        try
        {
            var values = _gameState.Values;
            _speed.Value = (decimal)values.SpeedKph;
            _rpm.Value = (decimal)values.Rpm;
            _gear.Value = values.Gear;
            _fuel.Value = (decimal)values.FuelLiters;
            _lap.Value = values.CurrentLap;
            _delta.Value = (decimal)values.DeltaSeconds;
            _yellow.IsChecked = values.YellowFlag;
            _red.IsChecked = values.RedFlag;
            _tractionControl.IsChecked = values.TractionControlActive;
            _abs.IsChecked = values.AbsActive;
        }
        finally
        {
            _updatingSimulationControls = false;
        }
    }

    private void OnGameStateChanged(object? sender, EventArgs e)
    {
        if (_closed)
        {
            return;
        }

        if (Dispatcher.UIThread.CheckAccess())
        {
            RefreshSimulation();
        }
        else
        {
            Dispatcher.UIThread.Post(RefreshSimulation);
        }
    }

    private void SetAllScreens(ScreenTestPattern pattern)
    {
        var changed = 0;
        foreach (var id in _screens.ActiveDeviceIds)
        {
            if (_screens.SetTestPattern(id, pattern))
            {
                changed++;
            }
        }

        _log.Info($"Development screen pattern applied globally: pattern={pattern} screens={changed}.");
        RefreshScreens();
    }

    private static Grid SimulationField(string label, NumericUpDown input, string? unit = null)
    {
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("80,*,Auto"),
            ColumnSpacing = 6,
        };
        var name = Graphite.TextBlock(label, 11, FontWeight.SemiBold, Graphite.Text2Brush);
        name.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(name, 0);
        grid.Children.Add(name);
        Grid.SetColumn(input, 1);
        grid.Children.Add(input);
        if (!string.IsNullOrWhiteSpace(unit))
        {
            var suffix = Graphite.TextBlock(unit, 11, FontWeight.Normal, Graphite.Text3Brush);
            suffix.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(suffix, 2);
            grid.Children.Add(suffix);
        }

        return grid;
    }

    private static NumericUpDown Number(
        double value,
        decimal minimum,
        decimal maximum,
        decimal increment,
        string format = "0") =>
        new()
        {
            Value = (decimal)value,
            Minimum = minimum,
            Maximum = maximum,
            Increment = increment,
            FormatString = format,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            HorizontalAlignment = HorizontalAlignment.Stretch,
        };

    private static CheckBox Toggle(string label, bool value) => new()
    {
        Content = label,
        IsChecked = value,
        Foreground = Graphite.Text2Brush,
        FontFamily = Graphite.FontStack,
        FontSize = 12,
    };

    private static string PresetLabel(DevelopmentGamePreset preset) => preset switch
    {
        DevelopmentGamePreset.PitLane => "Pit lane",
        _ => preset.ToString(),
    };

    private void RefreshScreens()
    {
        _screenList.Children.Clear();
        var devices = _runtime.Devices
            .Where(DeviceCapabilities.HasScreen)
            .ToArray();

        if (devices.Length == 0)
        {
            _screenList.Children.Add(Graphite.TextBlock(
                "No screens configured. Add one under Devices first.",
                12,
                FontWeight.Normal,
                Graphite.Text3Brush,
                TextWrapping.Wrap));
            return;
        }

        foreach (var device in devices)
        {
            _screenList.Children.Add(ScreenCard(device));
        }
    }

    private Control ScreenCard(Features.Devices.SavedDevice device)
    {
        var stack = new StackPanel { Spacing = 8 };
        var heading = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var name = Graphite.TextBlock(device.Name, 14, FontWeight.SemiBold, Graphite.TextBrush);
        Grid.SetColumn(name, 0);
        heading.Children.Add(name);

        var status = device.Disabled
            ? new ScreenStatusView("Disabled", "Enable this screen under Devices before sending a test pattern.")
            : ScreenStatusPresentation.Describe(
                _screens.StatusFor(device.Id) ?? ScreenStatus.Disconnected("No active screen publisher."));
        var pill = Graphite.StatusPill(status.Label, BrushForStatus(status.Tone));
        ToolTip.SetTip(pill, status.Detail);
        Grid.SetColumn(pill, 1);
        heading.Children.Add(pill);
        stack.Children.Add(heading);

        var identity = ScreenUsbIdentity.ForDriver(device.Driver, device.Vid, device.Pid);
        var configured = $"0x{device.Vid:X4}:0x{device.Pid:X4}";
        var search = $"0x{identity.Vid:X4}:{(identity.Pid == 0 ? "any" : $"0x{identity.Pid:X4}")}";
        stack.Children.Add(Graphite.TextBlock(
            $"{device.Driver} · configured {configured} · USB search {search} · {device.Width}×{device.Height}",
            11,
            FontWeight.Normal,
            Graphite.Text2Brush));
        stack.Children.Add(Graphite.TextBlock(
            status.Detail,
            11,
            FontWeight.Normal,
            Graphite.Text3Brush,
            TextWrapping.Wrap));

        var actions = new WrapPanel
        {
            Orientation = Orientation.Horizontal,
            ItemSpacing = 6,
            LineSpacing = 6,
        };
        foreach (var pattern in Patterns)
        {
            var button = Graphite.Button(PatternLabel(pattern), ButtonTone.Ghost);
            button.IsEnabled = !device.Disabled && _screens.ActiveDeviceIds.Contains(device.Id);
            button.Click += (_, _) =>
            {
                _screens.SetTestPattern(device.Id, pattern);
                RefreshScreens();
            };
            actions.Children.Add(button);
        }

        stack.Children.Add(actions);
        return new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusGroup),
            Padding = new Thickness(12),
            Child = stack,
        };
    }

    private void OnEntryWritten(object? sender, LiveLogEntry entry)
    {
        if (_closed)
        {
            return;
        }

        Dispatcher.UIThread.Post(RefreshLog);
    }

    private void RefreshLog()
    {
        if (_closed)
        {
            return;
        }

        var minimum = _levelFilter.SelectedItem?.ToString() switch
        {
            "Info" => LogLevel.Info,
            "Warn" => LogLevel.Warn,
            "Error" => LogLevel.Error,
            _ => LogLevel.Debug,
        };
        var entries = _liveLog.Filter(minimum, _textFilter.Text);
        _logOutput.Text = string.Join(
            Environment.NewLine,
            entries.Select(entry =>
                $"{entry.Timestamp.ToLocalTime():yyyy-MM-dd HH:mm:ss.fff} [{entry.Level.ToString().ToUpperInvariant(),5}] {entry.Message}" +
                (string.IsNullOrWhiteSpace(entry.Exception) ? "" : $"{Environment.NewLine}{entry.Exception}")));
        _logOutput.CaretIndex = _logOutput.Text?.Length ?? 0;
    }

    private void OpenLogFolder()
    {
        if (_paths is null)
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = _paths.LogDirectory,
                UseShellExecute = true,
            });
            _log.Info($"Diagnostics log folder opened: path={_paths.LogDirectory}.");
        }
        catch (Exception ex)
        {
            _log.Warn($"Diagnostics log folder could not be opened: path={_paths.LogDirectory}.", ex);
        }
    }

    private static string PatternLabel(ScreenTestPattern pattern) => pattern switch
    {
        ScreenTestPattern.ColorBars => "Color bars",
        ScreenTestPattern.Dashboard => "Dashboard",
        _ => pattern.ToString(),
    };

    private static IBrush BrushForStatus(ScreenStatusTone tone) => tone switch
    {
        ScreenStatusTone.Success => Graphite.GreenBrush,
        ScreenStatusTone.Info => Graphite.BlueBrush,
        ScreenStatusTone.Warning => Graphite.ActionMaterialBrush,
        ScreenStatusTone.Error => Graphite.RedBrush,
        _ => Graphite.Text3Brush,
    };
}
#endif
