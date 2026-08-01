using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// The Quick plan sheet (#183): the minute before joining a server. Everything Sprint
/// already detected is rendered read-only, and inputs appear <em>only</em> for the gaps in
/// <see cref="PlanDetection.MissingFields"/> — so in the best case (in the car, lap-based
/// session, history present) this is a summary plus <c>Create</c>, and the form shrinks by
/// itself as detection improves.
/// <para>
/// Deliberately a separate sheet from <see cref="NewPlanDialog"/> rather than a mode switch
/// inside it: that sheet already carries two segmented controls, and the design contract
/// scopes segmented controls to closely related state rather than to switching modes.
/// Practice-program scope is intentionally absent here.
/// </para>
/// </summary>
internal sealed class QuickPlanDialog
{
    internal const string RaceLengthInputName = "quickRaceLengthInput";
    internal const string AvgLapTimeInputName = "quickAvgLapTimeInput";
    internal const string FuelPerLapInputName = "quickFuelPerLapInput";
    internal const string GameInputName = "quickGameInput";
    internal const string CarInputName = "quickCarInput";
    internal const string TrackInputName = "quickTrackInput";

    private readonly NewPlanDraft _draft;
    private readonly PlanDetection _detection;
    private readonly Action<CreatePlanRequest> _create;
    private readonly Action _cancel;
    private readonly List<(TextBox Box, Action<string> Assign)> _fields = [];

    public QuickPlanDialog(
        NewPlanDraft draft,
        PlanDetection detection,
        Action<CreatePlanRequest> create,
        Action cancel)
    {
        _draft = draft;
        _detection = detection;
        _create = create;
        _cancel = cancel;

        // Seed the draft from detection so a submitted plan carries the detected values even
        // when the user never touches a field.
        _draft.Game = detection.Context.Game;
        _draft.Car = detection.Context.Car;
        _draft.Track = detection.Context.Track;
        if (detection.RaceLengthKnown)
        {
            _draft.RaceLengthFormat = detection.RaceLengthFormat;
            _draft.RaceLengthText = detection.RaceLengthValue.ToString("0.##", CultureInfo.InvariantCulture);
        }
    }

    public Control Build()
    {
        _fields.Clear();
        var content = new StackPanel { Spacing = 14, Width = 460 };

        // Only what was actually detected is listed. Printing "unknown" directly above an
        // input asking for that same value is noise, and the point of this sheet is that it
        // shrinks as detection improves.
        var detected = new List<Control>();
        AddIfKnown(detected, "Game", _detection.Context.Game);
        AddIfKnown(detected, "Car", _detection.Context.Car);
        AddIfKnown(detected, "Track", _detection.Context.Track);
        if (_detection.RaceLengthKnown)
        {
            detected.Add(DetectedRow("Race length", RaceLengthSummary()));
        }

        if (_detection.HasFuelHistory)
        {
            // Worth stating: it is why the sheet is not asking for fuel numbers.
            detected.Add(DetectedRow("Fuel", "from lap history"));
        }

        // The subtitle has to match what is actually on screen: promising detected values when
        // the game reported none reads as a bug.
        var subtitle = (detected.Count, _detection.MissingFields.Count) switch
        {
            (> 0, 0) => "Everything below was detected. Create the plan and start tracking.",
            (> 0, _) => "Read from the game below. Sprint only needs what it could not detect.",
            _ => "The game has not reported this session yet — fill in what you know.",
        };

        var heading = new StackPanel { Spacing = 4 };
        heading.Children.Add(Graphite.TextBlock("Quick plan", 19, FontWeight.Bold, Graphite.TextBrush));
        heading.Children.Add(Graphite.TextBlock(
            subtitle,
            12,
            FontWeight.Normal,
            Graphite.Text2Brush,
            TextWrapping.Wrap));
        content.Children.Add(heading);

        if (detected.Count > 0)
        {
            content.Children.Add(Graphite.SectionLabel("Detected"));
            foreach (var row in detected)
            {
                content.Children.Add(row);
            }
        }

        if (_detection.MissingFields.Count > 0)
        {
            content.Children.Add(Graphite.SectionLabel("Sprint needs"));
        }

        foreach (var field in _detection.MissingFields)
        {
            foreach (var control in Inputs(field))
            {
                content.Children.Add(control);
            }
        }

        var footer = new StackPanel { Spacing = 10, Margin = new Thickness(0, 14, 0, 0) };
        if (_draft.Error.Length > 0)
        {
            footer.Children.Add(Graphite.TextBlock(
                _draft.Error,
                12,
                FontWeight.Normal,
                Graphite.RedBrush,
                TextWrapping.Wrap));
        }

        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        actions.Children.Add(ActionButton("Cancel", ButtonTone.Ghost, _cancel));
        actions.Children.Add(ActionButton("Create", ButtonTone.Primary, Submit));
        footer.Children.Add(actions);

        content.Children.Add(footer);
        return content;
    }

