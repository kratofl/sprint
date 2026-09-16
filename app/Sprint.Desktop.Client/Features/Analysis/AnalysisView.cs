using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Templates;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using System.Xml.Linq;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Sharing;
using Sprint.Games;
using PathShape = Avalonia.Controls.Shapes.Path;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>The resolved car identity and the only real asset, if Sprint has one.</summary>
internal sealed record AnalysisCarArtwork(
    string Identity,
    string? AssetFileName,
    string MissingMessage)
{
    public bool IsMissing => AssetFileName is null;
}

/// <summary>A real circuit layout and the asset that draws it.</summary>
internal sealed record AnalysisTrackArtwork(string Identity, string AssetFileName);

/// <summary>
/// Resolves artwork from the car model identity, never from a broad class fallback.
/// </summary>
internal static class AnalysisArtworkCatalog
{
    /// <summary>
    /// The circuits Sprint has a real outline for, keyed by <see cref="GameTrackCatalog"/>'s
    /// circuit identity. Every layout of a circuit shares its outline; a circuit that is missing
    /// here draws no outline at all rather than borrowing another circuit's.
    /// </summary>
    private static readonly IReadOnlySet<string> CircuitsWithLayouts = new HashSet<string>(StringComparer.Ordinal)
    {
        "algarve",
        "bahrain",
        "barcelona",
        "cota",
        "daytona",
        "fuji",
        "imola",
        "interlagos",
        "le-mans",
        "monza",
        "paul-ricard",
        "sebring",
        "silverstone",
        "spa",
    };

    /// <summary>The outline for a raw track name, resolved through the game's circuit identity.</summary>
    public static AnalysisTrackArtwork? ResolveTrack(string? game, string? track) =>
        string.IsNullOrWhiteSpace(track) ? null : ResolveCircuit(GameTrackCatalog.CircuitId(game, track));

    /// <summary>The outline for a circuit identity, or null when Sprint has no real asset.</summary>
    public static AnalysisTrackArtwork? ResolveCircuit(string? circuitId) =>
        circuitId is not null && CircuitsWithLayouts.Contains(circuitId)
            ? new AnalysisTrackArtwork(circuitId, $"track-{circuitId}.svg")
            : null;

    public static AnalysisCarArtwork ResolveCar(string? game, string? carModel)
    {
        _ = game;
        var normalized = Normalize(carModel);
        return normalized switch
        {
            "porsche963" => Real("porsche-963", "car-porsche-963.jpg"),
            "ferrari296" or "ferrari296gt3" or "ferrari296lmgt3" =>
                Real("ferrari-296-gt3", "car-ferrari-296-gt3.jpg"),
            "mclaren720slmgt3evo" or "mclaren720sgt3evo" or "mclaren720s" =>
                Missing("mclaren-720s-lmgt3-evo"),
            "porsche911gt3rlmgt3" or "porsche911gt3r" or "porsche911gt3r992" =>
                Missing("porsche-911-gt3-r-lmgt3"),
            _ => Missing(string.IsNullOrWhiteSpace(normalized) ? "unknown-car" : normalized),
        };
    }

    private static AnalysisCarArtwork Real(string identity, string assetFileName) =>
        new(identity, assetFileName, string.Empty);

    private static AnalysisCarArtwork Missing(string identity) =>
        new(identity, null, "No real asset for this model");

    private static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new System.Text.StringBuilder(value.Length);
        foreach (var character in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }
}

