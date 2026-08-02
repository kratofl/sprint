using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// One step of the full creation sheet. Grouped by the question each answers rather than by
/// field type, so a step is a thing the driver can finish and leave.
/// </summary>
public enum PlanFormStep
{
    /// <summary>Which game, car and track — and the optional name.</summary>
    Context,

    /// <summary>Which sessions the weekend has, and how long the race is.</summary>
    Sessions,

    /// <summary>Reserve, and the manual estimates when there is no history to lean on.</summary>
    Fuel,
}

/// <summary>
/// The mutable field state behind the New Session Plan modal, plus its validation. Kept
/// separate from the Avalonia controls so the rules are unit-tested directly.
/// </summary>
public sealed class NewPlanDraft
{
    private static readonly PlanFormStep[] Steps = Enum.GetValues<PlanFormStep>();

    public string Name { get; set; } = "";
    public string Game { get; set; } = "";
    public string Car { get; set; } = "";
    public string Track { get; set; } = "";
    public bool QualifyingIncluded { get; set; } = true;
    public RaceLengthFormat RaceLengthFormat { get; set; } = RaceLengthFormat.TimeBased;
    public string RaceLengthText { get; set; } = "";
    public string FuelReserveText { get; set; } = "1";
    public string AvgLapTimeText { get; set; } = "";
    public string FuelPerLapText { get; set; } = "";

    /// <summary>The last validation failure, or empty. Lives on the draft rather than the
    /// dialog because the modal is torn down and rebuilt on every segmented/disclosure change
    /// — an error held by the dialog would vanish before the user could read it.</summary>
    public string Error { get; set; } = "";

    /// <summary>
    /// A draft seeded from the global Session Planner defaults (#103). The defaults seed the
    /// fields; they do not lock them, so every value stays overridable per plan.
    /// </summary>
    public static NewPlanDraft FromDefaults(SessionPlannerSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        return new NewPlanDraft
        {
            FuelReserveText = settings.FuelReserveLaps.ToString(CultureInfo.InvariantCulture),
        };
    }

    /// <summary>
    /// Which step the sheet is showing. On the draft, not the dialog, because the modal is torn
    /// down and rebuilt on every change — a step held by the dialog would snap back to the first
    /// one mid-edit.
    /// </summary>
    public PlanFormStep Step { get; set; } = PlanFormStep.Context;

    public bool IsFirstStep => Step == Steps[0];

    public bool IsLastStep => Step == Steps[^1];

    /// <summary>
    /// Validates just the current step and moves on. Checking here rather than only at Create
    /// keeps a message beside the field it is about instead of two steps away.
    /// </summary>
    public bool TryAdvance(out string error)
    {
        error = "";
        if (!ValidateStep(Step, out error))
        {
            return false;
        }

        if (!IsLastStep)
        {
            Step = Steps[Array.IndexOf(Steps, Step) + 1];
        }

        return true;
    }

    /// <summary>Steps back, staying put on the first step rather than dismissing the sheet.</summary>
    public void GoBack()
    {
        if (!IsFirstStep)
        {
            Step = Steps[Array.IndexOf(Steps, Step) - 1];
        }
    }

    private bool ValidateStep(PlanFormStep step, out string error)
    {
        error = "";
        return step switch
        {
            // Context requires nothing: a plan can precede ever driving the car.
            PlanFormStep.Context => true,
            PlanFormStep.Sessions => TryRaceLength(out _, out error),
            _ => TryReserve(out _, out error),
        };
    }

