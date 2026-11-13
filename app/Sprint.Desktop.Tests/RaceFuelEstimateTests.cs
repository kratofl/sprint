using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The race fuel estimate (#50, #9): what the lap history says about a car at a track, and the
/// race's laps, litres and stints worked out from it, falling back to the plan's own values.
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
    public void ImportedLapsGiveATimeButTheFuelComesFromThePlan()
    {
        // Imports carry lap times but never fuel: history supplies what it has, the plan the rest.
        FuelHistoryFigures history = FuelHistoryFigures.From(
            [Session(HistorySessionKind.Race, tank: null, Lap(120, fuel: null), Lap(120, fuel: null))], Spa, onlyKind: null);
        SessionPlan plan = Plan(RaceLengthFormat.LapBased, 20, reserve: 1, avgLapTime: 999, fuelPerLap: 3.0);

        RaceFuelEstimate estimate = RaceFuelEstimate.For(plan, history);

        Assert.False(history.IsComplete);
        Assert.Equal(new EstimateFigure(120, EstimateSource.History, 2), estimate.LapTime);
        Assert.Equal(new EstimateFigure(3.0, EstimateSource.Plan, 0), estimate.FuelPerLap);
        Assert.Equal(20, estimate.Laps);
        Assert.Equal(63, estimate.TotalLiters!.Value, precision: 6);
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
