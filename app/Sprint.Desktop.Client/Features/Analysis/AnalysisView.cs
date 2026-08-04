using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
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
    private static readonly IReadOnlyDictionary<string, string> ThumbnailAssets =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Le Mans Ultimate"] = "game-le-mans-ultimate.png",
            ["LeMansUltimate"] = "game-le-mans-ultimate.png",
            ["Porsche 963"] = "car-porsche-963.jpg",
            ["Porsche_963"] = "car-porsche-963.jpg",
            ["Ferrari 296"] = "car-ferrari-296-gt3.jpg",
            ["Ferrari 296 GT3"] = "car-ferrari-296-gt3.jpg",
            ["Ferrari 296 LMGT3"] = "car-ferrari-296-gt3.jpg",
            ["Ferrari_296_GT3"] = "car-ferrari-296-gt3.jpg",
        };

    private static readonly Dictionary<string, Bitmap> ThumbnailCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly IReadOnlyDictionary<string, TrackLayoutAsset> TrackLayoutAssets = CreateTrackLayoutAssets();
    private static readonly Dictionary<string, Geometry> TrackLayoutCache = new(StringComparer.OrdinalIgnoreCase);

    private sealed record TrackLayoutAsset(string FileName, string? PathId = null, bool Filled = false);

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
    private readonly Dictionary<SessionStep, Vector> _wizardScrollOffsets = [];
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
        SessionStep.Game => ChoiceStep(
            "Choose a game",
            "Only games with recorded sessions are shown.",
            filter.Games,
            filter.Game,
            "device-gamepad",
            game =>
            {
                filter.SelectGame(game);
                _pendingSession = null;
            },
            thumbnail: true),
        SessionStep.Track => TrackStep(filter),
        SessionStep.CarClass => CarClassStep(filter),
        SessionStep.Car => CarStep(filter),
        _ => SessionStepBody(filter),
    };

    private Control TrackStep(LapCorpusFilter filter)
    {
        var layout = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,Auto,*"),
            RowSpacing = 12,
        };
        var heading = StepHeading("Choose a track", filter.Game ?? string.Empty);
        Grid.SetRow(heading, 0);
        layout.Children.Add(heading);
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
        var searchField = Graphite.FormField("Search tracks", search);
        Grid.SetRow(searchField, 1);
        layout.Children.Add(searchField);

        var tiles = new UniformGrid { Columns = 4 };
        var scroller = WizardScroller(SessionStep.Track, tiles, tag: "analysis-track-scroll");
        Grid.SetRow(scroller, 2);
        void RefreshTiles()
        {
            tiles.Children.Clear();
            var matches = filter.Tracks.Where(track =>
                string.IsNullOrWhiteSpace(_trackSearch)
                || track.Contains(_trackSearch, StringComparison.OrdinalIgnoreCase));
            foreach (var track in matches)
            {
                var value = track;
                tiles.Children.Add(ChoiceTile(
                    value,
                    string.Equals(filter.Track, value, StringComparison.Ordinal),
                    "route",
                    thumbnail: true,
                    stretch: true,
                    click: () =>
                    {
                        filter.SelectTrack(value);
                        _pendingSession = null;
                        _rerender();
                    },
                    artworkHeight: 184));
            }

            if (tiles.Children.Count == 0)
            {
                tiles.Children.Add(Graphite.TextBlock("No tracks match that search.", 12, brush: Graphite.Text3Brush));
            }
        }

        search.TextChanged += (_, _) =>
        {
            _trackSearch = search.Text ?? string.Empty;
            _wizardScrollOffsets[SessionStep.Track] = default;
            scroller.Offset = default;
            RefreshTiles();
        };
        RefreshTiles();
        layout.Children.Add(scroller);
        return layout;
    }

    private Control ChoiceStep(
        string title,
        string subtitle,
        IReadOnlyList<string> options,
        string? selected,
        string icon,
        Action<string> select,
        bool thumbnail = false)
    {
        var stack = new StackPanel { Spacing = 10 };
        stack.Children.Add(StepHeading(title, subtitle));
        var tiles = new WrapPanel();
        var scroller = WizardScroller(_sessionStep, tiles, 286);
        foreach (var option in options)
        {
            var value = option;
            tiles.Children.Add(ChoiceTile(
                value,
                string.Equals(value, selected, StringComparison.Ordinal),
                icon,
                thumbnail,
                stretch: false,
                click: () =>
                {
                    select(value);
                    _rerender();
                }));
        }

        stack.Children.Add(scroller);
        return stack;
    }

    private Control CarClassStep(LapCorpusFilter filter)
    {
        var stack = new StackPanel { Spacing = 16 };
        stack.Children.Add(StepHeading("Choose a car class", filter.Track ?? string.Empty));

        var available = filter.Classes.ToHashSet(StringComparer.Ordinal);
        var choices = new UniformGrid { Columns = 4 };
        foreach (var option in filter.ClassOptions)
        {
            var isAvailable = available.Contains(option.Id);
            var selected = string.Equals(filter.CarClass, option.Id, StringComparison.Ordinal);
            var copy = new Grid
            {
                Margin = new Thickness(16, 8),
                VerticalAlignment = VerticalAlignment.Center,
            };
            copy.Children.Add(Graphite.TextBlock(
                option.Name,
                24,
                FontWeight.Bold,
                isAvailable ? Graphite.TextBrush : Graphite.Text2Brush));

            var content = new Grid();
            content.Children.Add(copy);
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
                Height = 88,
                Margin = new Thickness(0, 0, 8, 8),
                Padding = new Thickness(0),
                IsEnabled = isAvailable,
                Opacity = 1,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                VerticalContentAlignment = VerticalAlignment.Stretch,
                Background = isAvailable
                    ? CarClassBrush(option.VisualRole)
                    : Graphite.Panel3Brush,
                BorderBrush = selected ? Graphite.AccentBrush : Brushes.Transparent,
                BorderThickness = new Thickness(selected ? 2 : 0),
                CornerRadius = new CornerRadius(Graphite.RadiusMd),
            };
            AutomationProperties.SetName(button, option.Name);
            AutomationProperties.SetHelpText(
                button,
                isAvailable ? $"{option.Name}, available at {filter.Track}." : $"{option.Name}, not available at {filter.Track}.");
            if (!isAvailable)
            {
                ToolTip.SetTip(button, "Not available at this track");
                ToolTip.SetShowOnDisabled(button, true);
            }
            button.Click += (_, _) =>
            {
                filter.SelectClass(captured);
                _pendingSession = null;
                _rerender();
            };
            choices.Children.Add(button);
        }

        stack.Children.Add(WizardScroller(SessionStep.CarClass, choices, 240));
        return stack;
    }

    private Control CarStep(LapCorpusFilter filter)
    {
        var stack = new StackPanel { Spacing = 16 };
        stack.Children.Add(StepHeading(
            "Choose a car",
            filter.CarClass is null
                ? string.Empty
                : GameCarClassCatalog.DisplayName(filter.Game, filter.CarClass)));
        var selectedClassRole = filter.ClassOptions
            .FirstOrDefault(option => string.Equals(option.Id, filter.CarClass, StringComparison.Ordinal))
            ?.VisualRole ?? GameCarClassVisualRole.Default;
        var fallbackAsset = selectedClassRole is GameCarClassVisualRole.Hypercar or GameCarClassVisualRole.Lmp2
            ? "car-generic-generated.png"
            : "car-generic-gt-generated.png";
        var tiles = new UniformGrid { Columns = 2 };
        foreach (var car in filter.CarModels)
        {
            var captured = car;
            tiles.Children.Add(ChoiceTile(
                car,
                string.Equals(filter.CarModel, car, StringComparison.Ordinal),
                "gauge",
                thumbnail: true,
                stretch: true,
                click: () =>
                {
                    filter.SelectCarModel(captured);
                    _pendingSession = null;
                    _rerender();
                },
                artworkHeight: 240,
                fallbackAsset: fallbackAsset));
        }

        stack.Children.Add(WizardScroller(SessionStep.Car, tiles, 360));
        return stack;
    }

    private ScrollViewer WizardScroller(
        SessionStep step,
        Control content,
        double? maxHeight = null,
        string? tag = null)
    {
        var savedOffset = _wizardScrollOffsets.GetValueOrDefault(step);
        var restoring = savedOffset != default;
        var scroller = new ScrollViewer
        {
            Tag = tag,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = content,
        };
        if (maxHeight is { } constrainedHeight)
        {
            scroller.MaxHeight = constrainedHeight;
        }
        scroller.ScrollChanged += (_, _) =>
        {
            if (!restoring)
            {
                _wizardScrollOffsets[step] = scroller.Offset;
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

    private static Button ChoiceTile(
        string label,
        bool selected,
        string icon,
        bool thumbnail,
        bool stretch,
        Action click,
        double artworkHeight = 160,
        string? fallbackAsset = null)
    {
        var content = new StackPanel { Spacing = 8 };
        var artwork = ThumbnailArtwork(label, thumbnail, selected, fallbackAsset);
        var artworkFrame = new Grid();
        artworkFrame.Children.Add(
            artwork ?? Icons.Create(icon, thumbnail ? 32 : 22, selected ? Graphite.AccentBrush : Graphite.Text2Brush));
        if (selected)
        {
            artworkFrame.Children.Add(SelectedIndicator());
        }

        content.Children.Add(new Border
        {
            Height = thumbnail ? artworkHeight : 48,
            Background = selected ? Graphite.AccentBgBrush : Graphite.Panel3Brush,
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            BorderBrush = selected ? Graphite.AccentBrush : Brushes.Transparent,
            BorderThickness = new Thickness(selected ? 2 : 0),
            ClipToBounds = true,
            Child = artworkFrame,
        });
        content.Children.Add(Graphite.TextBlock(label, 12, FontWeight.SemiBold, wrapping: TextWrapping.Wrap));

        var button = new Button
        {
            Content = content,
            Width = stretch ? double.NaN : thumbnail ? 400 : 212,
            MinHeight = thumbnail ? artworkHeight + 40 : 88,
            Margin = new Thickness(0, 0, 8, 8),
            Padding = new Thickness(0),
            HorizontalAlignment = stretch ? HorizontalAlignment.Stretch : HorizontalAlignment.Left,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            VerticalContentAlignment = VerticalAlignment.Stretch,
            Background = Brushes.Transparent,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
        };
        AutomationProperties.SetName(button, label);
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

    private static Control? ThumbnailArtwork(
        string label,
        bool requested,
        bool selected,
        string? fallbackAsset)
    {
        if (!requested)
        {
            return null;
        }

        if (TrackLayoutAssets.TryGetValue(label, out var layout))
        {
            return TrackLayout(layout, selected);
        }

        if (!ThumbnailAssets.TryGetValue(label, out var asset) && fallbackAsset is null)
        {
            return null;
        }

        asset ??= fallbackAsset!;

        if (!ThumbnailCache.TryGetValue(asset, out var bitmap))
        {
            using var stream = AssetLoader.Open(new Uri($"avares://Sprint.Desktop.Client/Assets/Analysis/{asset}"));
            bitmap = new Bitmap(stream);
            ThumbnailCache[asset] = bitmap;
        }

        return new Image
        {
            Tag = asset.StartsWith("car-", StringComparison.Ordinal) ? "analysis-car-image" : null,
            Source = bitmap,
            Stretch = asset.StartsWith("game-", StringComparison.Ordinal)
                ? Stretch.Uniform
                : Stretch.UniformToFill,
            Margin = asset.StartsWith("game-", StringComparison.Ordinal)
                ? new Thickness(24, 16)
                : new Thickness(0),
        };
    }

    private static Control TrackLayout(TrackLayoutAsset asset, bool selected)
    {
        if (!TrackLayoutCache.TryGetValue(asset.FileName, out var geometry))
        {
            using var stream = AssetLoader.Open(
                new Uri($"avares://Sprint.Desktop.Client/Assets/Analysis/{asset.FileName}"));
            var document = XDocument.Load(stream);
            var paths = document.Descendants()
                .Where(element => element.Name.LocalName == "path")
                .Where(element => !string.IsNullOrWhiteSpace((string?)element.Attribute("d")))
                .ToArray();
            var path = asset.PathId is null
                ? paths.MaxBy(element => ((string?)element.Attribute("d"))!.Length)
                : paths.Single(element => string.Equals(
                    (string?)element.Attribute("id"),
                    asset.PathId,
                    StringComparison.Ordinal));
            geometry = Geometry.Parse((string?)path?.Attribute("d")
                ?? throw new InvalidOperationException($"Track layout '{asset.FileName}' has no usable path."));
            TrackLayoutCache[asset.FileName] = geometry;
        }

        var brush = selected ? Graphite.AccentBrush : Graphite.Text2Brush;
        return new PathShape
        {
            Tag = "analysis-track-layout",
            Data = geometry,
            Fill = asset.Filled ? brush : null,
            Stroke = brush,
            StrokeThickness = asset.Filled ? 2.5 : 5,
            StrokeLineCap = PenLineCap.Round,
            StrokeJoin = PenLineJoin.Round,
            Stretch = Stretch.Uniform,
            Margin = new Thickness(24, 16),
        };
    }

    private static IReadOnlyDictionary<string, TrackLayoutAsset> CreateTrackLayoutAssets()
    {
        var layouts = new Dictionary<string, TrackLayoutAsset>(StringComparer.OrdinalIgnoreCase);
        AddAliases(layouts, new TrackLayoutAsset("track-daytona.svg", "path2463", Filled: true),
            "Daytona International Speedway Road Course", "Daytona International Speedway", "Daytona");
        AddAliases(layouts, new TrackLayoutAsset("track-barcelona.svg", "path3115"),
            "Circuit de Barcelona", "Circuit de Barcelona-Catalunya", "Barcelona");
        AddAliases(layouts, new TrackLayoutAsset("track-sebring.svg", "path4147"),
            "Sebring International Raceway", "Sebring");
        AddAliases(layouts, new TrackLayoutAsset("track-le-mans.svg"),
            "Circuit de la Sarthe", "Circuit des 24 Heures du Mans", "Le Mans");
        AddAliases(layouts, new TrackLayoutAsset("track-spa-francorchamps.svg", "path2840"),
            "Spa-Francorchamps");
        AddAliases(layouts, new TrackLayoutAsset("track-monza.svg", "path2182"),
            "Autodromo Nazionale Monza", "Monza");
        return layouts;
    }

    private static void AddAliases(
        IDictionary<string, TrackLayoutAsset> layouts,
        TrackLayoutAsset asset,
        params string[] aliases)
    {
        foreach (var alias in aliases)
        {
            layouts[alias] = asset;
        }
    }

    private Control SessionStepBody(LapCorpusFilter filter)
    {
        var stack = new StackPanel { Spacing = 10 };
        stack.Children.Add(StepHeading("Choose a session", $"{filter.Track} · {filter.CarModel}"));
        var sessions = new ScrollViewer
        {
            MaxHeight = 190,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Content = SessionList(filter),
        };
        stack.Children.Add(DayStep(filter, () =>
        {
            _pendingSession = null;
            sessions.Content = SessionList(filter);
            if (_sessionOpenButton is not null)
            {
                _sessionOpenButton.IsEnabled = false;
            }
        }));
        stack.Children.Add(sessions);
        return stack;
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

    /// <summary>An inclusive, optionally open-ended session date range.</summary>
    private Control DayStep(LapCorpusFilter filter, Action rangeChanged)
    {
        var range = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,*"),
            ColumnSpacing = 12,
        };
        var from = new DatePicker
        {
            Tag = "analysis-date-from",
            SelectedDate = PickerDate(filter.DateFrom),
        };
        var to = new DatePicker
        {
            Tag = "analysis-date-to",
            SelectedDate = PickerDate(filter.DateTo),
        };
        var synchronizingRange = false;
        from.SelectedDateChanged += (_, _) =>
        {
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
        to.SelectedDateChanged += (_, _) =>
        {
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

        range.Children.Add(Graphite.FormField("From", from));
        var toField = Graphite.FormField("To", to);
        Grid.SetColumn(toField, 1);
        range.Children.Add(toField);
        return range;
    }

    private static DateTimeOffset? PickerDate(DateOnly? date) => date is { } value
        ? new DateTimeOffset(value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero)
        : null;

    private static DateOnly? DateOnlyValue(DateTimeOffset? date) => date is { } value
        ? DateOnly.FromDateTime(value.DateTime)
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
        var title = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        title.Children.Add(Graphite.TextBlock(lap.Label, 12.5, FontWeight.SemiBold));
        if (isPrimary)
        {
            title.Children.Add(Graphite.StatusPill("A", Graphite.AccentBrush));
        }

        if (isComparison)
        {
            title.Children.Add(Graphite.StatusPill("B", Graphite.BlueBrush));
        }

        if (isHudTarget)
        {
            title.Children.Add(Graphite.StatusPill("HUD", Graphite.GreenBrush));
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
