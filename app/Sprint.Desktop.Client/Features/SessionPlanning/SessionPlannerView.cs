using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>What the page needs from the shell: the modal, the confirm dialog, and a repaint.</summary>
internal sealed record SessionPlannerViewCallbacks(
    Action OpenCreateDialog,
    /// <summary>title, message, confirm label, confirm tone (destructive asks wear Danger), action.</summary>
    Action<string, string, string, ButtonTone, Action> Confirm,
    Action OpenQuickPlanDialog,
    Action ImportArchivedSessions,
    /// <summary>Opens the planner's own defaults sheet — feature settings live on their
    /// slice, not on the global Settings page.</summary>
    Action OpenPlannerSettings,
    /// <summary>
    /// Whether the current game archives results Sprint can read (#180). False hides the
    /// import action outright: an action whose only possible answer is "this game cannot"
    /// should not be offered.
    /// </summary>
    bool CanImportResults);

/// <summary>
/// The Session Planner page (#100). A thin renderer over
/// <see cref="SessionPlannerController"/>: the Qualifying/Race segmented control at the top
/// of the page, the active-plan card with its tracking controls, and plan history. All
/// behaviour lives in the controller, which is unit-tested; this class only paints it.
/// </summary>
internal sealed class SessionPlannerView
{
    /// <summary>Tags the plan-in-view card so tests can assert on it without matching the header.</summary>
    internal const string PlanCardTag = "planner-plan-card";

    /// <summary>Tags every collapsed plan row's thumbnail on the overview.</summary>
    internal const string PlanThumbnailTag = "planner-plan-thumb";

    /// <summary>Tags the (scope, statistic) target selector (#186).</summary>
    internal const string TargetSectionTag = "planner-target-section";

    /// <summary>Tags the scrollable specific-lap selection list inside the target section.</summary>
    internal const string SpecificLapListTag = "planner-specific-lap-list";

    private readonly SessionPlannerController _controller;
    private readonly SessionPlannerViewCallbacks _callbacks;

    public SessionPlannerView(SessionPlannerController controller, SessionPlannerViewCallbacks callbacks)
    {
        _controller = controller;
        _callbacks = callbacks;
    }