    /// <summary>
    /// Validates the draft and produces a <see cref="CreatePlanRequest"/>. Race length and
    /// reserve are hard requirements; game/car/track may be blank, because a plan can be made
    /// for a car the user has not driven yet. Unparseable manual fuel values are left unset
    /// rather than written as a bogus zero estimate.
    /// </summary>
    public bool TryBuild(out CreatePlanRequest? request, out string error)
    {
        request = null;

        // The same two rules the step gates use, so a value that passed on its own step cannot
        // be rejected by different wording at the end.
        if (!TryRaceLength(out var raceLength, out error) || !TryReserve(out var reserve, out error))
        {
            return false;
        }

        request = new CreatePlanRequest
        {
            Name = ResolveName(),
            Game = Game.Trim(),
            Car = Car.Trim(),
            Track = Track.Trim(),
            QualifyingIncluded = QualifyingIncluded,
            RaceLengthFormat = RaceLengthFormat,
            RaceLengthValue = raceLength,
            FuelReserveLaps = reserve,
            AvgLapTimeSeconds = ParseOptional(AvgLapTimeText),
            FuelPerLapLiters = ParseOptional(FuelPerLapText),
        };
        error = "";
        return true;
    }

    private bool TryRaceLength(out double raceLength, out string error)
    {
        if (!double.TryParse(RaceLengthText, NumberStyles.Float, CultureInfo.InvariantCulture, out raceLength))
        {
            error = "Race length must be a number.";
            return false;
        }

        if (raceLength <= 0)
        {
            error = "Race length must be greater than zero.";
            return false;
        }

        error = "";
        return true;
    }

    private bool TryReserve(out int reserve, out string error)
    {
        if (!int.TryParse(FuelReserveText, NumberStyles.Integer, CultureInfo.InvariantCulture, out reserve))
        {
            error = "Fuel reserve must be a whole number of laps.";
            return false;
        }

        if (reserve < 0)
        {
            error = "Fuel reserve cannot be negative.";
            return false;
        }

        error = "";
        return true;
    }

    /// <summary>
    /// What an unnamed plan will be called: where and what it is for, so history stays
    /// readable. Public because the modal shows it as the name field's placeholder — the
    /// preview has to be the string the plan really gets, not a lookalike built in the view.
    /// </summary>
    public string DerivedName
    {
        get
        {
            var parts = new[] { Track.Trim(), Car.Trim() }
                .Where(part => part.Length > 0)
                .ToArray();
            return parts.Length == 0 ? "New Session Plan" : string.Join(" – ", parts);
        }
    }

    private string ResolveName() =>
        string.IsNullOrWhiteSpace(Name) ? DerivedName : Name.Trim();

    private static double? ParseOptional(string text) =>
        double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && value > 0
            ? value
            : null;
}

/// <summary>
/// Builds the New Session Plan modal body: labelled sections with the fuel block behind a
/// disclosure. One screen rather than a wizard, because race length, reserve, lap time and
/// fuel per lap all feed the same question, and the flow runs under time pressure just
/// before joining a server. The caller owns the overlay and the Create/Cancel wiring.
/// </summary>
internal sealed class NewPlanDialog
{
    /// <summary>Control names the view tests address the context and name inputs by.</summary>
    internal const string NameInputName = "planNameInput";
    internal const string TrackInputName = "planTrackInput";
    internal const string CarInputName = "planCarInput";
    internal const string GameInputName = "planGameInput";

    /// <summary>Tags the step indicator and its per-step markers for the view tests.</summary>
    internal const string StepIndicatorTag = "plan-step-indicator";
    internal const string StepMarkerTag = "plan-step-marker";

    private readonly NewPlanDraft _draft;
    private readonly bool _hasFuelHistory;
    private readonly PlanContextOptions _options;
    private readonly Action<CreatePlanRequest> _create;
    private readonly Action _cancel;
    private readonly Action _rebuild;
    // Every text field built this pass, with the draft property it writes. Read back on
    // submit and before any rebuild, so a value is never lost to a missed change event.
    private readonly List<(TextBox Box, Action<string> Assign)> _fields = [];

