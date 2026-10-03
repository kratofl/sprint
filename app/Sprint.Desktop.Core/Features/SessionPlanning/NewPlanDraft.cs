using System.Globalization;
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
/// The mutable field state behind the New Session Plan form, plus its validation. Kept
/// separate from any view so the rules are unit-tested directly.
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

    /// <summary>The last validation failure, or empty. Lives on the draft rather than a view
    /// because a rebuilt form would otherwise lose an error before the user could read it.</summary>
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
    /// Which step the sheet is showing. On the draft, not a view, because a rebuilt form would
    /// otherwise snap back to the first step mid-edit.
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
    /// readable. Public because a form can show it as the name field's placeholder — the
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
