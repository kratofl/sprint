using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>What the page needs from the shell: the modal, the confirm dialog, and a repaint.</summary>
internal sealed record SessionPlannerViewCallbacks(
    Action OpenCreateDialog,
    Action<string, string, string, Action> Confirm);

/// <summary>
/// The Session Planner page (#100). A thin renderer over
/// <see cref="SessionPlannerController"/>: the Qualifying/Race segmented control at the top
/// of the page, the active-plan card with its tracking controls, and plan history. All
/// behaviour lives in the controller, which is unit-tested; this class only paints it.
/// </summary>
internal sealed class SessionPlannerView
{
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
        var create = ActionButton("New Session Plan", ButtonTone.Primary, _callbacks.OpenCreateDialog);
        Grid.SetColumn(create, 1);
        header.Children.Add(create);
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
        var status = Graphite.StatusPill(plan.Status.ToString().ToUpperInvariant(), StatusBrush(plan.Status));
        Grid.SetColumn(status, 1);
        titleRow.Children.Add(status);
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
        body.Children.Add(TrackingControls(plan));
        return Graphite.Card(body, new Thickness(18, 16));
    }

    private Control SegmentDetail(SessionPlan plan)
    {
        var kind = _controller.SelectedTab == PlannerSegmentTab.Qualifying
            ? SegmentKind.Qualifying
            : SegmentKind.Race;
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

    private static string FormatLapTime(double seconds)
    {
        if (seconds <= 0)
        {
            return "—";
        }

        var span = TimeSpan.FromSeconds(seconds);
        return $"{(int)span.TotalMinutes}:{span.Seconds:00}.{span.Milliseconds / 100}";
    }

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
