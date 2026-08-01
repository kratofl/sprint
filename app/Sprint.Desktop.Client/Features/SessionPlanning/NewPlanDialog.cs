using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// The mutable field state behind the New Session Plan modal, plus its validation. Kept
/// separate from the Avalonia controls so the rules are unit-tested directly.
/// </summary>
public sealed class NewPlanDraft
{
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

    /// <summary>Whether the fuel disclosure is open. Null until the dialog resolves it from
    /// fuel-history availability; retained here so it survives a rebuild.</summary>
    public bool? FuelExpanded { get; set; }

    /// <summary>
    /// Validates the draft and produces a <see cref="CreatePlanRequest"/>. Race length and
    /// reserve are hard requirements; game/car/track may be blank, because a plan can be made
    /// for a car the user has not driven yet. Unparseable manual fuel values are left unset
    /// rather than written as a bogus zero estimate.
    /// </summary>
    public bool TryBuild(out CreatePlanRequest? request, out string error)
    {
        request = null;

        if (!double.TryParse(RaceLengthText, NumberStyles.Float, CultureInfo.InvariantCulture, out var raceLength))
        {
            error = "Race length must be a number.";
            return false;
        }

        if (raceLength <= 0)
        {
            error = "Race length must be greater than zero.";
            return false;
        }

        if (!int.TryParse(FuelReserveText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var reserve))
        {
            error = "Fuel reserve must be a whole number of laps.";
            return false;
        }

        if (reserve < 0)
        {
            error = "Fuel reserve cannot be negative.";
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

    // An unnamed plan is named after where and what it is for, so history stays readable.
    private string ResolveName()
    {
        if (!string.IsNullOrWhiteSpace(Name))
        {
            return Name.Trim();
        }

        var parts = new[] { Track.Trim(), Car.Trim() }
            .Where(part => part.Length > 0)
            .ToArray();
        return parts.Length == 0 ? "New Session Plan" : string.Join(" – ", parts);
    }

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
    private readonly NewPlanDraft _draft;
    private readonly bool _hasFuelHistory;
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
        Action rebuild)
    {
        _draft = draft;
        _hasFuelHistory = hasFuelHistory;
        _create = create;
        _cancel = cancel;
        _rebuild = rebuild;
        // With no history the manual values are the only fuel input there is, so the section
        // opens; with history it collapses to a summary the user can still expand.
        _draft.FuelExpanded ??= !hasFuelHistory;
    }

    private bool FuelExpanded => _draft.FuelExpanded ?? !_hasFuelHistory;

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

        var headingText = new StackPanel { Spacing = 4 };
        headingText.Children.Add(Graphite.TextBlock("New Session Plan", 19, FontWeight.Bold, Graphite.TextBrush));
        headingText.Children.Add(Graphite.TextBlock(
            "Confirm the context, choose the race format, then start or arm tracking.",
            12,
            FontWeight.Normal,
            Graphite.Text2Brush,
            TextWrapping.Wrap));
        content.Children.Add(headingText);

        content.Children.Add(Field("Name", Input(_draft.Name, value => _draft.Name = value, "Spa – Hypercar")));

        content.Children.Add(Graphite.SectionLabel("Context"));
        content.Children.Add(Field("Game", Input(_draft.Game, value => _draft.Game = value, "Le Mans Ultimate")));
        content.Children.Add(Field("Car", Input(_draft.Car, value => _draft.Car = value, "Porsche 963")));
        content.Children.Add(Field("Track", Input(_draft.Track, value => _draft.Track = value, "Spa-Francorchamps")));

        content.Children.Add(Graphite.SectionLabel("Sessions"));
        content.Children.Add(Field("Qualifying", Graphite.Segmented(
            ["Include", "Skip"],
            _draft.QualifyingIncluded ? 0 : 1,
            index =>
            {
                _draft.QualifyingIncluded = index == 0;
                Rebuild();
            })));
        content.Children.Add(Field("Race length", Graphite.Segmented(
            ["Time", "Laps"],
            _draft.RaceLengthFormat == RaceLengthFormat.LapBased ? 1 : 0,
            index =>
            {
                _draft.RaceLengthFormat = index == 1 ? RaceLengthFormat.LapBased : RaceLengthFormat.TimeBased;
                Rebuild();
            })));
        content.Children.Add(Field(
            _draft.RaceLengthFormat == RaceLengthFormat.LapBased ? "Laps" : "Minutes",
            Input(_draft.RaceLengthText, value => _draft.RaceLengthText = value, "60")));

        content.Children.Add(FuelSection());

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
        actions.Children.Add(ActionButton("Create", ButtonTone.Primary, Submit));
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

    private void Submit()
    {
        Sync();
        if (!_draft.TryBuild(out var request, out var error))
        {
            _draft.Error = error;
            // Reveal the section the user must fix.
            _draft.FuelExpanded = true;
            _rebuild();
            return;
        }

        _draft.Error = "";
        _create(request!);
    }

    private Control FuelSection()
    {
        var header = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        header.Children.Add(ActionButton(
            FuelExpanded ? "▾  Fuel" : "▸  Fuel",
            ButtonTone.Ghost,
            () =>
            {
                Sync();
                _draft.FuelExpanded = !FuelExpanded;
                _rebuild();
            }));
        header.Children.Add(Graphite.Chip(
            _hasFuelHistory ? "from history" : "no history — estimate",
            _hasFuelHistory ? Graphite.Text2Brush : Graphite.AccentBrush));

        var section = new StackPanel { Spacing = 8 };
        section.Children.Add(header);

        if (!FuelExpanded)
        {
            return section;
        }

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

    private static Button ActionButton(string label, ButtonTone tone, Action action)
    {
        var button = Graphite.Button(label, tone);
        button.Click += (_, _) => action();
        return button;
    }
}
