using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>What the page needs from the shell: the modal, the confirm dialog, and a repaint.</summary>
internal sealed record SessionPlannerViewCallbacks(
    Action OpenCreateDialog,
    Action<string, string, string, Action> Confirm,
    Action OpenQuickPlanDialog,
    Action ImportArchivedSessions,
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

    /// <summary>Tags the (scope, statistic) target selector (#186).</summary>
    internal const string TargetSectionTag = "planner-target-section";

    private readonly SessionPlannerController _controller;
    private readonly SessionPlannerViewCallbacks _callbacks;

    public SessionPlannerView(SessionPlannerController controller, SessionPlannerViewCallbacks callbacks)
    {
        _controller = controller;
        _callbacks = callbacks;
    }

    public Control Build()
    {
        var stack = new StackPanel { Spacing = 20, Margin = new Thickness(24, 20, 24, 32) };

        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), MinHeight = 32 };
        var caption = Graphite.TextBlock(
            "Plan, track, and review qualifying and race sessions",
            12,
            FontWeight.Normal,
            Graphite.Text3Brush);
        caption.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(caption, 0);
        header.Children.Add(caption);
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
        if (_callbacks.CanImportResults)
        {
            actions.Children.Add(ActionButton("Import results", ButtonTone.Ghost, _callbacks.ImportArchivedSessions));
        }
        actions.Children.Add(ActionButton("New plan", ButtonTone.Neutral, _callbacks.OpenCreateDialog));
        actions.Children.Add(ActionButton("Quick plan", ButtonTone.Primary, _callbacks.OpenQuickPlanDialog));
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

        // The segmented control sits at the top of the page so it scopes the whole page to a
        // segment. It drives local controller state only — never shell navigation.
        stack.Children.Add(SegmentTabs());

        if (_controller.PlanInView is { } plan)
        {
            stack.Children.Add(PlanCard(plan));
        }

        stack.Children.Add(HistorySection());
        return Scroll(stack);
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
        panel.Children.Add(Graphite.SectionLabel($"{kind} lap-time target"));
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
            // The corpus has nothing for this context: the driver types the value and the plan
            // still completes, rather than the page dead-ending on missing history.
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
                panel.Children.Add(LapRow(kind, scope, target));
            }
        }

        panel.Children.Add(ManualRow(kind, target));

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

    private Control StatisticRow(SegmentKind kind, PlanTargetScopeGroup scope, PlanTarget? target)
    {
        // Every option carries its resolved time, so the driver chooses a pace rather than a
        // word; the sample size sits beside the scope, which is what it belongs to.
        var labels = scope.Options.Select(option => $"{option.Label} · {option.TimeText}").ToArray();
        var selected = target is null || !SameScope(target, scope)
            ? -1
            : scope.Options.ToList().FindIndex(option => option.Statistic == target.Statistic);

        return LabelledRow(
            "Aim at",
            Graphite.Segmented(labels, selected, index => _controller.SetTarget(kind, scope.Options[index])));
    }

    private Control LapRow(SegmentKind kind, PlanTargetScopeGroup scope, PlanTarget? target)
    {
        var picked = target is not null
            && SameScope(target, scope)
            && target.Statistic == PlanTargetStatistic.Custom
                ? scope.Laps.FirstOrDefault(lap =>
                    lap.LapSessionId == target.LapSessionId && lap.LapNumber == target.LapNumber)
                : null;

        var labels = scope.Laps.Select(LapLabel).ToArray();
        var combo = Graphite.ComboBox(
            labels,
            picked is null ? null : LapLabel(picked),
            280,
            "Pick a lap");
        combo.SelectionChanged += (_, _) =>
        {
            if (combo.SelectedIndex < 0 || combo.SelectedIndex >= scope.Laps.Count)
            {
                return;
            }

            var lap = scope.Laps[combo.SelectedIndex];
            if (!ReferenceEquals(lap, picked))
            {
                _controller.SetTarget(kind, lap);
            }
        };

        return LabelledRow("Specific lap", combo);
    }

    // Laps are listed fastest to slowest, so the ordering is the label's context; the tier note
    // is on each entry because it varies lap by lap in a corpus that mixes both writers.
    private static string LapLabel(PlanTargetOption lap) =>
        $"{lap.TimeText} · {lap.Label} · {lap.TierNote}";

    private Control ManualRow(SegmentKind kind, PlanTarget? target)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        var input = new TextBox
        {
            PlaceholderText = "2:05.4",
            MinWidth = 120,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            FontFamily = Graphite.FontStack,
            FontSize = 12,
        };
        var error = Graphite.TextBlock("", 11, FontWeight.Normal, Graphite.RedBrush);
        error.VerticalAlignment = VerticalAlignment.Center;
        row.Children.Add(input);
        row.Children.Add(ActionButton("Set", ButtonTone.Neutral, () =>
        {
            // A rejected entry must not repaint the page, or the typed text would vanish along
            // with the message explaining why it was rejected.
            error.Text = _controller.SetManualTarget(kind, input.Text ?? "")
                ? ""
                : "Enter a lap time like 2:05.4.";
        }));

        if (target is not null)
        {
            row.Children.Add(ActionButton("Clear target", ButtonTone.Ghost, () => _controller.ClearTarget(kind)));
        }

        row.Children.Add(error);
        return LabelledRow("Set by hand", row);
    }

    private static bool SameScope(PlanTarget target, PlanTargetScopeGroup scope) =>
        target.Scope == scope.Scope
        && string.Equals(target.ProgramType, scope.ProgramType, StringComparison.Ordinal);

    private static bool SameScope(PlanTargetScopeGroup left, PlanTargetScopeGroup right) =>
        left.Scope == right.Scope
        && string.Equals(left.ProgramType, right.ProgramType, StringComparison.Ordinal);

    private static Control LabelledRow(string label, Control content)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("120,*") };
        var text = Graphite.TextBlock(label, 12, FontWeight.Normal, Graphite.Text3Brush);
        text.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);
        content.HorizontalAlignment = HorizontalAlignment.Left;
        Grid.SetColumn(content, 1);
        grid.Children.Add(content);
        return grid;
    }

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
                row.Children.Add(ActionButton("Stop tracking", ButtonTone.Danger, () => _controller.Stop(plan.Id)));
                break;

            case PlanStatus.Armed:
                row.Children.Add(ActionButton("Start Qualifying now", ButtonTone.Primary,
                    () => _controller.StartNow(plan.Id, SegmentKind.Qualifying)));
                row.Children.Add(ActionButton("Start Race now", ButtonTone.Primary,
                    () => _controller.StartNow(plan.Id, SegmentKind.Race)));
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
            row.Children.Add(ActionButton("Start Qualifying now", ButtonTone.Primary,
                () => _controller.StartNow(plan.Id, SegmentKind.Qualifying)));
            row.Children.Add(ActionButton("Start Race now", ButtonTone.Primary,
                () => _controller.StartNow(plan.Id, SegmentKind.Race)));
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
            () => _controller.TakeOver(plan.Id))));
    }

    private Control HistorySection()
    {
        var panel = new StackPanel { Spacing = 10 };
        panel.Children.Add(Graphite.SectionLabel("Plan history"));

        var inView = _controller.PlanInView?.Id;
        foreach (var plan in _controller.History)
        {
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto") };

            var text = new StackPanel { Spacing = 3 };
            text.Children.Add(Graphite.TextBlock(plan.Name, 13, FontWeight.Medium, Graphite.TextBrush));
            text.Children.Add(Graphite.TextBlock(ContextLine(plan), 11, FontWeight.Normal, Graphite.Text3Brush));
            Grid.SetColumn(text, 0);
            row.Children.Add(text);

            var status = Graphite.Chip(plan.Status.ToString().ToLowerInvariant(), StatusBrush(plan.Status));
            status.Margin = new Thickness(8, 0);
            Grid.SetColumn(status, 1);
            row.Children.Add(status);

            var open = ActionButton(
                plan.Id == inView ? "In view" : "Reopen",
                ButtonTone.Ghost,
                () => _controller.SelectPlan(plan.Id));
            open.IsEnabled = plan.Id != inView;
            Grid.SetColumn(open, 2);
            row.Children.Add(open);

            panel.Children.Add(Graphite.Card(row, new Thickness(14, 12)));
        }

        return panel;
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

    private static Button ActionButton(string label, ButtonTone tone, Action action)
    {
        var button = Graphite.Button(label, tone);
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
