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

    /// <summary>The value typed into the plan, used when there is no history.</summary>
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
    /// History wins where it has a figure; the plan's typed value fills in where it has none. A
    /// time-based race is its minutes over the lap time, with the lap that is running when time is
    /// up driven to the end. Stints need the tank, which only a recorded drive in the car supplies.
    /// </summary>
    public static RaceFuelEstimate For(SessionPlan plan, FuelHistoryFigures history)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(history);

        EstimateFigure? lapTime = Figure(history.LapTimeSeconds, history.LapTimeLaps, plan.AvgLapTimeSeconds);
        EstimateFigure? fuelPerLap = Figure(history.FuelPerLapLiters, history.FuelLaps, plan.FuelPerLapLiters);
        int reserve = Math.Max(0, plan.FuelReserveLaps);

        int? laps = plan switch
        {
            { RaceLengthFormat: RaceLengthFormat.LapBased, RaceLengthValue: > 0 } => (int)Math.Round(plan.RaceLengthValue),
            { RaceLengthFormat: RaceLengthFormat.TimeBased, RaceLengthValue: > 0 } when lapTime is not null =>
                (int)Math.Ceiling(plan.RaceLengthValue * 60 / lapTime.Value),
            _ => null,
        };

        double? total = laps is { } raceLaps && fuelPerLap is not null ? (raceLaps + reserve) * fuelPerLap.Value : null;
        RaceStints? stints = laps is { } stintRaceLaps && fuelPerLap is not null && history.TankLiters is { } tank
            ? CutIntoStints(stintRaceLaps + reserve, fuelPerLap.Value, tank)
            : null;

        return new RaceFuelEstimate(laps, lapTime, fuelPerLap, reserve, total, history.TankLiters, stints);
    }

    private static EstimateFigure? Figure(double? fromHistory, int historyLaps, double? fromPlan) =>
        fromHistory is { } value
            ? new EstimateFigure(value, EstimateSource.History, historyLaps)
            : fromPlan is { } typed && typed > 0
                ? new EstimateFigure(typed, EstimateSource.Plan, 0)
                : null;

    private static RaceStints CutIntoStints(int fuelLaps, double perLap, double tank)
    {
        // A tank that cannot hold a whole lap still runs a lap per stop rather than none.
        int perStint = Math.Max(1, (int)Math.Floor(tank / perLap));
        List<double> liters = [];
        for (int left = fuelLaps; left > 0; left -= perStint)
        {
            liters.Add(Math.Min(perStint, left) * perLap);
        }

        return new RaceStints(perStint, liters);
    }
}
