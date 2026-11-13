using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// What the lap-history corpus says about running one car at one track (#50): the median lap
/// time and fuel per lap over valid laps, each with how many laps it rests on, and the largest
/// tank the recorder saw on that car. Each figure is null when no lap supplies it — imported laps
/// carry a time but never fuel, so a context can have one without the other.
/// </summary>
public sealed record FuelHistoryFigures(
    double? LapTimeSeconds,
    int LapTimeLaps,
    double? FuelPerLapLiters,
    int FuelLaps,
    double? TankLiters)
{
    public static FuelHistoryFigures None { get; } = new(null, 0, null, 0, null);

    /// <summary>Both figures an estimate needs, so a plan does not have to ask for them.</summary>
    public bool IsComplete => this.LapTimeSeconds is not null && this.FuelPerLapLiters is not null;

    /// <summary>
    /// The figures for <paramref name="context"/> over <paramref name="sessions"/>. Only valid,
    /// timed laps count (the corpus rule); <paramref name="onlyKind"/> narrows them to one session
    /// type. A lap's fuel counts only where the recorder measured it — never a session's first lap
    /// or a lap with a refuel, which it files as null. Medians, like every corpus statistic: the
    /// corpus is full of traffic laps and offs.
    /// </summary>
    public static FuelHistoryFigures From(IEnumerable<LapHistorySession> sessions, PlanContext context, HistorySessionKind? onlyKind)
    {
        ArgumentNullException.ThrowIfNull(sessions);
        ArgumentNullException.ThrowIfNull(context);
        // The corpus is keyed on exact strings; a plan without a car or track has no bucket.
        if (string.IsNullOrWhiteSpace(context.Car) || string.IsNullOrWhiteSpace(context.Track))
        {
            return None;
        }

        List<LapHistorySession> matching = sessions
            .Where(session => session.Context.Game == context.Game
                && session.Context.TrackCourse == context.Track
                && session.Context.CarModel == context.Car
                && (onlyKind is null || session.Kind == onlyKind))
            .ToList();
        List<LapHistoryRecord> valid = matching
            .SelectMany(session => session.Laps)
            .Where(lap => lap.IsValid && lap.LapTimeSeconds > 0)
            .ToList();
        List<double> times = valid.Select(lap => lap.LapTimeSeconds).ToList();
        List<double> fuel = valid.Select(lap => lap.FuelUsedLiters).OfType<double>().Where(used => used > 0).ToList();
        List<double> tanks = matching.Select(session => session.Context.FuelCapacityLiters).OfType<double>().Where(tank => tank > 0).ToList();

        return new FuelHistoryFigures(
            Median(times),
            times.Count,
            Median(fuel),
            fuel.Count,
            tanks.Count > 0 ? tanks.Max() : null);
    }

    private static double? Median(List<double> values)
    {
        if (values.Count == 0)
        {
            return null;
        }

        values.Sort();
        int middle = values.Count / 2;
        return values.Count % 2 == 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    }
}

/// <summary>Where a figure in a race estimate came from.</summary>
public enum EstimateSource
{
    /// <summary>The median of the driver's own laps here.</summary>
    History,

    /// <summary>The value the driver typed into the plan, which wins over the history.</summary>
    Plan,
}

/// <summary>One figure of an estimate, its source, and how many laps it rests on (0 for the plan's own value).</summary>
public sealed record EstimateFigure(double Value, EstimateSource Source, int Laps);

/// <summary>
/// The race cut into stints: how many laps a full tank lasts, and the litres each stint takes,
/// in order. The reserve rides in the last stint.
/// </summary>
public sealed record RaceStints(int LapsPerStint, IReadOnlyList<double> Liters);