    public NewPlanDialog(
        NewPlanDraft draft,
        bool hasFuelHistory,
        Action<CreatePlanRequest> create,
        Action cancel,
        Action rebuild,
        PlanContextOptions? options = null)
    {
        _draft = draft;
        _hasFuelHistory = hasFuelHistory;
        _options = options ?? PlanContextOptions.Empty;
        _create = create;
        _cancel = cancel;
        _rebuild = rebuild;
    }

    // Pull the live control values into the draft. The draft outlives the controls, so this
    // runs before every rebuild and before validation.
    private void Sync()
    {
        foreach (var (box, assign) in _fields)
        {
            assign(box.Text ?? "");
        }
    }

    private void Rebuild()
    {
        Sync();
        _rebuild();
    }

    public Control Build()
    {
        _fields.Clear();
        var content = new StackPanel { Spacing = 14, Width = 460 };

        var headingText = new StackPanel { Spacing = 12 };
        headingText.Children.Add(Graphite.TextBlock("New Session Plan", 19, FontWeight.Bold, Graphite.TextBrush));
        // The walk is drawn, not narrated: every station is visible at once, the ember marker
        // says "you are here", and a finished step wears a check instead of its number.
        headingText.Children.Add(StepIndicator(_draft.Step));
        content.Children.Add(headingText);

        // One step at a time. The single-screen sheet was justified by the flow running under
        // time pressure, but Quick plan (#183) now owns that case — this sheet is for planning
        // in advance, where three short steps beat one form that has to be scrolled.
        switch (_draft.Step)
        {
            case PlanFormStep.Context:
                foreach (var control in ContextStep())
                {
                    content.Children.Add(control);
                }

                break;

            case PlanFormStep.Sessions:
                foreach (var control in SessionsStep())
                {
                    content.Children.Add(control);
                }

                break;

            default:
                content.Children.Add(FuelSection());
                break;
        }

        // The error and the commit row stay pinned outside the scroll region: an expanded fuel
        // section plus a validation message overflows the modal's height, and the action the
        // message is telling the user to retry must never scroll out of reach.
        var footer = new StackPanel { Spacing = 10, Margin = new Thickness(0, 14, 0, 0) };
        if (_draft.Error.Length > 0)
        {
            footer.Children.Add(Graphite.TextBlock(_draft.Error, 12, FontWeight.Normal, Graphite.RedBrush, TextWrapping.Wrap));
        }

        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        actions.Children.Add(ActionButton("Cancel", ButtonTone.Ghost, _cancel));
        if (!_draft.IsFirstStep)
        {
            actions.Children.Add(ActionButton("Back", ButtonTone.Neutral, () =>
            {
                Sync();
                // Going back never rejects: a half-filled field the driver is returning to fix
                // must not be the reason they cannot move.
                _draft.Error = "";
                _draft.GoBack();
                _rebuild();
            }));
        }

        if (_draft.IsLastStep)
        {
            actions.Children.Add(ActionButton("Create", ButtonTone.Primary, Submit));
        }
        else
        {
            actions.Children.Add(ActionButton("Next", ButtonTone.Primary, Advance));
        }

        footer.Children.Add(actions);

        var layout = new Grid { RowDefinitions = new RowDefinitions("*,Auto") };
        var scroll = new ScrollViewer
        {
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = content,
        };
        Grid.SetRow(scroll, 0);
        layout.Children.Add(scroll);
        Grid.SetRow(footer, 1);
        layout.Children.Add(footer);
        return layout;
    }

    private void Advance()
    {
        Sync();
        _draft.Error = _draft.TryAdvance(out var error) ? "" : error;
        _rebuild();
    }

    private void Submit()
    {
        Sync();
        if (!_draft.TryBuild(out var request, out var error))
        {
            _draft.Error = error;
            _rebuild();
            return;
        }

        _draft.Error = "";
        _create(request!);
    }

    private static string StepCaption(PlanFormStep step) => step switch
    {
        PlanFormStep.Context => "Where and what",
        PlanFormStep.Sessions => "Sessions",
        _ => "Fuel",
    };