/// <summary>
/// The Analysis page (#196): pick two laps from the corpus and overlay them, and pick the lap
/// the Live Compare HUD chases.
/// <para>
/// Its own top-level view rather than a Session Planner page (spec §2.6). Shared laps and
/// practice grinding belong to no plan, so hosting comparison inside the planner would leave
/// the most common comparisons homeless.
/// </para>
/// <para>
/// Rendering lives here rather than in <c>MainWindow</c>, which is already long enough that
/// adding a page to it is the wrong default.
/// </para>
/// </summary>
public sealed class AnalysisView
{
    /// <summary>
    /// Game logos. Cars resolve through <see cref="AnalysisArtworkCatalog.ResolveCar"/> so a model
    /// can never quietly borrow another model's photograph.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string> GameThumbnails =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Le Mans Ultimate"] = "game-le-mans-ultimate.png",
            ["LeMansUltimate"] = "game-le-mans-ultimate.png",
        };

    private static readonly Dictionary<string, Bitmap> ThumbnailCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Geometry CalendarButtonGeometry = Geometry.Parse(
        "M6 3V6 M18 3V6 M4 5H20C21.1 5 22 5.9 22 7V19C22 20.1 21.1 21 20 21H4C2.9 21 2 20.1 2 19V7C2 5.9 2.9 5 4 5H20 M2 10H22");

    private enum SessionStep
    {
        Game,
        Track,
        CarClass,
        Car,
        Session,
    }

    private readonly AnalysisController _controller;
    private readonly LapSharingService _sharing;
    private readonly Func<LiveCompareTarget?, bool> _setCompareTarget;
    private readonly Action _toggleHud;
    private readonly Action _rerender;
    private readonly Action<string, string, string, Action> _confirm;

    private CorpusLap? _hudTarget;
    private string? _sharingNotice;
    private bool _sessionPickerOpen;
    private LapCorpusFilter? _sessionFilter;
    private CorpusSession? _pendingSession;
    private Button? _sessionOpenButton;
    private SessionStep _sessionStep;
    private string _trackSearch = string.Empty;
    // Keyed by list, not by step: the track step's grid and its layout list are two lists in one
    // step, and one offset shared between them scrolled the wrong one.
    private readonly Dictionary<string, Vector> _wizardScrollOffsets = [];
    private AnalysisLapFilter _lapFilter;
    private AnalysisLapSort _lapSort;

    public AnalysisView(
        AnalysisController controller,
        LapSharingService sharing,
        Func<LiveCompareTarget?, bool> setCompareTarget,
        Action toggleHud,
        Action rerender,
        Action<string, string, string, Action> confirm)
    {
        _controller = controller ?? throw new ArgumentNullException(nameof(controller));
        _sharing = sharing ?? throw new ArgumentNullException(nameof(sharing));
        _setCompareTarget = setCompareTarget ?? throw new ArgumentNullException(nameof(setCompareTarget));
        _toggleHud = toggleHud ?? throw new ArgumentNullException(nameof(toggleHud));
        _rerender = rerender ?? throw new ArgumentNullException(nameof(rerender));
        _confirm = confirm ?? throw new ArgumentNullException(nameof(confirm));
    }

    /// <summary>The lap the HUD is chasing, for the page to show and for tests to read.</summary>
    public CorpusLap? HudTarget => _hudTarget;

    public Control Build()
    {
        var state = _controller.Load();
        var root = new Grid { Margin = new Thickness(16, 10, 16, 20) };
        root.Children.Add(Surface(state));
        return root;
    }

    /// <summary>
    /// Builds the picker separately from the page so MainWindow can place it above the whole
    /// shell. Keeping it inside Analysis made even a large dialog inherit the narrower body tray.
    /// </summary>
    public Control? BuildOverlay() => _sessionPickerOpen ? SessionPicker() : null;

    private void OpenSessionPicker()
    {
        _sessionFilter = _controller.CreateSessionFilter();
        _pendingSession = _controller.State().Session;
        _sessionStep = SessionStep.Game;
        _trackSearch = string.Empty;
        _wizardScrollOffsets.Clear();
        _sessionPickerOpen = true;
        _rerender();
    }

    private void CloseSessionPicker()
    {
        _sessionPickerOpen = false;
        _sessionFilter = null;
        _pendingSession = null;
        _sessionOpenButton = null;
        _rerender();
    }

    private Control SessionPicker()
    {
        var filter = _sessionFilter ??= _controller.CreateSessionFilter();
        var content = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,Auto,*,Auto"),
            RowSpacing = 16,
        };

        var heading = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var headingText = new StackPanel { Spacing = 3 };
        headingText.Children.Add(Graphite.TextBlock("Open session", 19, FontWeight.Bold));
        headingText.Children.Add(Graphite.TextBlock(
            "Choose the exact driving context, then open the run you want to analyse.",
            12,
            brush: Graphite.Text2Brush,
            wrapping: TextWrapping.Wrap));
        heading.Children.Add(headingText);

        var close = Graphite.Button("Close", ButtonTone.Ghost, "x");
        close.Click += (_, _) => CloseSessionPicker();
        Grid.SetColumn(close, 1);
        heading.Children.Add(close);
        Grid.SetRow(heading, 0);
        content.Children.Add(heading);

        if (filter.IsEmpty)
        {
            var empty = Graphite.TextBlock(
                "No laps recorded yet. Drive a session or import a lap first.",
                12,
                brush: Graphite.Text3Brush,
                wrapping: TextWrapping.Wrap);
            Grid.SetRow(empty, 2);
            content.Children.Add(empty);
        }
        else
        {
            var stepper = WizardStepper();
            Grid.SetRow(stepper, 1);
            content.Children.Add(stepper);
            var wizardBody = new Grid();
            wizardBody.Children.Add(WizardBody(filter));
            Grid.SetRow(wizardBody, 2);
            content.Children.Add(wizardBody);
            var footer = WizardFooter(filter);
            Grid.SetRow(footer, 3);
            content.Children.Add(footer);
        }

        var panel = new Border
        {
            Tag = "analysis-session-dialog",
            MinWidth = 900,
            MinHeight = 660,
            MaxWidth = 1240,
            MaxHeight = 860,
            Margin = new Thickness(24),
            Padding = new Thickness(28),
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
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Stretch,
            Child = content,
        };
        KeyboardNavigation.SetTabNavigation(panel, KeyboardNavigationMode.Cycle);
        AutomationProperties.SetName(panel, "Open analysis session dialog");
        AutomationProperties.SetHelpText(
            panel,
            "Choose game, track, class, car, date and session. Escape closes this dialog.");
        panel.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape)
            {
                e.Handled = true;
                CloseSessionPicker();
            }
        };
        panel.AttachedToVisualTree += (_, _) => close.Focus();
        panel.PointerPressed += (_, e) => e.Handled = true;

        var overlay = new Border
        {
            Background = Graphite.Brush(Color.FromArgb(190, 0, 0, 0)),
            Child = panel,
        };
        overlay.PointerPressed += (_, _) => CloseSessionPicker();
        return overlay;
    }

    private Control WizardStepper()
    {
        var labels = new[] { "Game", "Track", "Class", "Car", "Session" };
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,*,Auto,*,Auto,*,Auto") };
        for (var index = 0; index < labels.Length; index++)
        {
            if (index > 0)
            {
                var connector = new Border
                {
                    Height = 1,
                    Margin = new Thickness(5, 13, 5, 0),
                    VerticalAlignment = VerticalAlignment.Top,
                    Background = index <= (int)_sessionStep ? Graphite.AccentBrush : Graphite.Line2Brush,
                };
                Grid.SetColumn(connector, (index * 2) - 1);
                grid.Children.Add(connector);
            }

            var completed = index < (int)_sessionStep;
            var current = index == (int)_sessionStep;
            Control markerContent;
            if (completed)
            {
                markerContent = Icons.Create("check", 13, Graphite.Panel2Brush);
            }
            else
            {
                var number = Graphite.TextBlock(
                    (index + 1).ToString(System.Globalization.CultureInfo.InvariantCulture),
                    10.5,
                    FontWeight.SemiBold,
                    current ? Graphite.Panel2Brush : Graphite.Text3Brush);
                number.HorizontalAlignment = HorizontalAlignment.Center;
                number.VerticalAlignment = VerticalAlignment.Center;
                number.TextAlignment = TextAlignment.Center;
                markerContent = number;
            }

            var marker = new Border
            {
                Width = 26,
                Height = 26,
                CornerRadius = new CornerRadius(13),
                HorizontalAlignment = HorizontalAlignment.Center,
                Background = completed || current ? Graphite.AccentBrush : Graphite.Panel3Brush,
                BorderBrush = completed || current ? Graphite.AccentBorderBrush : Graphite.Line2Brush,
                BorderThickness = new Thickness(1),
                Child = markerContent,
            };

            var item = new StackPanel
            {
                Width = 76,
                Spacing = 5,
                HorizontalAlignment = HorizontalAlignment.Center,
            };
            item.Children.Add(marker);
            var label = Graphite.TextBlock(
                labels[index],
                10.5,
                current ? FontWeight.SemiBold : FontWeight.Normal,
                current || completed ? Graphite.TextBrush : Graphite.Text3Brush);
            label.HorizontalAlignment = HorizontalAlignment.Center;
            item.Children.Add(label);
            Grid.SetColumn(item, index * 2);
            grid.Children.Add(item);
        }

        return grid;
    }

    private Control WizardBody(LapCorpusFilter filter) => _sessionStep switch
    {
        SessionStep.Game => GameStep(filter),
        SessionStep.Track => TrackStep(filter),
        SessionStep.CarClass => CarClassStep(filter),
        SessionStep.Car => CarStep(filter),
        _ => SessionStepBody(filter),
    };

    /// <summary>
    /// A step's heading, an optional filter row, and the choices under them. The choices take
    /// every remaining pixel of the dialog: a step that stops halfway down looks broken and
    /// hides rows for no reason.
    /// </summary>
    private static Control StepLayout(Control heading, Control? filterRow, Control body)
    {
        var layout = new Grid
        {
            RowDefinitions = new RowDefinitions(filterRow is null ? "Auto,*" : "Auto,Auto,*"),
            RowSpacing = 12,
        };
        layout.Children.Add(heading);
        if (filterRow is not null)
        {
            Grid.SetRow(filterRow, 1);
            layout.Children.Add(filterRow);
        }

        Grid.SetRow(body, filterRow is null ? 1 : 2);
        layout.Children.Add(body);
        return layout;
    }

    private Control GameStep(LapCorpusFilter filter)
    {
        var tiles = new WrapPanel();
        foreach (var game in filter.Games)
        {
            var value = game;
            tiles.Children.Add(ChoiceTile(
                value,
                subtitle: null,
                selected: string.Equals(filter.Game, value, StringComparison.Ordinal),
                artwork: GameArtwork(value),
                icon: "device-gamepad",
                artworkHeight: 184,
                stretch: false,
                // The logo is the game's name set in the game's own type. Repeating it underneath
                // said the same thing twice.
                showLabel: false,
                click: () =>
                {
                    filter.SelectGame(value);
                    _pendingSession = null;
                    _rerender();
                }));
        }

        return StepLayout(
            StepHeading("Choose a game", "Only games with recorded sessions are shown."),
            null,
            WizardScroller("game", tiles));
    }

    /// <summary>
    /// One card per circuit, never one per layout. Spa and Spa Endurance are the same place, and
    /// spending two of four columns on that left less room for the places a driver is scanning
    /// for.
    /// </summary>
    private Control TrackStep(LapCorpusFilter filter)
    {
        if (filter.Circuit is { } chosen && filter.LayoutIsAChoice)
        {
            return LayoutStep(filter, chosen);
        }

        var search = new TextBox
        {
            PlaceholderText = "Type a track name",
            Text = _trackSearch,
            FontFamily = Graphite.FontStack,
            FontSize = 12,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            Padding = new Thickness(10, 7),
        };

        var tiles = new UniformGrid { Columns = 4 };
        var scroller = WizardScroller("track", tiles, tag: "analysis-track-scroll");
        void RefreshTiles()
        {
            tiles.Children.Clear();
            var matches = filter.Circuits.Where(circuit =>
                string.IsNullOrWhiteSpace(_trackSearch)
                || circuit.Name.Contains(_trackSearch, StringComparison.OrdinalIgnoreCase)
                || circuit.Layouts.Any(layout =>
                    layout.TrackName.Contains(_trackSearch, StringComparison.OrdinalIgnoreCase)));
            foreach (var circuit in matches)
            {
                var value = circuit;
                var selected = string.Equals(filter.Circuit, value.Id, StringComparison.Ordinal);
                tiles.Children.Add(ChoiceTile(
                    value.Name,
                    CircuitSubtitle(value),
                    selected,
                    TrackArtwork(value.Id, value.Name, selected),
                    "route",
                    artworkHeight: 168,
                    stretch: true,
                    showLabel: true,
                    click: () =>
                    {
                        filter.SelectCircuit(value.Id);
                        _pendingSession = null;
                        _rerender();
                    }));
            }

            if (tiles.Children.Count == 0)
            {
                tiles.Children.Add(Graphite.TextBlock("No tracks match that search.", 12, brush: Graphite.Text3Brush));
            }
        }

        search.TextChanged += (_, _) =>
        {
            _trackSearch = search.Text ?? string.Empty;
            _wizardScrollOffsets["track"] = default;
            scroller.Offset = default;
            RefreshTiles();
        };
        RefreshTiles();
        return StepLayout(
            StepHeading("Choose a track", filter.Game ?? string.Empty),
            Graphite.FormField("Search tracks", search),
            scroller);
    }

    /// <summary>
    /// The rest of the track question, asked only when the chosen circuit really has more than
    /// one layout in the driver's history.
    /// </summary>
    private Control LayoutStep(LapCorpusFilter filter, string circuitId)
    {
        var circuit = filter.Circuits.First(candidate =>
            string.Equals(candidate.Id, circuitId, StringComparison.Ordinal));

        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        header.Children.Add(StepHeading(
            "Choose a layout",
            $"{circuit.Name} · {circuit.Layouts.Count} layouts driven"));
        var back = Graphite.Button("All tracks", ButtonTone.Ghost, "chevron-left");
        back.Tag = "analysis-layout-back";
        back.VerticalAlignment = VerticalAlignment.Center;
        back.Click += (_, _) =>
        {
            filter.SelectCircuit(null);
            _pendingSession = null;
            _rerender();
        };
        Grid.SetColumn(back, 1);
        header.Children.Add(back);

        var rows = new StackPanel { Spacing = 8 };
        foreach (var layout in circuit.Layouts)
        {
            var value = layout;
            var selected = string.Equals(filter.Track, value.TrackName, StringComparison.Ordinal);
            var sessions = filter.SessionsOnLayout(value.TrackName);
            var text = new StackPanel { Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
            text.Children.Add(Graphite.TextBlock(value.Label, 14, FontWeight.SemiBold));
            text.Children.Add(Graphite.TextBlock(
                $"{value.TrackName} · {(sessions == 1 ? "1 session" : $"{sessions} sessions")}",
                11.5,
                brush: Graphite.Text3Brush));

            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
            row.Children.Add(text);
            if (selected)
            {
                var check = Icons.Create("check", 16, Graphite.AccentBrush);
                check.VerticalAlignment = VerticalAlignment.Center;
                Grid.SetColumn(check, 1);
                row.Children.Add(check);
            }

            var button = new Button
            {
                Tag = "analysis-layout-row",
                Content = row,
                Padding = new Thickness(14, 11),
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                Background = selected ? Graphite.AccentBgBrush : Graphite.Panel3Brush,
                BorderBrush = selected ? Graphite.AccentBrush : Graphite.LineBrush,
                BorderThickness = new Thickness(selected ? 2 : 1),
                CornerRadius = new CornerRadius(Graphite.RadiusMd),
            };
            AutomationProperties.SetName(button, $"{circuit.Name}, {value.Label}");
            Graphite.QuietPointerFeedback(button);
            var restBackground = button.Background;
            button.PointerEntered += (_, _) => button.Background = selected
                ? Graphite.AccentBgBrush
                : Graphite.Panel3HoverBrush;
            button.PointerExited += (_, _) => button.Background = restBackground;
            button.Click += (_, _) =>
            {
                filter.SelectTrack(value.TrackName);
                _pendingSession = null;
                _rerender();
            };
            rows.Children.Add(button);
        }

        // The outline is context, not the question: it stays a card beside the layouts rather
        // than filling the dialog with a drawing the driver has already recognised.
        var body = new Grid { ColumnDefinitions = new ColumnDefinitions("300,*"), ColumnSpacing = 20 };
        var preview = new Border
        {
            Height = 196,
            VerticalAlignment = VerticalAlignment.Top,
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            ClipToBounds = true,
            Child = TrackArtwork(circuit.Id, circuit.Name, selected: false)
                ?? Icons.Create("route", 32, Graphite.Text3Brush),
        };
        body.Children.Add(preview);
        var list = WizardScroller("track-layouts", rows, tag: "analysis-layout-scroll");
        Grid.SetColumn(list, 1);
        body.Children.Add(list);

        return StepLayout(header, null, body);
    }

    private Control CarClassStep(LapCorpusFilter filter)
    {
        var available = filter.Classes.ToHashSet(StringComparer.Ordinal);
        var choices = new UniformGrid { Columns = 2 };
        foreach (var option in filter.ClassOptions)
        {
            var display = LapCorpusFilter.DisplayClass(option);
            var isAvailable = available.Contains(option.Id);
            var selected = string.Equals(filter.CarClass, option.Id, StringComparison.Ordinal);
            var row = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 10,
                VerticalAlignment = VerticalAlignment.Center,
            };
            row.Children.Add(new Border
            {
                Tag = "analysis-class-badge",
                Width = 58,
                MinHeight = 28,
                Padding = new Thickness(6, 4),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center,
                Background = isAvailable ? CarClassBrush(option.VisualRole) : Graphite.Panel3Brush,
                BorderBrush = isAvailable ? Graphite.Line2Brush : Graphite.LineBrush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(Graphite.RadiusSm),
                Child = new TextBlock
                {
                    Text = display.Abbreviation,
                    FontFamily = Graphite.FontStack,
                    FontSize = 11,
                    FontWeight = FontWeight.SemiBold,
                    Foreground = isAvailable ? Graphite.TextBrush : Graphite.Text3Brush,
                    TextAlignment = TextAlignment.Center,
                    HorizontalAlignment = HorizontalAlignment.Stretch,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            });
            // A text block beside a badge stretches to the row's height by default and then draws
            // its text at the top of that box, which is what put the name above the badge's
            // middle. Centre it explicitly.
            var name = Graphite.TextBlock(
                display.Name,
                14,
                FontWeight.SemiBold,
                isAvailable ? Graphite.TextBrush : Graphite.Text2Brush,
                wrapping: TextWrapping.Wrap);
            name.VerticalAlignment = VerticalAlignment.Center;
            row.Children.Add(name);

            var content = new Grid();
            Grid.SetColumn(row, 0);
            content.Children.Add(row);
            if (selected)
            {
                var indicator = SelectedIndicator();
                Grid.SetColumn(indicator, 1);
                content.Children.Add(indicator);
            }

            var captured = option.Id;
            var button = new Button
            {
                Tag = isAvailable ? "analysis-class-available" : "analysis-class-unavailable",
                Content = content,
                Height = 64,
                Margin = new Thickness(0, 0, 8, 8),
                Padding = new Thickness(12, 8),
                IsEnabled = isAvailable,
                Opacity = 1,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                VerticalContentAlignment = VerticalAlignment.Stretch,
                Background = selected ? Graphite.AccentBgBrush : Graphite.Panel3Brush,
                BorderBrush = selected ? Graphite.AccentBrush : Graphite.LineBrush,
                BorderThickness = new Thickness(selected ? 2 : 1),
                CornerRadius = new CornerRadius(Graphite.RadiusMd),
            };
            AutomationProperties.SetName(button, $"{display.Abbreviation}, {display.Name}");
            AutomationProperties.SetHelpText(
                button,
                isAvailable ? $"{display.Name}, available at {filter.Track}." : $"{display.Name}, not available at {filter.Track}.");
            if (!isAvailable)
            {
                ToolTip.SetTip(button, "Not available at this track");
                ToolTip.SetShowOnDisabled(button, true);
            }

            Graphite.QuietPointerFeedback(button);
            var restBackground = button.Background;
            button.PointerEntered += (_, _) => button.Background = selected
                ? Graphite.AccentBgBrush
                : Graphite.Panel3HoverBrush;
            button.PointerExited += (_, _) => button.Background = restBackground;
            button.Click += (_, _) =>
            {
                filter.SelectClass(captured);
                _pendingSession = null;
                _rerender();
            };
            choices.Children.Add(button);
        }

        return StepLayout(
            StepHeading("Choose a car class", filter.Track ?? string.Empty),
            null,
            WizardScroller("class", choices));
    }

    private Control CarStep(LapCorpusFilter filter)
    {
        var tiles = new UniformGrid { Columns = 2 };
        foreach (var car in filter.CarModels)
        {
            var captured = car;
            var selected = string.Equals(filter.CarModel, car, StringComparison.Ordinal);
            tiles.Children.Add(ChoiceTile(
                car,
                subtitle: null,
                selected,
                CarArtwork(car, selected),
                "gauge",
                artworkHeight: 240,
                stretch: true,
                showLabel: true,
                click: () =>
                {
                    filter.SelectCarModel(captured);
                    _pendingSession = null;
                    _rerender();
                }));
        }

        return StepLayout(
            StepHeading(
                "Choose a car",
                filter.CarClass is null
                    ? string.Empty
                    : GameCarClassCatalog.DisplayName(filter.Game, filter.CarClass)),
            null,
            WizardScroller("car", tiles, tag: "analysis-car-scroll"));
    }

    /// <summary>
    /// The scrolling half of a step. It has no height of its own: the dialog's body row is what
    /// bounds it, so every step ends where the footer starts.
    /// </summary>
    private ScrollViewer WizardScroller(string key, Control content, string? tag = null)
    {
        // Choices sit at the top of the room they are given. A grid that stretches its rows to
        // fill the dialog pushes two options to opposite ends of the screen.
        content.VerticalAlignment = VerticalAlignment.Top;
        var savedOffset = _wizardScrollOffsets.GetValueOrDefault(key);
        var restoring = savedOffset != default;
        var scroller = new ScrollViewer
        {
            Tag = tag,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = content,
        };
        scroller.ScrollChanged += (_, _) =>
        {
            if (!restoring)
            {
                _wizardScrollOffsets[key] = scroller.Offset;
            }
        };
        scroller.AttachedToVisualTree += (_, _) => Dispatcher.UIThread.Post(
            () =>
            {
                scroller.Offset = savedOffset;
                restoring = false;
            },
            DispatcherPriority.Loaded);
        return scroller;
    }

    private static Control StepHeading(string title, string subtitle)
    {
        var heading = new StackPanel { Spacing = 2 };
        heading.Children.Add(Graphite.TextBlock(title, 15, FontWeight.SemiBold));
        if (!string.IsNullOrWhiteSpace(subtitle))
        {
            heading.Children.Add(Graphite.TextBlock(subtitle, 11.5, brush: Graphite.Text3Brush));
        }

        return heading;
    }

    /// <summary>"3 layouts" when the layout is still a question, otherwise which one this is.</summary>
    private static string? CircuitSubtitle(GameCircuit circuit)
    {
        if (circuit.LayoutIsAChoice)
        {
            return $"{circuit.Layouts.Count} layouts";
        }

        var label = circuit.Layouts[0].Label;
        return string.Equals(label, circuit.Name, StringComparison.Ordinal) ? null : label;
    }

    private static Button ChoiceTile(
        string label,
        string? subtitle,
        bool selected,
        Control? artwork,
        string icon,
        double artworkHeight,
        bool stretch,
        bool showLabel,
        Action click)
    {
        var content = new StackPanel { Spacing = 8 };
        var artworkFrame = new Grid();
        artworkFrame.Children.Add(
            artwork ?? Icons.Create(icon, 32, selected ? Graphite.AccentBrush : Graphite.Text2Brush));
        if (selected)
        {
            artworkFrame.Children.Add(SelectedIndicator());
        }

        var card = new Border
        {
            Height = artworkHeight,
            // Selection is the ember border and the check, not an ember wash: tinting the surface
            // under a logo or a photograph only made the artwork muddy.
            Background = Graphite.Panel3Brush,
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            BorderBrush = selected ? Graphite.AccentBrush : Graphite.LineBrush,
            BorderThickness = new Thickness(selected ? 2 : 1),
            ClipToBounds = true,
            Child = artworkFrame,
        };
        content.Children.Add(card);
        if (showLabel)
        {
            var caption = new StackPanel { Spacing = 1 };
            caption.Children.Add(Graphite.TextBlock(label, 12.5, FontWeight.SemiBold, wrapping: TextWrapping.Wrap));
            if (subtitle is { Length: > 0 })
            {
                caption.Children.Add(Graphite.TextBlock(subtitle, 11, brush: Graphite.Text3Brush));
            }

            content.Children.Add(caption);
        }

        var button = new Button
        {
            Content = content,
            Width = stretch ? double.NaN : 400,
            Margin = new Thickness(0, 0, 8, 8),
            Padding = new Thickness(0),
            HorizontalAlignment = stretch ? HorizontalAlignment.Stretch : HorizontalAlignment.Left,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            VerticalContentAlignment = VerticalAlignment.Top,
            Background = Brushes.Transparent,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        AutomationProperties.SetName(button, label);
        ToolTip.SetTip(button, label);

        // The tile's own card is the hover surface. Left to the Fluent template, hovering a tile
        // repainted the whole button — a pale box behind the artwork and a recoloured caption —
        // which read as a selection that had not happened.
        Graphite.QuietPointerFeedback(button);
        var restBackground = card.Background;
        var restBorder = card.BorderBrush;
        button.PointerEntered += (_, _) =>
        {
            if (selected)
            {
                return;
            }

            card.Background = Graphite.Panel3HoverBrush;
            card.BorderBrush = Graphite.Line2Brush;
        };
        button.PointerExited += (_, _) =>
        {
            card.Background = restBackground;
            card.BorderBrush = restBorder;
        };
        button.Click += (_, _) => click();
        return button;
    }

    private static Border SelectedIndicator()
    {
        var indicator = new Border
        {
            Width = 24,
            Height = 24,
            Margin = new Thickness(8),
            Padding = new Thickness(4),
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Background = Graphite.AccentBrush,
            CornerRadius = new CornerRadius(12),
            Child = Icons.Create("check", 16, Graphite.Panel2Brush),
        };
        AutomationProperties.SetName(indicator, "Selected");
        return indicator;
    }

    private static IBrush CarClassBrush(GameCarClassVisualRole role) => role switch
    {
        GameCarClassVisualRole.Hypercar => Graphite.ClassHypercarBrush,
        GameCarClassVisualRole.Lmp2 => Graphite.ClassLmp2Brush,
        GameCarClassVisualRole.Lmgt3 => Graphite.ClassLmgt3Brush,
        GameCarClassVisualRole.Gte => Graphite.ClassGteBrush,
        _ => Graphite.ClassDefaultBrush,
    };

    /// <summary>The circuit's outline, or null when Sprint has no real asset for it.</summary>
    private static Control? TrackArtwork(string circuitId, string circuitName, bool selected)
    {
        if (AnalysisArtworkCatalog.ResolveCircuit(circuitId) is not { } artwork)
        {
            return null;
        }

        return TrackLayoutView.Card(
            artwork.AssetFileName,
            circuitName,
            selected ? Graphite.AccentBrush : Graphite.Text2Brush);
    }

    private static Control? GameArtwork(string game) =>
        GameThumbnails.TryGetValue(game, out var asset)
            ? new Image
            {
                Source = LoadBitmap(asset),
                Stretch = Stretch.Uniform,
                Margin = new Thickness(28, 20),
            }
            : null;

    private static Control CarArtwork(string label, bool selected)
    {
        var artwork = AnalysisArtworkCatalog.ResolveCar(null, label);
        if (artwork.AssetFileName is null)
        {
            var missing = new StackPanel
            {
                Spacing = 7,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
            missing.Children.Add(Icons.Create(
                "help-circle",
                30,
                selected ? Graphite.TextBrush : Graphite.Text3Brush));
            missing.Children.Add(Graphite.TextBlock(
                "Artwork unavailable",
                12,
                FontWeight.SemiBold,
                selected ? Graphite.TextBrush : Graphite.Text2Brush));
            missing.Children.Add(Graphite.TextBlock(
                artwork.MissingMessage,
                10.5,
                brush: Graphite.Text3Brush));
            var state = new Border
            {
                Tag = "analysis-car-missing",
                Background = Graphite.Panel3Brush,
                Child = missing,
            };
            AutomationProperties.SetName(state, $"{label}: artwork unavailable");
            return state;
        }

        var image = new Image
        {
            Tag = "analysis-car-image",
            Source = LoadBitmap(artwork.AssetFileName),
            Stretch = Stretch.UniformToFill,
        };
        AutomationProperties.SetName(image, label);
        return image;
    }

    private static Bitmap LoadBitmap(string asset)
    {
        if (ThumbnailCache.TryGetValue(asset, out var cached))
        {
            return cached;
        }

        using var stream = AssetLoader.Open(new Uri($"avares://Sprint.Desktop.Client/Assets/Analysis/{asset}"));
        var bitmap = new Bitmap(stream);
        ThumbnailCache[asset] = bitmap;
        return bitmap;
    }

    private Control SessionStepBody(LapCorpusFilter filter)
    {
        var sessions = new ScrollViewer
        {
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = SessionList(filter),
        };
        var list = new Border
        {
            // Hugs its rows and grows to the dialog's remaining height, so two sessions are not
            // framed by an empty half-screen and forty still scroll.
            VerticalAlignment = VerticalAlignment.Top,
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            ClipToBounds = true,
            Child = sessions,
        };

        return StepLayout(
            StepHeading("Choose a session", $"{filter.Track} · {filter.CarModel}"),
            DayStep(filter, () =>
            {
                _pendingSession = null;
                sessions.Content = SessionList(filter);
                if (_sessionOpenButton is not null)
                {
                    _sessionOpenButton.IsEnabled = false;
                }
            }),
            list);
    }

    private Control WizardFooter(LapCorpusFilter filter)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto") };
        var summary = Graphite.TextBlock(WizardSummary(filter), 11, brush: Graphite.Text3Brush, wrapping: TextWrapping.Wrap);
        summary.VerticalAlignment = VerticalAlignment.Center;
        grid.Children.Add(summary);

        if (_sessionStep != SessionStep.Game)
        {
            var back = Graphite.Button("Back", ButtonTone.Ghost, "chevron-left");
            back.Click += (_, _) =>
            {
                _sessionStep--;
                _rerender();
            };
            Grid.SetColumn(back, 1);
            grid.Children.Add(back);
        }

        var isLast = _sessionStep == SessionStep.Session;
        // A disabled primary button is rendered neutral by Avalonia; keeping a dark primary
        // icon inside it made the icon and label look like two different states.
        var next = Graphite.Button(isLast ? "Open session" : "Continue", ButtonTone.Primary);
        next.Tag = isLast ? "analysis-session-open" : "analysis-session-next";
        next.Margin = new Thickness(8, 0, 0, 0);
        next.IsEnabled = isLast ? _pendingSession is not null : StepComplete(_sessionStep, filter);
        _sessionOpenButton = isLast ? next : null;
        next.Click += (_, _) =>
        {
            if (isLast)
            {
                _controller.SelectSession(_pendingSession);
                CloseSessionPicker();
                return;
            }

            _sessionStep++;
            _rerender();
        };
        Grid.SetColumn(next, 2);
        grid.Children.Add(next);
        return grid;
    }

    private static bool StepComplete(SessionStep step, LapCorpusFilter filter) => step switch
    {
        SessionStep.Game => filter.Game is not null,
        SessionStep.Track => filter.Track is not null,
        SessionStep.CarClass => filter.CarClass is not null,
        SessionStep.Car => filter.CarModel is not null,
        _ => false,
    };

    private static string WizardSummary(LapCorpusFilter filter)
    {
        var className = filter.CarClass is null
            ? null
            : GameCarClassCatalog.DisplayName(filter.Game, filter.CarClass);
        return string.Join(
            "  /  ",
            new[] { filter.Game, filter.Track, className, filter.CarModel }
                .Where(value => !string.IsNullOrWhiteSpace(value)));
    }

    /// <summary>
    /// An inclusive, optionally open-ended session date range.
    /// <para>
    /// One control, not two inputs at opposite ends of the dialog: the two ends of a range belong
    /// next to each other, and the ranges a driver actually asks for — this week, this month —
    /// are one click rather than two calendars.
    /// </para>
    /// </summary>
    private Control DayStep(LapCorpusFilter filter, Action rangeChanged)
    {
        var from = DatePicker("analysis-date-from", filter.DateFrom);
        var to = DatePicker("analysis-date-to", filter.DateTo);
        StyleCalendarButton(from);
        StyleCalendarButton(to);
        AutomationProperties.SetName(from, "From date");
        AutomationProperties.SetHelpText(
            from,
            "Optional inclusive start date. Type a locale-aware date or open the calendar with Alt+Down.");
        AutomationProperties.SetName(to, "To date");
        AutomationProperties.SetHelpText(
            to,
            "Optional inclusive end date. Type a locale-aware date or open the calendar with Alt+Down.");
        var synchronizingRange = false;
        from.PropertyChanged += (_, change) =>
        {
            if (change.Property != CalendarDatePicker.SelectedDateProperty)
            {
                return;
            }

            if (synchronizingRange)
            {
                return;
            }

            filter.SelectDateFrom(DateOnlyValue(from.SelectedDate));
            synchronizingRange = true;
            to.SelectedDate = PickerDate(filter.DateTo);
            synchronizingRange = false;
            rangeChanged();
        };
        to.PropertyChanged += (_, change) =>
        {
            if (change.Property != CalendarDatePicker.SelectedDateProperty)
            {
                return;
            }

            if (synchronizingRange)
            {
                return;
            }

            filter.SelectDateTo(DateOnlyValue(to.SelectedDate));
            synchronizingRange = true;
            from.SelectedDate = PickerDate(filter.DateFrom);
            synchronizingRange = false;
            rangeChanged();
        };

        // The two labels already say which end is which, so there is no dash between the fields
        // to nudge onto the labels' line or the inputs'.
        var fields = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 10,
            VerticalAlignment = VerticalAlignment.Bottom,
        };
        fields.Children.Add(Graphite.FormField("From", from));
        fields.Children.Add(Graphite.FormField("To", to));

        var presets = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            VerticalAlignment = VerticalAlignment.Bottom,
        };
        var today = DateOnly.FromDateTime(DateTime.Now);
        presets.Children.Add(RangePreset("Last 7 days", today.AddDays(-6), today, filter));
        presets.Children.Add(RangePreset("Last 30 days", today.AddDays(-29), today, filter));
        presets.Children.Add(RangePreset("Any date", null, null, filter));

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*") };
        row.Children.Add(fields);
        Grid.SetColumn(presets, 1);
        presets.HorizontalAlignment = HorizontalAlignment.Right;
        row.Children.Add(presets);

        return new Border
        {
            Tag = "analysis-date-range",
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(14, 10, 14, 12),
            Child = row,
        };
    }

    private static CalendarDatePicker DatePicker(string tag, DateOnly? value) => new()
    {
        Tag = tag,
        PlaceholderText = "Select date",
        SelectedDateFormat = CalendarDatePickerFormat.Short,
        FirstDayOfWeek = System.Globalization.CultureInfo.CurrentCulture.DateTimeFormat.FirstDayOfWeek,
        FontFamily = Graphite.FontStack,
        FontSize = 12.5,
        Background = Graphite.Panel2Brush,
        Foreground = Graphite.TextBrush,
        BorderBrush = Graphite.Line2Brush,
        Padding = new Thickness(10, 6),
        MinHeight = 32,
        Width = 168,
        SelectedDate = PickerDate(value),
    };

    /// <summary>A named range, which is how a driver asks for one: "this week", not two dates.</summary>
    private Button RangePreset(string label, DateOnly? from, DateOnly? to, LapCorpusFilter filter)
    {
        var active = filter.DateFrom == from && filter.DateTo == to;
        var button = Graphite.Button(label, active ? ButtonTone.Neutral : ButtonTone.Ghost);
        button.Tag = "analysis-date-preset";
        button.FontSize = 12;
        button.MinHeight = 32;
        if (active)
        {
            button.BorderBrush = Graphite.AccentBorderBrush;
            button.Foreground = Graphite.TextBrush;
        }

        button.Click += (_, _) =>
        {
            filter.SelectDateRange(from, to);
            _pendingSession = null;
            _rerender();
        };
        return button;
    }

    private static void StyleCalendarButton(CalendarDatePicker picker)
    {
        picker.TemplateApplied += (_, applied) =>
        {
            if (applied.NameScope.Find<Button>("PART_Button") is not { } button)
            {
                return;
            }

            // CalendarDatePicker's Fluent template uses PART_Button for the native
            // calendar command. Replace only that button's visual template so the
            // command, Alt+Down handling, and popup wiring remain CalendarDatePicker's.
            button.Foreground = Graphite.Text2Brush;
            button.Background = Brushes.Transparent;
            button.BorderBrush = Brushes.Transparent;
            button.BorderThickness = new Thickness(0);
            button.Padding = new Thickness(0);
            button.Width = 28;
            button.MinWidth = 28;
            button.Height = 28;
            button.MinHeight = 28;
            button.HorizontalContentAlignment = HorizontalAlignment.Center;
            button.VerticalContentAlignment = VerticalAlignment.Center;
            button.Template = new FuncControlTemplate<Button>((control, _) =>
            {
                var glyph = new PathShape
                {
                    Tag = "analysis-calendar-glyph",
                    Data = CalendarButtonGeometry,
                    Fill = null,
                    Stroke = control.Foreground ?? Graphite.Text2Brush,
                    StrokeThickness = 1.6,
                    StrokeLineCap = PenLineCap.Round,
                    StrokeJoin = PenLineJoin.Round,
                    Stretch = Stretch.Uniform,
                    Width = 19,
                    Height = 19,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                };
                return new Grid
                {
                    Width = 28,
                    Height = 28,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Children = { glyph },
                };
            });
        };
    }

    private static DateTime? PickerDate(DateOnly? date) => date is { } value
        ? value.ToDateTime(TimeOnly.MinValue)
        : null;

    private static DateOnly? DateOnlyValue(DateTime? date) => date is { } value
        ? DateOnly.FromDateTime(value)
        : null;

    private Control SessionList(LapCorpusFilter filter)
    {
        var list = new StackPanel { Spacing = 0 };
        if (filter.Sessions.Count == 0)
        {
            list.Children.Add(Graphite.TextBlock(
                "No sessions match this filter.",
                11.5,
                brush: Graphite.Text3Brush,
                wrapping: TextWrapping.Wrap));
            return list;
        }

        foreach (var session in filter.Sessions)
        {
            var selected = _pendingSession?.Id == session.Id;
            var text = new StackPanel { Spacing = 1 };
            text.Children.Add(Graphite.TextBlock(session.Label, 12.5, FontWeight.SemiBold));
            text.Children.Add(Graphite.TextBlock(
                $"{session.Context.CarModel} · {session.Detail}",
                11,
                brush: Graphite.Text3Brush));
            if (!session.HasChannels)
            {
                // Said on the row: opening it and finding nothing to overlay is worse.
                text.Children.Add(Graphite.TextBlock("No channels", 10.5, brush: Graphite.YellowBrush));
            }

            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto") };
            if (selected)
            {
                row.Children.Add(new Border
                {
                    Width = 3,
                    Margin = new Thickness(0, 2, 12, 2),
                    Background = Graphite.AccentBrush,
                    CornerRadius = new CornerRadius(2),
                });
            }

            Grid.SetColumn(text, 1);
            row.Children.Add(text);
            if (selected)
            {
                var check = Icons.Create("check", 16, Graphite.AccentBrush);
                check.Margin = new Thickness(16, 0, 4, 0);
                check.VerticalAlignment = VerticalAlignment.Center;
                Grid.SetColumn(check, 2);
                row.Children.Add(check);
            }

            var captured = session;
            var button = new Button
            {
                Tag = "analysis-session-row",
                Content = row,
                Background = selected ? Graphite.Panel3Brush : Brushes.Transparent,
                BorderBrush = Graphite.LineBrush,
                BorderThickness = new Thickness(0, 0, 0, 1),
                CornerRadius = new CornerRadius(0),
                Padding = new Thickness(12, 10),
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
            };
            button.Click += (_, _) =>
            {
                _pendingSession = captured;
                _rerender();
            };
            list.Children.Add(button);
        }

        return list;
    }

    private Control LapList(AnalysisState state)
    {
        var visible = AnalysisLapList.Apply(state.Laps, _lapFilter, _lapSort);
        var list = new StackPanel();
        if (visible.Count == 0)
        {
            list.Children.Add(new Border
            {
                Padding = new Thickness(12, 22),
                Child = Graphite.TextBlock("No laps match this filter.", 11.5, brush: Graphite.Text3Brush, wrapping: TextWrapping.Wrap),
            });
        }

        foreach (var lap in visible)
        {
            list.Children.Add(LapRow(lap, state));
        }

        return list;
    }

    private Control LapRow(CorpusLap lap, AnalysisState state)
    {
        var isPrimary = Same(lap, state.Primary);
        var isComparison = Same(lap, state.Comparison);
        var isHudTarget = Same(lap, _hudTarget);

        var text = new StackPanel { Spacing = 1 };
        var title = Graphite.InlineRow(6, Graphite.TextBlock(lap.Label, 12.5, FontWeight.SemiBold));
        if (isPrimary)
        {
            title.AddInline(Graphite.StatusPill("A", Graphite.AccentBrush));
        }

        if (isComparison)
        {
            title.AddInline(Graphite.StatusPill("B", Graphite.BlueBrush));
        }

        if (isHudTarget)
        {
            title.AddInline(Graphite.StatusPill("HUD", Graphite.GreenBrush));
        }

        text.Children.Add(title);
        text.Children.Add(Graphite.TextBlock(lap.Detail, 11, brush: Graphite.Text3Brush));
        if (!lap.HasChannels)
        {
            // The tier is stated on the row, not discovered by clicking and getting nothing.
            text.Children.Add(Graphite.TextBlock(
                lap.Tier == LapTargetTier.ReferenceCurve ? "No channels" : "Time only",
                10.5,
                brush: Graphite.YellowBrush));
        }

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        Grid.SetColumn(text, 0);
        row.Children.Add(text);

        if (lap.HasChannels)
        {
            var actions = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 4,
                VerticalAlignment = VerticalAlignment.Center,
            };
            actions.Children.Add(SmallButton("A", isPrimary, () =>
            {
                _controller.SelectPrimary(lap);
                _rerender();
            }));
            actions.Children.Add(SmallButton("B", isComparison, () =>
            {
                _controller.SelectComparison(lap);
                _rerender();
            }));
            actions.Children.Add(SmallButton("HUD", isHudTarget, () => ChaseLap(lap)));
            Grid.SetColumn(actions, 1);
            row.Children.Add(actions);
        }

        return new Border
        {
            Background = isPrimary || isComparison ? Graphite.Panel3Brush : Brushes.Transparent,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Padding = new Thickness(10, 7),
            Child = row,
        };
    }

    private Control LapSidebar(AnalysisState state)
    {
        var stack = new StackPanel { Spacing = 8 };
        var title = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        title.Children.Add(Graphite.IconSectionLabel("flag", "Laps"));
        var count = Graphite.TextBlock($"{state.Laps.Count}", 11, brush: Graphite.Text3Brush);
        count.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(count, 1);
        title.Children.Add(count);
        stack.Children.Add(title);

        var filter = Graphite.Segmented(
            ["All", "Channels", "Time only"],
            (int)_lapFilter,
            index =>
            {
                _lapFilter = (AnalysisLapFilter)index;
                _rerender();
            },
            stretch: true);
        filter.Tag = "analysis-lap-filter";
        stack.Children.Add(Graphite.FormField("Filter laps", filter));

        var sort = Graphite.ComboBox(
            ["Fastest first", "Lap number"],
            _lapSort == AnalysisLapSort.Fastest ? "Fastest first" : "Lap number",
            150);
        sort.HorizontalAlignment = HorizontalAlignment.Stretch;
        sort.SelectionChanged += (_, _) =>
        {
            _lapSort = string.Equals(sort.SelectedItem?.ToString(), "Lap number", StringComparison.Ordinal)
                ? AnalysisLapSort.LapNumber
                : AnalysisLapSort.Fastest;
            _rerender();
        };
        AutomationProperties.SetName(sort, "Sort laps");
        stack.Children.Add(Graphite.FormField("Sort laps", sort));

        stack.Children.Add(new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            Child = new ScrollViewer
            {
                MaxHeight = 450,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Content = LapList(state),
            },
        });

        return stack;
    }

    private Control Surface(AnalysisState state)
    {
        var stack = new StackPanel { Spacing = 12 };

        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var heading = new StackPanel { Spacing = 2 };
        heading.Children.Add(Graphite.TextBlock("Analysis", 18, FontWeight.SemiBold));
        heading.Children.Add(Graphite.TextBlock(
            state.Session is null
                ? "Compare any two laps."
                : $"{state.Session.Context.TrackCourse} · {state.Session.Context.CarModel} · {state.Session.Label}",
            12,
            brush: Graphite.Text3Brush));
        Grid.SetColumn(heading, 0);
        header.Children.Add(heading);

        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center,
        };

        if (state.Session is not null)
        {
            var change = Graphite.Button("Change session", ButtonTone.Ghost, "folder-open");
            change.Click += (_, _) => OpenSessionPicker();
            actions.Children.Add(change);
        }

        var import = Graphite.Button("Import lap", ButtonTone.Ghost, "download");
        import.Click += (_, _) => ImportLap(import);
        actions.Children.Add(import);

        if (state.Primary is { HasChannels: true } exportable)
        {
            var export = Graphite.Button("Export lap A", ButtonTone.Ghost, "upload");
            export.Click += (_, _) => ExportLap(export, exportable);
            actions.Children.Add(export);
        }

        if (state.Session is not null)
        {
            // Once a session is open, the one ember action is the live driving surface.
            var hud = Graphite.Button("Live Compare overlay", ButtonTone.Primary, "layout-dashboard");
            hud.Click += (_, _) => _toggleHud();
            actions.Children.Add(hud);
        }
        Grid.SetColumn(actions, 1);
        header.Children.Add(actions);
        stack.Children.Add(header);

        if (_sharingNotice is { Length: > 0 } sharing)
        {
            stack.Children.Add(Note(sharing, Graphite.Text2Brush));
        }

        if (_hudTarget is not null)
        {
            stack.Children.Add(Note($"Live Compare is chasing {_hudTarget.Label}.", Graphite.GreenBrush));
        }

        if (state.Session is null)
        {
            stack.Children.Add(SessionEmptySurface(state.Filter.IsEmpty));
            return stack;
        }

        var workspace = new Grid { ColumnDefinitions = new ColumnDefinitions("286,12,*") };
        workspace.Children.Add(LapSidebar(state));

        var analysis = new StackPanel { Spacing = 10 };
        if (state.Stack is null)
        {
            // One statement, where the eye already is. A notice bar repeating the empty panel's
            // message is the same fact said twice, and the second one teaches people to skip
            // both.
            analysis.Children.Add(EmptySurface(state.Notice ?? "Pick a lap to draw.", 500));
        }
        else
        {
            if (state.Notice is { Length: > 0 } notice)
            {
                analysis.Children.Add(Note(notice, Graphite.Text2Brush));
            }

            analysis.Children.Add(new Border
            {
                Background = Graphite.Panel2Brush,
                BorderBrush = Graphite.LineBrush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(Graphite.RadiusLg),
                Padding = new Thickness(4),
                Height = 500,
                Child = new ChartStackView(state.Stack),
            });
        }

        Grid.SetColumn(analysis, 2);
        workspace.Children.Add(analysis);
        stack.Children.Add(workspace);

        return stack;
    }

    private Control SessionEmptySurface(bool corpusEmpty)
    {
        var content = new StackPanel
        {
            Spacing = 12,
            Width = 420,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        content.Children.Add(Graphite.TextBlock(
            corpusEmpty ? "No sessions yet" : "Open a session to begin",
            18,
            FontWeight.SemiBold,
            Graphite.TextBrush));
        content.Children.Add(Graphite.TextBlock(
            corpusEmpty
                ? "Drive a session or import a lap, then come back here to compare it."
                : "Filter your recorded runs by track, class and day, then choose the session whose laps you want to inspect.",
            12,
            brush: Graphite.Text3Brush,
            wrapping: TextWrapping.Wrap));
        if (!corpusEmpty)
        {
            var open = Graphite.Button("Open session", ButtonTone.Primary, "folder-open");
            open.HorizontalAlignment = HorizontalAlignment.Center;
            open.Click += (_, _) => OpenSessionPicker();
            content.Children.Add(open);
        }

        return new Border
        {
            Height = 500,
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Child = content,
        };
    }

    private static Control EmptySurface(string message, double height) => new Border
    {
        Background = Graphite.Panel2Brush,
        BorderBrush = Graphite.LineBrush,
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(Graphite.RadiusLg),
        Height = height,
        Padding = new Thickness(48, 0),
        Child = new TextBlock
        {
            Text = message,
            FontFamily = Graphite.FontStack,
            FontSize = 13,
            Foreground = Graphite.Text3Brush,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = 420,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        },
    };

    private static Control Note(string text, IBrush brush) => new Border
    {
        Background = Graphite.Panel2Brush,
        BorderBrush = Graphite.LineBrush,
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(Graphite.RadiusSm),
        Padding = new Thickness(12, 8),
        Child = Graphite.TextBlock(text, 12, brush: brush, wrapping: TextWrapping.Wrap),
    };

    private static Button SmallButton(string text, bool active, Action click)
    {
        var button = Graphite.Button(text, active ? ButtonTone.Primary : ButtonTone.Ghost);
        button.FontSize = 11;
        button.Padding = new Thickness(9, 4);
        button.MinWidth = 0;
        button.Click += (_, _) => click();
        return button;
    }

    private async void ExportLap(Control anchor, CorpusLap lap)
    {
        try
        {
            _sharingNotice = await _sharing.ExportAsync(anchor, lap);
        }
        catch (Exception ex)
        {
            _sharingNotice = $"Could not export the lap: {ex.Message}";
        }

        _rerender();
    }

    /// <summary>
    /// Reads a lap file and asks before adding it. Import is never silent (spec §2.7) — the
    /// same standard the planner's results import set by refusing to auto-import.
    /// </summary>
    private async void ImportLap(Control anchor)
    {
        SharedLapOffer offer;
        try
        {
            offer = await _sharing.OfferAsync(anchor);
        }
        catch (Exception ex)
        {
            _sharingNotice = $"Could not read that lap file: {ex.Message}";
            _rerender();
            return;
        }

        if (offer.Lap is null)
        {
            _sharingNotice = offer.Message;
            _rerender();
            return;
        }

        var lap = offer.Lap;
        _confirm(
            "Add this lap to your corpus?",
            $"{lap.Attribution} · {lap.Context.TrackCourse} · {lap.Context.CarModel}\n"
            + $"Lap {lap.LapNumber} · {PlanTargetResolver.FormatLapTime(lap.LapTimeSeconds)}\n\n"
            + "It will be added as a third-party lap and can be chased in Live Compare.",
            "Add lap",
            () =>
            {
                _sharingNotice = _sharing.Accept(lap);
                _rerender();
            });
    }

    private void ChaseLap(CorpusLap lap)
    {
        // Selecting the lap already being chased stops chasing it — the same toggle shape as
        // the A/B pickers beside it, rather than a separate "clear target" control.
        if (Same(lap, _hudTarget))
        {
            _setCompareTarget(null);
            _hudTarget = null;
            _rerender();
            return;
        }

        var target = new LiveCompareTarget(
            lap.SessionId,
            lap.LapNumber,
            $"{lap.Context.TrackCourse} · {lap.Label}",
            lap.LapTimeSeconds,
            lap.Context);

        _hudTarget = _setCompareTarget(target) ? lap : null;
        _rerender();
    }

    private static bool Same(CorpusLap? left, CorpusLap? right) =>
        left is not null
        && right is not null
        && left.SessionId == right.SessionId
        && left.LapNumber == right.LapNumber;
}