/// <summary>
/// What the plan dialogs' fuel calculator works from (<c>POST /api/planner/fuel-estimate</c>): the
/// plan's car and track, its race length and reserve, and the lap time and fuel per lap as typed.
/// Null means nothing was typed (empty, or still the pre-fill), and the lap history stands in
/// (<see cref="RaceFuelEstimate.ForInputs"/>).
/// The host builds it inside <see cref="PlanLimits"/>.
/// </summary>
public sealed record PlanFuelInputs(
    PlanContext Context,
    RaceLengthFormat RaceLengthFormat,
    double RaceLengthValue,
    int FuelReserveLaps,
    double? AvgLapTimeSeconds,
    double? FuelPerLapLiters);

/// <summary>
/// The calculator's answer: what the lap history says about the context, which the dialogs
/// pre-fill their fields from and name under them, and the race worked out from the inputs.
/// </summary>
public sealed record PlanFuelPreview(FuelHistoryFigures History, RaceFuelEstimate Estimate);

/// <summary>
/// The race's fuel (#50, #9): its length in laps, the lap time and fuel per lap it rests on, the
/// litres to finish with the plan's reserve on top, and those litres per stint. Built on the host
/// for every plan; the Race card only renders it. Anything that cannot be worked out is null rather
/// than a guess: a garbage lap count would quietly become a garbage fuel figure.
/// </summary>
public sealed record RaceFuelEstimate(
    int? Laps,
    EstimateFigure? LapTime,
    EstimateFigure? FuelPerLap,
    int ReserveLaps,
    double? TotalLiters,
    double? TankLiters,
    RaceStints? Stints)
{
    /// <summary>
    /// The most laps an estimate is worked out for. Past it the figures it rests on are junk (a
    /// glitched median lap of a second, a plan stored before <see cref="PlanLimits"/>), and the
    /// count would overflow an int before it meant anything.
    /// </summary>
    public const int MaxLaps = 100_000;

    /// <summary>
    /// The most stints an estimate cuts a race into. A real race stops a few dozen times at most; a
    /// longer list only comes from absurd figures, and the estimate is built on every state poll.
    /// </summary>
    public const int MaxStints = 100;

    /// <summary>
    /// Every plan's race fuel, keyed by plan id (<c>state.planFuel</c>). The live car's tank
    /// stands in for a missing recorded one only on the active (armed or tracking) plan: that plan
    /// is the one being driven in the car the game reports, while another plan's car may hold a
    /// different tank. Indexed rather than ToDictionary: a hand-copied plan file sharing an id must
    /// not fail every state poll.
    /// </summary>
    public static Dictionary<string, RaceFuelEstimate> ForPlans(IEnumerable<SessionPlan> plans, IFuelHistorySource history, double? liveTankLiters)
    {
        ArgumentNullException.ThrowIfNull(plans);
        ArgumentNullException.ThrowIfNull(history);
        Dictionary<string, RaceFuelEstimate> fuel = new(StringComparer.Ordinal);
        foreach (SessionPlan plan in plans)
        {
            bool active = plan.Status is PlanStatus.Armed or PlanStatus.Tracking;
            fuel[plan.Id] = For(plan, history.ForRace(new PlanContext(plan.Game, plan.Car, plan.Track)), active ? liveTankLiters : null);
        }

        return fuel;
    }

    /// <summary>
    /// A figure the driver typed into the plan wins; the history fills in where the plan has none
    /// (the dialogs save a figure left at its pre-fill from the laps as null, so it keeps following
    /// new laps). A time-based race is its minutes over the lap time, with the lap that is running when time is
    /// up driven to the end. Stints need the tank: the largest a recorded drive in the car saw, else
    /// <paramref name="liveTankLiters"/>, the tank of the car being driven now (a plan whose car or
    /// track is spelled unlike the history, or a race-laps-only setting with no race yet, still gets
    /// its stints). A lap count past <see cref="MaxLaps"/> or a cut past <see cref="MaxStints"/> is
    /// left out and the reserve is held to what the planner accepts, so no stored plan makes this expensive.
    /// </summary>
    public static RaceFuelEstimate For(SessionPlan plan, FuelHistoryFigures history, double? liveTankLiters = null)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(history);

        return Build(
            plan.RaceLengthFormat,
            plan.RaceLengthValue,
            Typed(plan.AvgLapTimeSeconds) ?? FromHistory(history.LapTimeSeconds, history.LapTimeLaps),
            Typed(plan.FuelPerLapLiters) ?? FromHistory(history.FuelPerLapLiters, history.FuelLaps),
            plan.FuelReserveLaps,
            history.TankLiters ?? liveTankLiters);
    }

    /// <summary>
    /// The plan dialogs' calculator (<c>POST /api/planner/fuel-estimate</c>), by the same rule as
    /// <see cref="For"/>: a typed figure wins and the history fills a field left empty or at its
    /// pre-fill. Tank, limits and rounding are the plan's.
    /// </summary>
    public static RaceFuelEstimate ForInputs(PlanFuelInputs inputs, FuelHistoryFigures history, double? liveTankLiters = null)
    {
        ArgumentNullException.ThrowIfNull(inputs);
        ArgumentNullException.ThrowIfNull(history);

        return Build(
            inputs.RaceLengthFormat,
            inputs.RaceLengthValue,
            Typed(inputs.AvgLapTimeSeconds) ?? FromHistory(history.LapTimeSeconds, history.LapTimeLaps),
            Typed(inputs.FuelPerLapLiters) ?? FromHistory(history.FuelPerLapLiters, history.FuelLaps),
            inputs.FuelReserveLaps,
            history.TankLiters ?? liveTankLiters);
    }

    private static RaceFuelEstimate Build(
        RaceLengthFormat format,
        double length,
        EstimateFigure? lapTime,
        EstimateFigure? fuelPerLap,
        int reserveLaps,
        double? tank)
    {
        int reserve = Math.Clamp(reserveLaps, 0, SessionPlannerSettings.MaxFuelReserveLaps);
        double? tankLiters = tank is { } liters && double.IsFinite(liters) && liters > 0 ? liters : null;

        double? raceLaps = format switch
        {
            RaceLengthFormat.LapBased when length > 0 => Math.Round(length),
            RaceLengthFormat.TimeBased when length > 0 && lapTime is not null => Math.Ceiling(length * 60 / lapTime.Value),
            _ => null,
        };
        int? laps = raceLaps is { } count && count <= MaxLaps ? (int)count : null;

        double? total = laps is { } totalLaps && fuelPerLap is not null ? (totalLaps + reserve) * fuelPerLap.Value : null;
        RaceStints? stints = laps is { } stintRaceLaps && fuelPerLap is not null && tankLiters is { } fullTank
            ? CutIntoStints(stintRaceLaps + reserve, fuelPerLap.Value, fullTank)
            : null;

        return new RaceFuelEstimate(laps, lapTime, fuelPerLap, reserve, total, tankLiters, stints);
    }

    private static EstimateFigure? FromHistory(double? value, int laps) =>
        value is { } median ? new EstimateFigure(median, EstimateSource.History, laps) : null;

    private static EstimateFigure? Typed(double? value) =>
        value is { } typed && typed > 0 ? new EstimateFigure(typed, EstimateSource.Plan, 0) : null;

    /// <summary>Null past <see cref="MaxStints"/>: a list that long only describes figures that are wrong.</summary>
    private static RaceStints? CutIntoStints(int fuelLaps, double perLap, double tank)
    {
        // A tank that cannot hold a whole lap still runs a lap per stop rather than none.
        int perStint = (int)Math.Clamp(Math.Floor(tank / perLap), 1, int.MaxValue);
        if (Math.Ceiling(fuelLaps / (double)perStint) > MaxStints)
        {
            return null;
        }

        List<double> liters = [];
        for (int left = fuelLaps; left > 0; left -= perStint)
        {
            liters.Add(Math.Min(perStint, left) * perLap);
        }

        return new RaceStints(perStint, liters);
    }
}
