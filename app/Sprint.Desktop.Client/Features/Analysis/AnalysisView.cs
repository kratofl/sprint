using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Sharing;

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
    private readonly AnalysisController _controller;
    private readonly LapSharingService _sharing;
    private readonly CloudLapSharing _cloud;
    private readonly Action _signIn;
    private readonly Func<LiveCompareTarget?, bool> _setCompareTarget;
    private readonly Action _toggleHud;
    private readonly Action _rerender;
    private readonly Action<string, string, string, Action> _confirm;

    private CorpusLap? _hudTarget;
    private string? _sharingNotice;

    public AnalysisView(
        AnalysisController controller,
        LapSharingService sharing,
        CloudLapSharing cloud,
        Func<LiveCompareTarget?, bool> setCompareTarget,
        Action toggleHud,
        Action rerender,
        Action<string, string, string, Action> confirm,
        Action signIn)
    {
        _controller = controller ?? throw new ArgumentNullException(nameof(controller));
        _sharing = sharing ?? throw new ArgumentNullException(nameof(sharing));
        _cloud = cloud ?? throw new ArgumentNullException(nameof(cloud));
        _signIn = signIn ?? throw new ArgumentNullException(nameof(signIn));
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
        var root = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("300,*"),
            Margin = new Thickness(16, 10, 16, 20),
        };

        var left = Sidebar(state);
        Grid.SetColumn(left, 0);
        root.Children.Add(left);

        var right = Surface(state);
        right.Margin = new Thickness(16, 0, 0, 0);
        Grid.SetColumn(right, 1);
        root.Children.Add(right);

        return root;
    }

    private Control Sidebar(AnalysisState state)
    {
        var stack = new StackPanel { Spacing = 12 };

        stack.Children.Add(Graphite.IconSectionLabel("route", "Car and track"));
        stack.Children.Add(ContextList(state));

        if (state.Context is not null)
        {
            stack.Children.Add(Graphite.IconSectionLabel("clock", "Laps"));
            // A list, not a dropdown: the corpus is unbounded, and a driver with real mileage
            // cannot scan hundreds of laps through a six-row popup.
            stack.Children.Add(new ScrollViewer
            {
                MaxHeight = 420,
                Content = LapList(state),
            });
        }

        stack.Children.Add(Graphite.IconSectionLabel("user", "Sprint cloud"));
        stack.Children.Add(CloudPanel(state));

        return new ScrollViewer { Content = stack };
    }

    /// <summary>
    /// Sharing by code. Compact on purpose: the page's job is comparing laps, and the cloud is
    /// how one more lap gets here.
    /// </summary>
    private Control CloudPanel(AnalysisState state)
    {
        var panel = new StackPanel { Spacing = 8 };

        if (!_cloud.IsSignedIn)
        {
            panel.Children.Add(Graphite.TextBlock(
                "Sign in to share a lap by code, or to pull somebody else's.",
                11.5,
                brush: Graphite.Text3Brush,
                wrapping: TextWrapping.Wrap));

            var signIn = Graphite.Button("Sign in", ButtonTone.Ghost, "user");
            signIn.HorizontalAlignment = HorizontalAlignment.Stretch;
            signIn.Click += (_, _) => _signIn();
            panel.Children.Add(signIn);
            return panel;
        }

        var identity = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var who = Graphite.TextBlock(_cloud.Identity, 11.5, brush: Graphite.Text2Brush);
        Grid.SetColumn(who, 0);
        identity.Children.Add(who);
        var signOut = Graphite.Button("Sign out", ButtonTone.Ghost);
        signOut.FontSize = 11;
        signOut.Padding = new Thickness(8, 3);
        signOut.Click += (_, _) =>
        {
            _cloud.SignOut();
            _sharingNotice = "Signed out of Sprint cloud.";
            _rerender();
        };
        Grid.SetColumn(signOut, 1);
        identity.Children.Add(signOut);
        panel.Children.Add(identity);

        if (state.Primary is { HasChannels: true } shareable)
        {
            var share = Graphite.Button($"Share lap {shareable.LapNumber}", ButtonTone.Ghost, "upload");
            share.HorizontalAlignment = HorizontalAlignment.Stretch;
            // Consent is per lap and says what leaves the machine — the corpus stays local.
            share.Click += (_, _) => _confirm(
                "Upload this lap?",
                $"{shareable.Label} at {shareable.Context.TrackCourse} will be uploaded and given a "
                + "share code. Anyone holding the code can pull it until you revoke it.\n\n"
                + "Nothing else from your corpus leaves this machine.",
                "Upload and get a code",
                () => RunCloud(() => _cloud.ShareAsync(shareable)));
            panel.Children.Add(share);
        }

        var code = new TextBox
        {
            PlaceholderText = "Paste a share code",
            FontFamily = Graphite.FontStack,
            FontSize = 12,
        };
        panel.Children.Add(code);

        var fetch = Graphite.Button("Fetch lap", ButtonTone.Ghost, "download");
        fetch.HorizontalAlignment = HorizontalAlignment.Stretch;
        fetch.Click += (_, _) => FetchByCode(code.Text ?? "");
        panel.Children.Add(fetch);

        return panel;
    }

    private Control ContextList(AnalysisState state)
    {
        if (state.Contexts.Count == 0)
        {
            return Graphite.TextBlock(
                "Nothing recorded yet.",
                12,
                brush: Graphite.Text3Brush,
                wrapping: TextWrapping.Wrap);
        }

        var list = new StackPanel { Spacing = 4 };
        foreach (var context in state.Contexts)
        {
            var selected = state.Context is not null
                && context.TrackCourse == state.Context.TrackCourse
                && context.CarModel == state.Context.CarModel
                && context.Game == state.Context.Game;

            var button = Graphite.Button($"{context.TrackCourse} · {context.CarModel}", ButtonTone.Ghost);
            button.HorizontalAlignment = HorizontalAlignment.Stretch;
            button.HorizontalContentAlignment = HorizontalAlignment.Left;
            button.Background = selected ? Graphite.Panel3Brush : Brushes.Transparent;
            button.Foreground = selected ? Graphite.TextBrush : Graphite.Text2Brush;
            button.Click += (_, _) =>
            {
                _controller.SelectContext(context);
                _rerender();
            };
            list.Children.Add(button);
        }

        return list;
    }

    private Control LapList(AnalysisState state)
    {
        var list = new StackPanel { Spacing = 4 };
        foreach (var lap in state.Laps)
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
            Background = isPrimary || isComparison ? Graphite.Panel2Brush : Brushes.Transparent,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            Padding = new Thickness(10, 7),
            Child = row,
        };
    }

    private Control Surface(AnalysisState state)
    {
        var stack = new StackPanel { Spacing = 12 };

        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var heading = new StackPanel { Spacing = 2 };
        heading.Children.Add(Graphite.TextBlock("Analysis", 18, FontWeight.SemiBold));
        heading.Children.Add(Graphite.TextBlock(
            state.Context is null
                ? "Compare any two laps."
                : $"{state.Context.TrackCourse} · {state.Context.CarModel}",
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

        var import = Graphite.Button("Import lap", ButtonTone.Ghost, "download");
        import.Click += (_, _) => ImportLap(import);
        actions.Children.Add(import);

        if (state.Primary is { HasChannels: true } exportable)
        {
            var export = Graphite.Button("Export lap A", ButtonTone.Ghost, "upload");
            export.Click += (_, _) => ExportLap(export, exportable);
            actions.Children.Add(export);
        }

        // The one ember action on the page: everything else here is a way of choosing what the
        // overlay will show.
        var hud = Graphite.Button("Live Compare overlay", ButtonTone.Primary, "layout-dashboard");
        hud.Click += (_, _) => _toggleHud();
        actions.Children.Add(hud);
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

        if (state.Stack is null)
        {
            // One statement, where the eye already is. A notice bar repeating the empty panel's
            // message is the same fact said twice, and the second one teaches people to skip
            // both.
            stack.Children.Add(EmptySurface(state.Notice ?? "Pick a lap to draw."));
            return stack;
        }

        if (state.Notice is { Length: > 0 } notice)
        {
            stack.Children.Add(Note(notice, Graphite.Text2Brush));
        }

        stack.Children.Add(new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Padding = new Thickness(4),
            Height = 560,
            Child = new ChartStackView(state.Stack),
        });

        return stack;
    }

    private static Control EmptySurface(string message) => new Border
    {
        Background = Graphite.Panel2Brush,
        BorderBrush = Graphite.LineBrush,
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(Graphite.RadiusLg),
        Height = 560,
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

    /// <summary>Runs a cloud call and shows whatever it has to say. Never throws at the page.</summary>
    private async void RunCloud(Func<Task<string>> call)
    {
        try
        {
            _sharingNotice = await call();
        }
        catch (Exception ex)
        {
            _sharingNotice = $"Sprint cloud call failed: {ex.Message}";
        }

        _rerender();
    }

    private async void FetchByCode(string code)
    {
        SharedLapOffer offer;
        try
        {
            offer = await _cloud.OfferAsync(code);
        }
        catch (Exception ex)
        {
            _sharingNotice = $"Could not fetch that lap: {ex.Message}";
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
                _sharingNotice = _cloud.Accept(lap);
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
