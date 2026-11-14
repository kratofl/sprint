using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The race fuel estimate (#50, #9): what the lap history says about a car at a track, and the
/// race's laps, litres and stints worked out from it; a figure typed into the plan wins over it.
/// </summary>
public sealed class RaceFuelEstimateTests
{
    private static readonly PlanContext Spa = new("Le Mans Ultimate", "Porsche 963", "Spa-Francorchamps");

    [Fact]
    public void HistoryIsTheMedianOfTheContextsValidLaps()
    {
        LapHistorySession practice = Session(HistorySessionKind.Practice, tank: 88,
            Lap(130, fuel: null),            // a session's first lap: no usage measured
            Lap(126, fuel: 3.2),
            Lap(128, fuel: 3.6),
            Lap(127, fuel: 3.4),
            Lap(150, fuel: 3.0, valid: false)); // an off: never counts
        LapHistorySession race = Session(HistorySessionKind.Race, tank: 90, Lap(129, fuel: 3.5));
        LapHistorySession otherCar = Retitled(Session(HistorySessionKind.Race, tank: 120, Lap(100, fuel: 9.0)), car: "Ferrari 499P");

        FuelHistoryFigures figures = FuelHistoryFigures.From([practice, race, otherCar], Spa, onlyKind: null);

        // Times 126, 127, 128, 129, 130 -> 128; fuel 3.2, 3.4, 3.5, 3.6 -> (3.4 + 3.5) / 2.
        Assert.Equal(128, figures.LapTimeSeconds);
        Assert.Equal(5, figures.LapTimeLaps);
        Assert.Equal(3.45, figures.FuelPerLapLiters!.Value, precision: 6);
        Assert.Equal(4, figures.FuelLaps);
        // The largest tank recorded for this car, never another car's.
        Assert.Equal(90, figures.TankLiters);
        Assert.True(figures.IsComplete);
    }

    [Fact]
    public void TheSettingCanNarrowHistoryToRaceLaps()
    {
        FuelSettingStore store = new([
            Session(HistorySessionKind.Practice, tank: null, Lap(126, fuel: 3.2), Lap(126, fuel: 3.2)),
            Session(HistorySessionKind.Race, tank: null, Lap(131, fuel: 3.6)),
        ]);
        FuelHistorySource setting = FuelHistorySource.AllValidLaps;
        LapHistoryFuelSource source = new(store, () => setting);

        Assert.Equal(3, source.ForRace(Spa).FuelLaps);

        setting = FuelHistorySource.MatchingSessionType;
        FuelHistoryFigures race = source.ForRace(Spa);
        Assert.Equal(1, race.FuelLaps);
        Assert.Equal(131, race.LapTimeSeconds);
    }

    [Fact]
    public void ARepeatAskIsAnsweredFromMemoryUntilALapIsSaved()
    {
        CountingStore inner = new([Session(HistorySessionKind.Race, tank: 90, Lap(126, fuel: 3.2))]);
        CachingLapHistoryStore store = new(inner);
        LapHistoryFuelSource source = new(store, () => FuelHistorySource.AllValidLaps);

        FuelHistoryFigures first = source.ForRace(Spa);

        Assert.Same(first, source.ForRace(Spa));
        Assert.Equal(1, inner.FullReads);

        // The recorder's write drops the corpus. The telemetry loop's read keeps the last figures
        // without reading; the next ask reads it again and counts the new lap.
        store.Save(Session(HistorySessionKind.Race, tank: 90, Lap(127, fuel: 3.4)));
        Assert.Same(first, source.Cached(Spa));
        Assert.Equal(1, inner.FullReads);
        FuelHistoryFigures afterLap = source.ForRace(Spa);

        Assert.Equal(2, afterLap.FuelLaps);
        Assert.Equal(2, inner.FullReads);
        Assert.Same(afterLap, source.ForRace(Spa));
        Assert.Same(afterLap, source.Cached(Spa));
        // A context nothing has asked about has no figures yet, rather than a read.
        Assert.Null(source.Cached(Spa with { Car = "Ferrari 499P" }));
    }

    [Fact]
    public void WithoutARecordedTankTheLiveCarsCutsTheStints()
    {
        SessionPlan plan = Plan(RaceLengthFormat.LapBased, 40, reserve: 1, fuelPerLap: 3.0);

        // 41 laps of fuel at 3 L on a 90 L tank: 30 laps a stint.
        RaceFuelEstimate live = RaceFuelEstimate.For(plan, FuelHistoryFigures.None, liveTankLiters: 90);
        Assert.Equal(90, live.TankLiters);
        Assert.Equal(30, live.Stints!.LapsPerStint);

        // A recorded tank wins over the live one; a live one that is not a tank is none.
        Assert.Equal(60, RaceFuelEstimate.For(plan, new FuelHistoryFigures(null, 0, null, 0, 60), liveTankLiters: 90).TankLiters);
        Assert.Null(RaceFuelEstimate.For(plan, FuelHistoryFigures.None, liveTankLiters: double.NaN).Stints);
        Assert.Null(RaceFuelEstimate.For(plan, FuelHistoryFigures.None, liveTankLiters: 0).Stints);
    }

    [Fact]
    public void OnlyTheActivePlanTakesTheLiveCarsTank()
    {
        SessionPlan armed = Plan(RaceLengthFormat.LapBased, 40, reserve: 1, fuelPerLap: 3.0);
        armed.Id = "armed";
        armed.Status = PlanStatus.Armed;
        SessionPlan draft = Plan(RaceLengthFormat.LapBased, 40, reserve: 1, fuelPerLap: 3.0);
        draft.Id = "draft";

        Dictionary<string, RaceFuelEstimate> fuel = RaceFuelEstimate.ForPlans([armed, draft], NoFuelHistorySource.Instance, liveTankLiters: 90);

        Assert.Equal(90, fuel["armed"].TankLiters);
        Assert.NotNull(fuel["armed"].Stints);
        Assert.Null(fuel["draft"].TankLiters);
        Assert.Null(fuel["draft"].Stints);
    }

    [Fact]
    public void ImportedLapsGiveATimeButTheFuelComesFromThePlan()
    {
        // Imports carry lap times but never fuel: the plan types only the fuel, history the time.
        FuelHistoryFigures history = FuelHistoryFigures.From(
            [Session(HistorySessionKind.Race, tank: null, Lap(120, fuel: null), Lap(120, fuel: null))], Spa, onlyKind: null);
        SessionPlan plan = Plan(RaceLengthFormat.LapBased, 20, reserve: 1, fuelPerLap: 3.0);

        RaceFuelEstimate estimate = RaceFuelEstimate.For(plan, history);

        Assert.False(history.IsComplete);
        Assert.Equal(new EstimateFigure(120, EstimateSource.History, 2), estimate.LapTime);
        Assert.Equal(new EstimateFigure(3.0, EstimateSource.Plan, 0), estimate.FuelPerLap);
        Assert.Equal(20, estimate.Laps);
        Assert.Equal(63, estimate.TotalLiters!.Value, precision: 6);
    }

    [Fact]
    public void AStoredPlansTypedFigureWinsAndAnUntypedOneFollowsTheLaps()
    {
        FuelHistoryFigures history = new(128, 20, 3.4, 18, 90);

        // The driver typed a 2:00 lap: it wins over the 2:08 median. The fuel was left to the laps.
        RaceFuelEstimate typed = RaceFuelEstimate.For(Plan(RaceLengthFormat.TimeBased, 60, reserve: 1, avgLapTime: 120), history);
        Assert.Equal(new EstimateFigure(120, EstimateSource.Plan, 0), typed.LapTime);
        Assert.Equal(new EstimateFigure(3.4, EstimateSource.History, 18), typed.FuelPerLap);
        Assert.Equal(30, typed.Laps);

        // Nothing typed: both follow the laps, and a new median moves the estimate with it.
        SessionPlan untyped = Plan(RaceLengthFormat.TimeBased, 60, reserve: 1);
        Assert.Equal(new EstimateFigure(128, EstimateSource.History, 20), RaceFuelEstimate.For(untyped, history).LapTime);
        Assert.Equal(125, RaceFuelEstimate.For(untyped, history with { LapTimeSeconds = 125, LapTimeLaps = 21 }).LapTime!.Value);
    }

    [Fact]
    public void TheDialogsCalculatorTakesWhatIsTypedAndTheHistoryOnlyForAnUntypedField()
    {
        FuelHistoryFigures history = new(128, 20, 3.4, 18, 90);
        PlanFuelInputs inputs = new(Spa, RaceLengthFormat.TimeBased, 60, FuelReserveLaps: 1, AvgLapTimeSeconds: 120, FuelPerLapLiters: null);

        RaceFuelEstimate estimate = RaceFuelEstimate.ForInputs(inputs, history);

        // The driver's 2:00 wins over the 2:08 median: 30 laps. The empty fuel field takes the
        // median, and 31 laps of fuel at 3.4 L on a 90 L tank are 26 laps, then 5.
        Assert.Equal(new EstimateFigure(120, EstimateSource.Plan, 0), estimate.LapTime);
        Assert.Equal(new EstimateFigure(3.4, EstimateSource.History, 18), estimate.FuelPerLap);
        Assert.Equal(30, estimate.Laps);
        Assert.Equal(31 * 3.4, estimate.TotalLiters!.Value, precision: 6);
        Assert.Equal(26, estimate.Stints!.LapsPerStint);
        Assert.Equal(2, estimate.Stints.Liters.Count);
        // A stored plan with the same figures gets the same answer: one rule for both.
        Assert.Equal(estimate.LapTime, RaceFuelEstimate.For(Plan(RaceLengthFormat.TimeBased, 60, reserve: 1, avgLapTime: 120), history).LapTime);
    }

    [Fact]
    public void ATimedRaceIsItsMinutesOverTheLapTimeCutIntoTanks()
    {
        // 60 min at 125 s: 28.8 laps, the running lap driven out -> 29, +1 reserve = 30 laps of
        // fuel at 3 L. A 50 L tank lasts 16 laps: 48 L, then the last 14 laps' 42 L.
        FuelHistoryFigures history = new(125, 40, 3.0, 40, 50);
        SessionPlan plan = Plan(RaceLengthFormat.TimeBased, 60, reserve: 1);

        RaceFuelEstimate estimate = RaceFuelEstimate.For(plan, history);

        Assert.Equal(29, estimate.Laps);
        Assert.Equal(90, estimate.TotalLiters!.Value, precision: 6);
        Assert.NotNull(estimate.Stints);
        Assert.Equal(16, estimate.Stints.LapsPerStint);
        Assert.Equal([48.0, 42.0], estimate.Stints.Liters);
    }

    [Fact]
    public void WithoutATankThereAreNoStintsAndWithoutALapTimeNoTimedLaps()
    {
        RaceFuelEstimate noTank = RaceFuelEstimate.For(Plan(RaceLengthFormat.LapBased, 30, reserve: 2, fuelPerLap: 2.5), FuelHistoryFigures.None);
        Assert.Equal(80, noTank.TotalLiters!.Value, precision: 6);
        Assert.Null(noTank.Stints);

        // Nothing to divide the minutes by: an unknown, never a guess.
        RaceFuelEstimate noLapTime = RaceFuelEstimate.For(Plan(RaceLengthFormat.TimeBased, 60, reserve: 1, fuelPerLap: 2.5), FuelHistoryFigures.None);
        Assert.Null(noLapTime.Laps);
        Assert.Null(noLapTime.TotalLiters);
    }

    [Fact]
    public void AbsurdFiguresNeverBuildAHugeEstimate()
    {
        // A stored reserve of a billion laps is held to the planner's most: 30 + 10 laps at 3 L.
        RaceFuelEstimate hugeReserve = RaceFuelEstimate.For(Plan(RaceLengthFormat.LapBased, 30, reserve: 1_000_000_000, fuelPerLap: 3), new FuelHistoryFigures(null, 0, null, 0, 90));
        Assert.Equal(SessionPlannerSettings.MaxFuelReserveLaps, hugeReserve.ReserveLaps);
        Assert.Equal(120, hugeReserve.TotalLiters!.Value, precision: 6);
        Assert.Equal(2, hugeReserve.Stints!.Liters.Count);

        // A glitched lap time of a millisecond over a 30-hour race: no lap count rather than an overflow.
        RaceFuelEstimate glitchedLap = RaceFuelEstimate.For(Plan(RaceLengthFormat.TimeBased, 1800, reserve: 1), new FuelHistoryFigures(0.001, 3, 3, 3, 90));
        Assert.Null(glitchedLap.Laps);
        Assert.Null(glitchedLap.Stints);

        // 2000 laps on a tank that holds one: more stops than any race, so no stint list at all.
        RaceFuelEstimate tinyTank = RaceFuelEstimate.For(Plan(RaceLengthFormat.LapBased, 2000, reserve: 1, fuelPerLap: 3), new FuelHistoryFigures(null, 0, null, 0, 4));
        Assert.Equal(2000, tinyTank.Laps);
        Assert.NotNull(tinyTank.TotalLiters);
        Assert.Null(tinyTank.Stints);

        // A tank that holds the race many billion times over is one stint, not an overflow.
        RaceFuelEstimate hugeTank = RaceFuelEstimate.For(Plan(RaceLengthFormat.LapBased, 30, reserve: 0, fuelPerLap: 1e-12), new FuelHistoryFigures(null, 0, null, 0, 90));
        Assert.Single(hugeTank.Stints!.Liters);
    }

    private static SessionPlan Plan(RaceLengthFormat format, double length, int reserve, double? avgLapTime = null, double? fuelPerLap = null) => new()
    {
        Id = "plan",
        Game = Spa.Game,
        Car = Spa.Car,
        Track = Spa.Track,
        RaceLengthFormat = format,
        RaceLengthValue = length,
        FuelReserveLaps = reserve,
        AvgLapTimeSeconds = avgLapTime,
        FuelPerLapLiters = fuelPerLap,
    };

    private static LapHistoryRecord Lap(double time, double? fuel, bool valid = true) => new()
    {
        IsValid = valid,
        LapTimeSeconds = time,
        FuelUsedLiters = fuel,
    };

    private static LapHistorySession Session(HistorySessionKind kind, double? tank, params LapHistoryRecord[] laps) => new()
    {
        Id = Guid.NewGuid().ToString("N"),
        Kind = kind,
        Context = new LapHistoryContext
        {
            Game = Spa.Game,
            TrackCourse = Spa.Track,
            CarModel = Spa.Car,
            FuelCapacityLiters = tank,
        },
        Laps = [.. laps],
    };

    private static LapHistorySession Retitled(LapHistorySession session, string car)
    {
        session.Context.CarModel = car;
        return session;
    }

    /// <summary>An in-memory corpus that counts full reads, each a fresh list as a disk read would be.</summary>
    private sealed class CountingStore(IEnumerable<LapHistorySession> sessions) : ILapHistoryStore
    {
        private readonly List<LapHistorySession> _sessions = [.. sessions];

        public int FullReads { get; private set; }

        public IReadOnlyList<LapHistorySession> LoadAll()
        {
            this.FullReads++;
            return [.. this._sessions];
        }

        public void Save(LapHistorySession session)
        {
            this._sessions.RemoveAll(stored => stored.Id == session.Id);
            this._sessions.Add(session);
        }

        public void Delete(string sessionId) => this._sessions.RemoveAll(stored => stored.Id == sessionId);
    }

    private sealed class FuelSettingStore : ILapHistoryStore
    {
        private readonly IReadOnlyList<LapHistorySession> _sessions;

        public FuelSettingStore(IReadOnlyList<LapHistorySession> sessions)
        {
            this._sessions = sessions;
        }

        public IReadOnlyList<LapHistorySession> LoadAll() => this._sessions;

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();
    }
}
