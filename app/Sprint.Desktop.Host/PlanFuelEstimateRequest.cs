using Sprint.Desktop.Features.SessionPlanning;
// The record's own RaceLengthFormat (the text sent) hides the enum's name inside it.
using LengthFormat = Sprint.Desktop.Features.SessionPlanning.RaceLengthFormat;

namespace Sprint.Desktop.Host;

/// <summary>
/// The body of <c>POST /api/planner/fuel-estimate</c>, the plan dialogs' fuel calculator: the
/// plan's game/car/track, its race length and reserve, and the lap time and fuel per lap as typed
/// (absent when the field is empty). Bound with the web defaults, so the race length format
/// arrives as text and is checked here rather than by the binder.
/// </summary>
public sealed record PlanFuelEstimateRequest(
    string? Game,
    string? Car,
    string? Track,
    string? RaceLengthFormat,
    double? RaceLengthValue,
    double? FuelReserveLaps,
    double? AvgLapTimeSeconds,
    double? FuelPerLapLiters)
{
    /// <summary>
    /// The calculator's inputs, held to what <c>plan.create</c> accepts (<see cref="PlanLimits"/>),
    /// or the reason they are refused. A reserve not sent is <paramref name="defaultReserveLaps"/>,
    /// as for a new plan.
    /// </summary>
    public bool TryGetInputs(int defaultReserveLaps, out PlanFuelInputs inputs, out string error)
    {
        inputs = new PlanFuelInputs(PlanContext.Empty, LengthFormat.Unknown, 0, defaultReserveLaps, null, null);
        // One member's exact name: Enum.TryParse would also take a number or "A, B" flag syntax.
        LengthFormat? format = this.RaceLengthFormat switch
        {
            null => LengthFormat.Unknown,
            { } text when Enum.GetNames<LengthFormat>().Contains(text, StringComparer.Ordinal) => Enum.Parse<LengthFormat>(text),
            _ => null,
        };
        if (format is not { } raceLengthFormat)
        {
            error = "raceLengthFormat must be Unknown, TimeBased or LapBased";
            return false;
        }

        double raceLengthValue = this.RaceLengthValue ?? 0;
        double reserve = this.FuelReserveLaps ?? defaultReserveLaps;
        error = PlanLimits.RaceLengthError(raceLengthFormat, raceLengthValue)
            ?? PlanLimits.FuelReserveError(reserve)
            ?? (this.AvgLapTimeSeconds is { } lapTime ? PlanLimits.LapTimeError(lapTime) : null)
            ?? (this.FuelPerLapLiters is { } perLap ? PlanLimits.FuelPerLapError(perLap) : null)
            ?? "";
        if (error.Length > 0)
        {
            return false;
        }

        PlanContext context = new PlanContext(this.Game?.Trim() ?? "", this.Car?.Trim() ?? "", this.Track?.Trim() ?? "");
        inputs = new PlanFuelInputs(context, raceLengthFormat, raceLengthValue, (int)reserve, this.AvgLapTimeSeconds, this.FuelPerLapLiters);
        return true;
    }
}
