using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// The plausible range of a plan's race figures. <c>plan.create</c> and <c>plan.update</c> refuse
/// anything outside it, Quick plan's detection asks rather than take a length outside it, and the
/// New plan dialog mirrors it as its inputs' <c>max</c> (<c>PLAN_LIMITS</c> in
/// <c>SessionPlannerDomain.ts</c>). A typo of 10 000 laps would otherwise become a fuel estimate,
/// and a stint list built on every state poll.
/// </summary>
public static class PlanLimits
{
    /// <summary>The longest race by laps: a 24-hour race on a one-minute circuit stays under it.</summary>
    public const int MaxRaceLaps = 2000;

    /// <summary>The longest timed race, in minutes: 30 hours, the longest session the LMU mapper believes.</summary>
    public const int MaxRaceMinutes = 30 * 60;

    /// <summary>The shortest and longest average lap a plan may type, in seconds.</summary>
    public const double MinLapTimeSeconds = 10;

    public const double MaxLapTimeSeconds = 30 * 60;

    /// <summary>The most fuel per lap a plan may type, in litres.</summary>
    public const double MaxFuelPerLapLiters = 100;

    /// <summary>Why a race length is refused, or null when the race could be run.</summary>
    public static string? RaceLengthError(RaceLengthFormat format, double value) => format switch
    {
        _ when !double.IsFinite(value) || value < 0 => "raceLengthValue must be 0 or more",
        RaceLengthFormat.LapBased when value > MaxRaceLaps => $"a race by laps runs at most {MaxRaceLaps} laps",
        RaceLengthFormat.TimeBased when value > MaxRaceMinutes => $"a timed race runs at most {MaxRaceMinutes} minutes",
        _ => null,
    };

    /// <summary>Why a fuel reserve is refused, or null for a whole number of laps the planner allows.</summary>
    public static string? FuelReserveError(double laps) =>
        laps >= 0 && laps <= SessionPlannerSettings.MaxFuelReserveLaps && Math.Floor(laps) == laps
            ? null
            : $"fuelReserveLaps must be a whole number from 0 to {SessionPlannerSettings.MaxFuelReserveLaps}";

    /// <summary>Why a typed average lap time is refused, or null when it could be a lap.</summary>
    public static string? LapTimeError(double seconds) =>
        seconds >= MinLapTimeSeconds && seconds <= MaxLapTimeSeconds
            ? null
            : $"avgLapTimeSeconds must be from {MinLapTimeSeconds} to {MaxLapTimeSeconds} seconds";

    /// <summary>Why a typed fuel per lap is refused, or null when a car could burn it.</summary>
    public static string? FuelPerLapError(double liters) =>
        liters > 0 && liters <= MaxFuelPerLapLiters
            ? null
            : $"fuelPerLapLiters must be more than 0 and at most {MaxFuelPerLapLiters} litres";
}