    private string RaceLengthSummary() => _detection switch
    {
        { RaceLengthKnown: false } => "not reported by the game",
        { RaceLengthFormat: RaceLengthFormat.LapBased } =>
            $"{_detection.RaceLengthValue.ToString("0.##", CultureInfo.InvariantCulture)} laps",
        _ => $"{_detection.RaceLengthValue.ToString("0.##", CultureInfo.InvariantCulture)} minutes",
    };

    private IEnumerable<Control> Inputs(QuickPlanField field)
    {
        switch (field)
        {
            case QuickPlanField.Context:
                if (string.IsNullOrWhiteSpace(_detection.Context.Game))
                {
                    yield return Field("Game", Input(
                        _draft.Game,
                        value => _draft.Game = value,
                        "Le Mans Ultimate",
                        GameInputName));
                }

                if (string.IsNullOrWhiteSpace(_detection.Context.Car))
                {
                    yield return Field("Car", Input(
                        _draft.Car,
                        value => _draft.Car = value,
                        "Porsche 963",
                        CarInputName));
                }

                if (string.IsNullOrWhiteSpace(_detection.Context.Track))
                {
                    yield return Field("Track", Input(
                        _draft.Track,
                        value => _draft.Track = value,
                        "Spa-Francorchamps",
                        TrackInputName));
                }

                break;

            case QuickPlanField.RaceLength:
                // Format is the user's to state when the game did not: Time is the common case.
                yield return Field("Race length", Graphite.Segmented(
                    ["Time", "Laps"],
                    _draft.RaceLengthFormat == RaceLengthFormat.LapBased ? 1 : 0,
                    index => _draft.RaceLengthFormat =
                        index == 1 ? RaceLengthFormat.LapBased : RaceLengthFormat.TimeBased));
                yield return Field(
                    _draft.RaceLengthFormat == RaceLengthFormat.LapBased ? "Laps" : "Minutes",
                    Input(_draft.RaceLengthText, value => _draft.RaceLengthText = value, "60", RaceLengthInputName));
                break;

            case QuickPlanField.Fuel:
                yield return Field("Avg lap time (s)", Input(
                    _draft.AvgLapTimeText,
                    value => _draft.AvgLapTimeText = value,
                    "125.4",
                    AvgLapTimeInputName));
                yield return Field("Fuel per lap (L)", Input(
                    _draft.FuelPerLapText,
                    value => _draft.FuelPerLapText = value,
                    "3.4",
                    FuelPerLapInputName));
                break;
        }
    }

    private void Submit()
    {
        foreach (var (box, assign) in _fields)
        {
            assign(box.Text ?? "");
        }

        // Quick mode deliberately does not ask about qualifying: the draft's default includes
        // it, and the page can change it after the sheet closes.
        if (!_draft.TryBuild(out var request, out var error))
        {
            _draft.Error = error;
            return;
        }

        _draft.Error = "";
        _create(request! with { Mode = PlanMode.Quick });
    }

    private static void AddIfKnown(List<Control> rows, string label, string value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            rows.Add(DetectedRow(label, value));
        }
    }

    private static Control DetectedRow(string label, string value)
    {
        var text = Graphite.TextBlock(value, 12, FontWeight.Normal, Graphite.TextBrush, TextWrapping.Wrap);
        text.VerticalAlignment = VerticalAlignment.Center;
        return Field(label, text);
    }

    private static Control Field(string label, Control control)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("140,*") };
        var text = Graphite.TextBlock(label, 12, FontWeight.Normal, Graphite.Text2Brush);
        text.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(text, 0);
        grid.Children.Add(text);
        control.HorizontalAlignment = HorizontalAlignment.Left;
        Grid.SetColumn(control, 1);
        grid.Children.Add(control);
        return grid;
    }

    private TextBox Input(string value, Action<string> onChanged, string placeholder, string name)
    {
        var box = new TextBox
        {
            Name = name,
            Text = value,
            PlaceholderText = placeholder,
            MinWidth = 260,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            FontFamily = Graphite.FontStack,
            FontSize = 12,
        };
        box.TextChanged += (_, _) => onChanged(box.Text ?? "");
        _fields.Add((box, onChanged));
        return box;
    }

    private static Button ActionButton(string label, ButtonTone tone, Action action)
    {
        var button = Graphite.Button(label, tone);
        button.Click += (_, _) => action();
        return button;
    }
}