    private static Control StepIndicator(PlanFormStep current)
    {
        var steps = Enum.GetValues<PlanFormStep>();
        var currentIndex = Array.IndexOf(steps, current);

        var grid = new Grid
        {
            Tag = StepIndicatorTag,
            VerticalAlignment = VerticalAlignment.Center,
        };
        for (var i = 0; i < steps.Length; i++)
        {
            grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));
            if (i < steps.Length - 1)
            {
                grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Star));
            }
        }

        for (var i = 0; i < steps.Length; i++)
        {
            var station = StepStation(i, currentIndex, StepCaption(steps[i]));
            Grid.SetColumn(station, i * 2);
            grid.Children.Add(station);

            if (i < steps.Length - 1)
            {
                // The connector belongs to the step it leaves: it turns ember once that step
                // is behind the driver.
                var connector = new Border
                {
                    Height = 2,
                    MinWidth = 16,
                    CornerRadius = new CornerRadius(1),
                    Background = i < currentIndex ? Graphite.AccentBrush : Graphite.Line2Brush,
                    Margin = new Thickness(8, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                Grid.SetColumn(connector, (i * 2) + 1);
                grid.Children.Add(connector);
            }
        }

        return grid;
    }

    private static Control StepStation(int index, int currentIndex, string caption)
    {
        var done = index < currentIndex;
        var isCurrent = index == currentIndex;

        var marker = new Border
        {
            Width = 22,
            Height = 22,
            CornerRadius = new CornerRadius(Graphite.RadiusPill),
            Background = done || isCurrent ? Graphite.AccentBrush : Graphite.Panel3Brush,
            BorderBrush = done || isCurrent ? Graphite.AccentBrush : Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            Tag = StepMarkerTag,
        };
        if (done)
        {
            var check = Icons.Create("check", 12, Graphite.Panel2Brush, 2.5);
            check.HorizontalAlignment = HorizontalAlignment.Center;
            check.VerticalAlignment = VerticalAlignment.Center;
            marker.Child = check;
        }
        else
        {
            var number = Graphite.TextBlock(
                (index + 1).ToString(CultureInfo.InvariantCulture),
                11,
                FontWeight.SemiBold,
                isCurrent ? Graphite.Panel2Brush : Graphite.Text3Brush);
            number.HorizontalAlignment = HorizontalAlignment.Center;
            number.VerticalAlignment = VerticalAlignment.Center;
            marker.Child = number;
        }

        var label = Graphite.TextBlock(
            caption,
            12,
            isCurrent ? FontWeight.Medium : FontWeight.Normal,
            isCurrent ? Graphite.TextBrush : done ? Graphite.Text2Brush : Graphite.Text3Brush);
        label.VerticalAlignment = VerticalAlignment.Center;

        var station = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        station.Children.Add(marker);
        station.Children.Add(label);
        return station;
    }

    private IEnumerable<Control> ContextStep()
    {
        // Editable dropdowns, not closed lists. The values are what Sprint has recorded, so
        // picking one guarantees the plan keys onto the same lap-history bucket the corpus
        // already holds — a typo makes a second bucket and halves every statistic. Typing a new
        // car or track stays possible, because planning for one you have never driven is normal.
        var game = Suggesting(_draft.Game, value => _draft.Game = value, "Le Mans Ultimate", _options.Games, GameInputName);
        yield return Field("Game", game.Control);

        // Cars and tracks narrow to the chosen game, so another sim's entries are never offered.
        var narrowed = _options.For(_draft.Game);

        var car = Suggesting(_draft.Car, value => _draft.Car = value, "Porsche 963", narrowed.Cars, CarInputName);
        yield return Field("Car", car.Control);

        var track = Suggesting(_draft.Track, value => _draft.Track = value, "Spa-Francorchamps", narrowed.Tracks, TrackInputName);
        yield return Field("Track", track.Control);

        var carBox = car.Box;
        var trackBox = track.Box;

        // The name follows the context, and previews what the plan will be called if skipped.
        var nameBox = Input(_draft.Name, value => _draft.Name = value, _draft.DerivedName);
        nameBox.Name = NameInputName;
        // Retarget the placeholder in place on every keystroke. Rebuilding the modal here
        // would throw away the caret and whatever the user had already typed.
        void PreviewDerivedName() => nameBox.PlaceholderText = _draft.DerivedName;
        trackBox.TextChanged += (_, _) => PreviewDerivedName();
        carBox.TextChanged += (_, _) => PreviewDerivedName();
        yield return Field("Name (optional)", nameBox);
    }

    private IEnumerable<Control> SessionsStep()
    {
        yield return Field("Qualifying", Graphite.Segmented(
            ["Include", "Skip"],
            _draft.QualifyingIncluded ? 0 : 1,
            index =>
            {
                _draft.QualifyingIncluded = index == 0;
                Rebuild();
            }));
        yield return Field("Race length", Graphite.Segmented(
            ["Time", "Laps"],
            _draft.RaceLengthFormat == RaceLengthFormat.LapBased ? 1 : 0,
            index =>
            {
                _draft.RaceLengthFormat = index == 1 ? RaceLengthFormat.LapBased : RaceLengthFormat.TimeBased;
                Rebuild();
            }));
        yield return Field(
            _draft.RaceLengthFormat == RaceLengthFormat.LapBased ? "Laps" : "Minutes",
            Input(_draft.RaceLengthText, value => _draft.RaceLengthText = value, "60"));
    }

    private Control FuelSection()
    {
        // No disclosure toggle: this is the step's whole purpose, so hiding its fields behind a
        // click would be a control that only ever gets opened. The chip stays, because whether
        // the numbers come from history or from an estimate is the useful part.
        var section = new StackPanel { Spacing = 8 };
        section.Children.Add(Graphite.Chip(
            _hasFuelHistory ? "from history" : "no history — estimate",
            _hasFuelHistory ? Graphite.Text2Brush : Graphite.AccentBrush));

        if (!_hasFuelHistory)
        {
            section.Children.Add(Field(
                "Avg lap time (s)",
                Input(_draft.AvgLapTimeText, value => _draft.AvgLapTimeText = value, "125.4")));
            section.Children.Add(Field(
                "Fuel per lap (L)",
                Input(_draft.FuelPerLapText, value => _draft.FuelPerLapText = value, "3.4")));
        }

        section.Children.Add(Field(
            "Reserve (laps)",
            Input(_draft.FuelReserveText, value => _draft.FuelReserveText = value, "1")));
        return section;
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

    private TextBox Input(string value, Action<string> onChanged, string placeholder)
    {
        var box = new TextBox
        {
            Text = value,
            PlaceholderText = placeholder,
            MinWidth = 260,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            FontFamily = Graphite.FontStack,
            FontSize = 12,
        };
        // Write straight through on every keystroke, and register the field so Submit and
        // every rebuild read it back regardless: the modal is discarded on segmented and
        // disclosure changes, and the draft must survive those rebuilds.
        box.TextChanged += (_, _) => onChanged(box.Text ?? "");
        _fields.Add((box, onChanged));
        return box;
    }

    /// <summary>
    /// A field that offers the recorded values through a real dropdown while staying typeable.
    /// Registered so Submit and every rebuild read its text back, like the plain inputs.
    /// </summary>
    private SuggestingField Suggesting(
        string value,
        Action<string> onChanged,
        string placeholder,
        IReadOnlyList<string> suggestions,
        string name)
    {
        var field = new SuggestingField(value, onChanged, placeholder, suggestions, name);
        _fields.Add((field.Box, onChanged));
        return field;
    }

    private static Button ActionButton(string label, ButtonTone tone, Action action)
    {
        var button = Graphite.Button(label, tone);
        button.Click += (_, _) => action();
        return button;
    }
}