    public Control Build()
    {
        // Matches the shell's PageStack: tight to the chrome, no wide gutter.
        var stack = new StackPanel { Spacing = 16, Margin = new Thickness(16, 10, 16, 20) };

        // No caption line: the titlebar already names the page, and a sentence repeating it
        // is noise. The header row is the page's actions, right-aligned like every page.
        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), MinHeight = 32 };
        // Two entry points, not a mode switch: Quick plan is the ember primary because it is
        // the one used under time pressure, with the full sheet one click away beside it.
        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center,
        };
        // The permanent manual import entry point (#185): the startup offer can be declined,
        // and a driver who changes their mind needs somewhere to go. Absent entirely for a game
        // that archives nothing Sprint can read.
        // The planner's own defaults (#103) live here behind the gear, not on the global
        // Settings page — feature settings belong to their slice.
        actions.Children.Add(Graphite.IconButton("settings", "Planner settings", _callbacks.OpenPlannerSettings));
        if (_callbacks.CanImportResults)
        {
            actions.Children.Add(ActionButton("Import results", ButtonTone.Ghost, _callbacks.ImportArchivedSessions, "download"));
        }
        actions.Children.Add(ActionButton("New plan", ButtonTone.Neutral, _callbacks.OpenCreateDialog, "plus"));
        actions.Children.Add(ActionButton("Quick plan", ButtonTone.Primary, _callbacks.OpenQuickPlanDialog, "bolt"));
        Grid.SetColumn(actions, 1);
        header.Children.Add(actions);
        stack.Children.Add(header);

        if (!_controller.HasPlans)
        {
            stack.Children.Add(Graphite.StatePanel(
                "No session plans yet",
                "Create a plan before qualifying or joining a server. Sprint prefills the game, car, and track it last saw.",
                Graphite.Text3Brush));
            return Scroll(stack);
        }

        // The page lands on the shelf: what is still ahead, and what has run. A plan opens
        // only on an explicit click, and the way back is always the first thing on the card.
        if (_controller.PlanInView is { } plan)
        {
            stack.Children.Add(BackToOverviewRow());
            // The segmented control scopes the opened plan to one segment. It drives local
            // controller state only — never shell navigation.
            stack.Children.Add(SegmentTabs());
            stack.Children.Add(PlanCard(plan));
        }
        else
        {
            stack.Children.Add(OverviewSection(
                "Open plans",
                _controller.OpenPlans,
                "Nothing planned right now. Create a plan before qualifying or joining a server."));
            if (_controller.CompletedPlans.Count > 0)
            {
                stack.Children.Add(OverviewSection("Completed", _controller.CompletedPlans, ""));
            }
        }

        return Scroll(stack);
    }

    private Control BackToOverviewRow()
    {
        var back = ActionButton("All plans", ButtonTone.Ghost, _controller.ClosePlan, "chevron-left");
        back.HorizontalAlignment = HorizontalAlignment.Left;
        return back;
    }

    private Control SegmentTabs()
    {
        var tabs = Graphite.Segmented(
            [_controller.QualifyingTabLabel, "Race"],
            _controller.SelectedTab == PlannerSegmentTab.Qualifying ? 0 : 1,
            index => _controller.SelectTab(index == 0 ? PlannerSegmentTab.Qualifying : PlannerSegmentTab.Race));

        if (!_controller.QualifyingTabEnabled)
        {
            // Qualifying stays present but unselectable — segments are not removed dynamically.
            ToolTip.SetTip(tabs, "This plan skips qualifying.");
        }

        return tabs;
    }

    private Control PlanCard(SessionPlan plan)
    {
        var body = new StackPanel { Spacing = 12 };

        var titleRow = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var title = Graphite.TextBlock(plan.Name, 17, FontWeight.Medium, Graphite.TextBrush);
        Grid.SetColumn(title, 0);
        titleRow.Children.Add(title);
        var badges = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            VerticalAlignment = VerticalAlignment.Center,
        };

        // A quick plan's inputs carry lower confidence by construction, so say so on the card
        // itself — the mode has to outlive the modal. Planned is the norm and stays unlabelled.
        if (plan.Mode == PlanMode.Quick)
        {
            badges.Children.Add(Graphite.Chip("Quick plan", Graphite.Text2Brush));
        }

        badges.Children.Add(Graphite.StatusPill(plan.Status.ToString().ToUpperInvariant(), StatusBrush(plan.Status)));
        Grid.SetColumn(badges, 1);
        titleRow.Children.Add(badges);
        body.Children.Add(titleRow);

        body.Children.Add(Graphite.TextBlock(
            ContextLine(plan),
            12,
            FontWeight.Normal,
            Graphite.Text2Brush,
            TextWrapping.Wrap));
        body.Children.Add(Graphite.TextBlock(
            SummaryLine(plan),
            12,
            FontWeight.Normal,
            Graphite.Text3Brush,
            TextWrapping.Wrap));

        if (_controller.RaceFormatWarning is { } warning)
        {
            body.Children.Add(Graphite.Alert(
                GraphiteIntent.Danger,
                "Race format mismatch",
                warning,
                "alert-triangle"));
        }

        body.Children.Add(SegmentDetail(plan));
        body.Children.Add(TargetSection(SelectedKind()));
        body.Children.Add(TrackingControls(plan));
        var card = Graphite.Card(body, new Thickness(18, 16));
        card.Tag = PlanCardTag;
        return card;
    }

    private SegmentKind SelectedKind() =>
        _controller.SelectedTab == PlannerSegmentTab.Qualifying
            ? SegmentKind.Qualifying
            : SegmentKind.Race;

    // The target selector (#186). Targets belong to the segment kind the page is scoped to, so
    // the block follows the segmented control's selection rather than offering both at once.
    private Control TargetSection(SegmentKind kind)
    {
        var choices = _controller.TargetChoices();
        var target = _controller.TargetFor(kind);

        var panel = new StackPanel { Spacing = 8 };

        // The clear action lives beside the section label: it acts on the whole target, not
        // on any one row, and it only exists while there is something to clear.
        var head = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        head.Children.Add(IconSectionLabel("target", $"{kind} lap-time target"));
        if (target is not null)
        {
            var clear = ActionButton("Clear target", ButtonTone.Ghost, () => _controller.ClearTarget(kind));
            Grid.SetColumn(clear, 1);
            head.Children.Add(clear);
        }

        panel.Children.Add(head);
        panel.Children.Add(Graphite.TextBlock(
            target is null
                ? "No target set — the dash gets no lap target for this segment."
                : PlanTargetResolver.Describe(target),
            12,
            FontWeight.Normal,
            target is null ? Graphite.Text3Brush : Graphite.TextBrush,
            TextWrapping.Wrap));

        if (choices.IsEmpty)
        {
            // A lap time is something a car did, not a number typed at a desk: with nothing
            // recorded for this context, the section says how to earn one instead of offering
            // a free-text field.
            panel.Children.Add(Graphite.TextBlock(
                PlanTargetChoices.NoHistoryMessage,
                12,
                FontWeight.Normal,
                Graphite.Text3Brush,
                TextWrapping.Wrap));
        }
        else
        {
            panel.Children.Add(ScopeRow(choices));
            if (_controller.SelectedTargetScope(choices) is { } scope)
            {
                panel.Children.Add(StatisticRow(kind, scope, target));
                if (SpecificActive(scope, target))
                {
                    panel.Children.Add(SpecificLapList(kind, scope, target));
                }
            }
        }

        if (_controller.TargetsApplyFromNextLap)
        {
            // Targets latch at the start/finish line (#189), so an edit made mid-session does
            // nothing to the lap being driven. Saying it here is what keeps the driver from
            // reading the current lap's delta against a target it never had.
            panel.Children.Add(Graphite.TextBlock(
                "Applies from the next lap — the lap in progress keeps the target it started with.",
                12,
                FontWeight.Normal,
                Graphite.Text3Brush,
                TextWrapping.Wrap));
        }

        return new Border
        {
            // Panel3 on the card's Panel2: the selector is a distinct surface inside the plan
            // card, per the Graphite surface stack.
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusControl),
            Padding = new Thickness(14, 12),
            Child = panel,
            Tag = TargetSectionTag,
        };
    }

    private Control ScopeRow(PlanTargetChoices choices)
    {
        var labels = choices.Scopes.Select(scope => scope.Label).ToArray();
        var selected = _controller.SelectedTargetScope(choices);
        var combo = Graphite.ComboBox(labels, selected?.Label, 280, "Pick a scope");
        combo.SelectionChanged += (_, _) =>
        {
            if (combo.SelectedIndex < 0 || combo.SelectedIndex >= choices.Scopes.Count)
            {
                return;
            }

            var scope = choices.Scopes[combo.SelectedIndex];
            // Selecting the scope already shown would repaint the page for nothing, and the
            // repaint is what re-seeds this combo in the first place.
            if (selected is not null && SameScope(scope, selected))
            {
                return;
            }

            _controller.SelectTargetScope(scope.Scope, scope.ProgramType);
        };

        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        row.Children.Add(combo);
        row.Children.Add(Graphite.Chip(
            $"{selected?.SampleSize ?? 0} {(selected?.SampleSize == 1 ? "lap" : "laps")}",
            Graphite.Text3Brush));
        return LabelledRow("Scope", row);
    }

    // Whether the specific-lap list is showing: either the stored target already is a specific
    // lap of this scope, or the driver just picked "Specific" and is still choosing.
    private bool SpecificActive(PlanTargetScopeGroup scope, PlanTarget? target) =>
        _controller.SpecificLapPickerOpen
        || (target is not null && SameScope(target, scope) && target.Statistic == PlanTargetStatistic.Custom);

    private Control StatisticRow(SegmentKind kind, PlanTargetScopeGroup scope, PlanTarget? target)
    {
        // Every statistic carries its resolved time, so the driver chooses a pace rather than
        // a word. "Specific" resolves to nothing yet — it opens the lap list below instead.
        var labels = scope.Options
            .Select(option => $"{option.Label} · {option.TimeText}")
            .Append("Specific")
            .ToArray();
        var selected = SpecificActive(scope, target)
            ? labels.Length - 1
            : target is null || !SameScope(target, scope)
                ? -1
                : scope.Options.ToList().FindIndex(option => option.Statistic == target.Statistic);

        return LabelledRow(
            "Aim at",
            Graphite.Segmented(labels, selected, index =>
            {
                if (index == labels.Length - 1)
                {
                    _controller.OpenSpecificLapPicker();
                }
                else
                {
                    _controller.SetTarget(kind, scope.Options[index]);
                }
            }));
    }

    // The corpus can hold hundreds of laps for a context, so the specific pick is a list that
    // scrolls in place — never a dropdown that grows past the screen. Laps come fastest to
    // slowest, so the ordering is each row's context.
    private Control SpecificLapList(SegmentKind kind, PlanTargetScopeGroup scope, PlanTarget? target)
    {
        var picked = target is not null
            && SameScope(target, scope)
            && target.Statistic == PlanTargetStatistic.Custom
                ? scope.Laps.FirstOrDefault(lap =>
                    lap.LapSessionId == target.LapSessionId && lap.LapNumber == target.LapNumber)
                : null;

        var rows = new StackPanel { Spacing = 2 };
        foreach (var lap in scope.Laps)
        {
            var isPicked = ReferenceEquals(lap, picked);
            rows.Children.Add(LapChoiceRow(lap, isPicked, () =>
            {
                if (!isPicked)
                {
                    _controller.SetTarget(kind, lap);
                }
            }));
        }

        var list = new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusControl),
            Padding = new Thickness(4),
            MinWidth = 360,
            Child = new ScrollViewer
            {
                MaxHeight = 200,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Content = rows,
            },
            Tag = SpecificLapListTag,
        };

        return LabelledRow("Specific lap", list);
    }

    // One selectable lap: an ember indicator for the picked row, the time as the strongest
    // text, the lap identity beside it, and the tier note on the right because it varies lap
    // by lap in a corpus that mixes recorded and imported sessions.
    private static Button LapChoiceRow(PlanTargetOption lap, bool picked, Action choose)
    {
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto,*,Auto"),
            ColumnSpacing = 10,
        };

        var indicator = new Avalonia.Controls.Shapes.Ellipse
        {
            Width = 8,
            Height = 8,
            Fill = picked ? Graphite.AccentBrush : null,
            Stroke = picked ? Graphite.AccentBrush : Graphite.Line2Brush,
            StrokeThickness = 1.5,
            VerticalAlignment = VerticalAlignment.Center,
        };
        grid.Children.Add(indicator);

        var time = Graphite.TextBlock(lap.TimeText, 13, FontWeight.Medium, Graphite.TextBrush);
        time.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(time, 1);
        grid.Children.Add(time);

        var label = Graphite.TextBlock(lap.Label, 12, FontWeight.Normal, Graphite.Text2Brush);
        label.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(label, 2);
        grid.Children.Add(label);

        var tier = Graphite.TextBlock(lap.TierNote, 11, FontWeight.Normal, Graphite.Text3Brush);
        tier.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(tier, 3);
        grid.Children.Add(tier);

        var row = new Button
        {
            Content = grid,
            Background = picked ? Graphite.Panel3Brush : Brushes.Transparent,
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(Graphite.RadiusControl),
            Padding = new Thickness(10, 6),
            HorizontalAlignment = HorizontalAlignment.Stretch,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
        };
        row.Click += (_, _) => choose();
        return row;
    }

    private static bool SameScope(PlanTarget target, PlanTargetScopeGroup scope) =>
        target.Scope == scope.Scope
        && string.Equals(target.ProgramType, scope.ProgramType, StringComparison.Ordinal);

    private static bool SameScope(PlanTargetScopeGroup left, PlanTargetScopeGroup right) =>
        left.Scope == right.Scope
        && string.Equals(left.ProgramType, right.ProgramType, StringComparison.Ordinal);

    private static Control IconSectionLabel(string icon, string text) =>
        Graphite.IconSectionLabel(icon, text);

    private static Control LabelledRow(string label, Control content)
        => Graphite.FormField(label, content);

    private Control SegmentDetail(SessionPlan plan)
    {
        var kind = SelectedKind();
        var segment = plan.Segments.LastOrDefault(entry => entry.Kind == kind);

        var rows = new StackPanel { Spacing = 6 };
        if (kind == SegmentKind.Race)
        {
            rows.Children.Add(DetailRow("Planned", PlannedRaceText(plan)));
            rows.Children.Add(DetailRow(
                "Detected",
                segment?.DetectedRaceFormat is { } detected && detected != RaceLengthFormat.Unknown
                    ? $"{detected} (live)"
                    : "—"));
        }
        else if (!plan.QualifyingIncluded)
        {
            rows.Children.Add(DetailRow("Qualifying", "Skipped for this plan"));
        }

        rows.Children.Add(DetailRow("Live session", string.IsNullOrEmpty(segment?.LiveSessionType) ? "—" : segment!.LiveSessionType));
        rows.Children.Add(DetailRow("Laps", LapsText(segment)));
        return rows;
    }

    private Control TrackingControls(SessionPlan plan)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };

        switch (plan.Status)
        {
            case PlanStatus.Tracking:
                // Manual stop is always available while tracking.
                row.Children.Add(ActionButton("Stop tracking", ButtonTone.Danger, () => _controller.Stop(plan.Id), "player-stop"));
                break;

            case PlanStatus.Armed:
                AddStartButtons(row, plan);
                row.Children.Add(ActionButton("Disarm", ButtonTone.Ghost, () => _controller.Disarm(plan.Id)));
                break;

            default:
                AddActivationControls(row, plan);
                break;
        }

        if (plan.Status == PlanStatus.Armed)
        {
            var waiting = new StackPanel { Spacing = 6 };
            waiting.Children.Add(Graphite.TextBlock(
                plan.QualifyingIncluded
                    ? "Armed — waiting for telemetry to report qualifying or race."
                    : "Armed — waiting for telemetry to report race.",
                12,
                FontWeight.Normal,
                Graphite.Text3Brush,
                TextWrapping.Wrap));
            waiting.Children.Add(row);
            return waiting;
        }

        if (plan.Status is PlanStatus.Completed or PlanStatus.Abandoned)
        {
            var closed = new StackPanel { Spacing = 6 };
            closed.Children.Add(Graphite.TextBlock(
                $"This plan is {plan.Status.ToString().ToLowerInvariant()} and is kept in history.",
                12,
                FontWeight.Normal,
                Graphite.Text3Brush,
                TextWrapping.Wrap));
            closed.Children.Add(row);
            return closed;
        }

        return row;
    }

    // A plan that does not hold the slot: either it can claim it, or the reason it cannot is
    // stated inline next to the disabled action, with an explicit takeover behind a confirm.
    private void AddActivationControls(StackPanel row, SessionPlan plan)
    {
        var activation = _controller.CanActivate(plan.Id);
        if (activation.CanActivate)
        {
            AddStartButtons(row, plan);
            row.Children.Add(ActionButton("Arm auto-start", ButtonTone.Neutral, () => _controller.Arm(plan.Id)));
            return;
        }

        var blocked = Graphite.Button("Arm auto-start", ButtonTone.Neutral);
        blocked.IsEnabled = false;
        row.Children.Add(blocked);
        row.Children.Add(Graphite.Chip(activation.Reason, Graphite.Text3Brush));
        row.Children.Add(ActionButton("Make this the active plan", ButtonTone.Ghost, () => _callbacks.Confirm(
            "Make this the active plan?",
            $"{activation.Reason}. Sprint allows one active plan, so it will be released first.",
            "Make active",
            ButtonTone.Primary,
            () => _controller.TakeOver(plan.Id))));
    }

    // Exactly one primary start action: the next step the plan would naturally run. Starting
    // the race while a planned qualifying has not run is a skip, so it sits behind a confirm
    // instead of being one stray click away. A plan without qualifying is never offered one.
    private void AddStartButtons(StackPanel row, SessionPlan plan)
    {
        if (_controller.NextSegment(plan) == SegmentKind.Qualifying)
        {
            row.Children.Add(ActionButton("Start Qualifying now", ButtonTone.Primary,
                () => _controller.StartNow(plan.Id, SegmentKind.Qualifying), "player-play"));
            row.Children.Add(ActionButton("Start Race now", ButtonTone.Neutral, () => _callbacks.Confirm(
                "Start the race without qualifying?",
                "Qualifying is planned but has not run. Starting the race now skips it for this plan.",
                "Skip qualifying and start race",
                ButtonTone.Primary,
                () => _controller.StartNow(plan.Id, SegmentKind.Race))));
            return;
        }

        row.Children.Add(ActionButton("Start Race now", ButtonTone.Primary,
            () => _controller.StartNow(plan.Id, SegmentKind.Race), "player-play"));
    }

    // One overview section: a labelled shelf of collapsed plan rows. Completed plans use the
    // same row as open ones — the status pill and the thumbnail already tell them apart.
    private Control OverviewSection(string label, IReadOnlyList<SessionPlan> plans, string emptyText)
    {
        var panel = new StackPanel { Spacing = 10 };
        panel.Children.Add(IconSectionLabel(label == "Completed" ? "circle-check" : "flag", label));

        if (plans.Count == 0)
        {
            panel.Children.Add(Graphite.TextBlock(emptyText, 12, FontWeight.Normal, Graphite.Text3Brush, TextWrapping.Wrap));
            return panel;
        }

        foreach (var plan in plans)
        {
            panel.Children.Add(CollapsedPlanRow(plan));
        }

        return panel;
    }

    private Control CollapsedPlanRow(SessionPlan plan)
    {
        var row = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto,Auto"),
            ColumnSpacing = 12,
        };

        var thumb = PlanThumbnail(plan);
        Grid.SetColumn(thumb, 0);
        row.Children.Add(thumb);

        var text = new StackPanel { Spacing = 3, VerticalAlignment = VerticalAlignment.Center };
        var titleRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        titleRow.Children.Add(Graphite.TextBlock(plan.Name, 13, FontWeight.Medium, Graphite.TextBrush));
        if (plan.Mode == PlanMode.Quick)
        {
            titleRow.Children.Add(Graphite.Chip("Quick plan", Graphite.Text2Brush));
        }

        text.Children.Add(titleRow);
        text.Children.Add(Graphite.TextBlock(ContextLine(plan), 11, FontWeight.Normal, Graphite.Text3Brush));
        text.Children.Add(Graphite.TextBlock(SummaryLine(plan), 11, FontWeight.Normal, Graphite.Text3Brush));
        Grid.SetColumn(text, 1);
        row.Children.Add(text);

        var status = Graphite.StatusPill(plan.Status.ToString().ToUpperInvariant(), StatusBrush(plan.Status));
        status.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(status, 2);
        row.Children.Add(status);

        var open = ActionButton("Open", ButtonTone.Ghost, () => _controller.SelectPlan(plan.Id), "chevron-right");
        open.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(open, 3);
        row.Children.Add(open);

        // Deleting is possible from the shelf for every plan, open or completed — behind a
        // destructive confirm, because a plan is the driver's own record of a weekend.
        var delete = Graphite.IconButton("trash", "Delete plan", () => _callbacks.Confirm(
            "Delete this plan?",
            $"\"{plan.Name}\" and its recorded segments are removed. Recorded laps stay in the lap history — they belong to the corpus, not the plan.",
            "Delete plan",
            ButtonTone.Danger,
            () => _controller.DeletePlan(plan.Id)));
        delete.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(delete, 4);
        row.Children.Add(delete);

        return Graphite.Card(row, new Thickness(14, 12));
    }

    /// <summary>
    /// A collapsed plan's preview: the recorded lap times as a bar strip, oldest to newest,
    /// anchored to a shared baseline. One series, so it wears the informational blue and
    /// needs no legend — the card text beside it is the identity. A plan with no laps shows
    /// the route glyph instead of an empty plot that would read as "all laps were zero".
    /// </summary>
    // Internal because Home's launchpad tiles reuse the exact same preview — two renderings
    // of "this plan" must not drift apart.
    internal static Control PlanThumbnail(SessionPlan plan)
    {
        const double plotWidth = 60;
        const double plotHeight = 32;

        var laps = plan.Segments
            .SelectMany(segment => segment.Laps)
            .Select(lap => lap.LapTimeSeconds)
            .Where(seconds => seconds > 0)
            .TakeLast(20)
            .ToArray();

        Control content;
        if (laps.Length == 0)
        {
            content = Icons.Create("route", 20, Graphite.Text3Brush);
        }
        else
        {
            var canvas = new Canvas { Width = plotWidth, Height = plotHeight };
            var min = laps.Min();
            var max = laps.Max();
            var gap = laps.Length > 12 ? 1.0 : 2.0;
            var barWidth = Math.Max(2.0, (plotWidth - gap * (laps.Length - 1)) / laps.Length);
            for (var i = 0; i < laps.Length; i++)
            {
                // Slower laps draw taller. A flat session still shows bars rather than a
                // baseline pretending nothing happened.
                var normalized = max > min ? (laps[i] - min) / (max - min) : 0.5;
                var height = 8 + normalized * (plotHeight - 8);
                var bar = new Avalonia.Controls.Shapes.Rectangle
                {
                    Width = barWidth,
                    Height = height,
                    RadiusX = 1,
                    RadiusY = 1,
                    Fill = Graphite.BlueBrush,
                };
                Canvas.SetLeft(bar, i * (barWidth + gap));
                Canvas.SetTop(bar, plotHeight - height);
                canvas.Children.Add(bar);
            }

            content = canvas;
        }

        content.HorizontalAlignment = HorizontalAlignment.Center;
        content.VerticalAlignment = VerticalAlignment.Center;
        return new Border
        {
            Width = 72,
            Height = 44,
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusControl),
            Child = content,
            Tag = PlanThumbnailTag,
            VerticalAlignment = VerticalAlignment.Center,
        };
    }

    private static string ContextLine(SessionPlan plan)
    {
        var parts = new[] { plan.Game, plan.Car, plan.Track }
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .ToArray();
        return parts.Length == 0 ? "No game, car, or track recorded" : string.Join(" · ", parts);
    }

    private static string SummaryLine(SessionPlan plan)
    {
        var qualifying = plan.QualifyingIncluded ? "qualifying included" : "qualifying skipped";
        var reserve = $"reserve +{plan.FuelReserveLaps} lap{(plan.FuelReserveLaps == 1 ? "" : "s")}";
        return $"{PlannedRaceText(plan)} · {qualifying} · {reserve}";
    }

    private static string PlannedRaceText(SessionPlan plan) => plan.RaceLengthFormat switch
    {
        RaceLengthFormat.TimeBased => $"Race {plan.RaceLengthValue:0.##} min",
        RaceLengthFormat.LapBased => $"Race {plan.RaceLengthValue:0.##} laps",
        _ => "Race length not set",
    };

    private static string LapsText(PlanSegment? segment)
    {
        if (segment is null || segment.Laps.Count == 0)
        {
            return "None recorded";
        }

        var last = segment.Laps[^1];
        return $"{segment.Laps.Count} recorded · last {FormatLapTime(last.LapTimeSeconds)}";
    }

    // One lap-time format for the page: the recorded-lap list and the target labels must not
    // disagree about what 2:11.0 looks like.
    private static string FormatLapTime(double seconds) => PlanTargetResolver.FormatLapTime(seconds);

    private static IBrush StatusBrush(PlanStatus status) => status switch
    {
        PlanStatus.Tracking => Graphite.GreenBrush,
        PlanStatus.Armed => Graphite.AccentBrush,
        PlanStatus.Completed => Graphite.BlueBrush,
        PlanStatus.Abandoned => Graphite.RedBrush,
        _ => Graphite.Text3Brush,
    };

    private static Control DetailRow(string label, string value)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("120,*") };
        var text = Graphite.TextBlock(label, 12, FontWeight.Normal, Graphite.Text3Brush);
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);
        var content = Graphite.TextBlock(value, 12, FontWeight.Normal, Graphite.TextBrush, TextWrapping.Wrap);
        Grid.SetColumn(content, 1);
        grid.Children.Add(content);
        return grid;
    }

    private static Button ActionButton(string label, ButtonTone tone, Action action, string? icon = null)
    {
        var button = Graphite.Button(label, tone, icon);
        button.Click += (_, _) => action();
        return button;
    }

    private static ScrollViewer Scroll(Control content) => new()
    {
        HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
        VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        Content = content,
    };
}
