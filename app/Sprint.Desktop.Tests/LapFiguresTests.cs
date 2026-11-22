using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The lap figures the telemetry engine works out for the dash from the player's own frames:
/// what each lap uses (<see cref="LapUsageTracker"/>), lap averages and the all-time best
/// (<see cref="LapPaceTracker"/>, <see cref="StoredBestLapDelivery"/>) and what a stop costs
/// (<see cref="PitLossTracker"/>).
/// </summary>
public sealed class LapFiguresTests
{
    private static TelemetryFrame InCar(int lap, float fuel, double sessionTime = 100) => new()
    {
        Session = new SessionInfo { Game = "LMU", Track = "Spa", Car = "Entry #7", SessionType = SessionType.Race, SessionTime = sessionTime, InCar = true },
        Car = new CarState { FuelLiters = fuel },
        Lap = new LapState { CurrentLap = lap },
        Energy = new EnergyState { VirtualEnergy = fuel * 2 },
    };

    private static TelemetryFrame WithTyres(TelemetryFrame frame, float wear, float temp) => frame with
    {
        Tires = [.. frame.Tires.Select(tire => tire with { WearPercent = wear, TempSurfaceCelsius = temp })],
    };

    [Fact]
    public void FuelIsCountedPerWholeLapAndTheStintAverageSkipsYellowLaps()
    {
        LapUsageTracker tracker = new();
        tracker.Augment(InCar(lap: 1, fuel: 60));          // joined mid-lap: lap 1 is not seen whole
        tracker.Augment(InCar(lap: 2, fuel: 59));          // lap 2 starts at 59
        TelemetryFrame lap3 = tracker.Augment(InCar(lap: 3, fuel: 56)); // lap 2 used 3.0
        tracker.Augment(InCar(lap: 3, fuel: 55) with { Flags = new RaceFlags { Yellow = true } });
        tracker.Augment(InCar(lap: 4, fuel: 54));          // lap 3 used 2.0 under yellow
        TelemetryFrame midLap = tracker.Augment(InCar(lap: 4, fuel: 53));
        TelemetryFrame lap5 = tracker.Augment(InCar(lap: 5, fuel: 50.8f)); // lap 4 used 3.2

        Assert.Equal(3.0f, lap3.Car.FuelLastLapLiters);
        Assert.Equal(6.0f, lap3.Energy.VirtualEnergyLastLap);
        Assert.Equal(1.0f, midLap.Car.FuelThisLapLiters);
        Assert.Equal(2.0f, midLap.Car.FuelLastLapLiters);       // the yellow lap is still the last lap
        Assert.Equal(3.0f, midLap.Car.FuelStintPerLapLiters);   // but not in the stint's average
        Assert.Equal(3.2f, lap5.Car.FuelLastLapLiters!.Value, 3);
        Assert.Equal(3.1f, lap5.Car.FuelStintPerLapLiters!.Value, 3);
        Assert.Equal(6.2f, lap5.Energy.VirtualEnergyStintPerLap!.Value, 3);

        // A stop in the box starts a new stint; the refuel makes the lap say nothing about fuel.
        tracker.Augment(InCar(lap: 5, fuel: 48) with { Car = new CarState { FuelLiters = 48, PitState = PitState.Stopped, InPitLane = true } });
        TelemetryFrame refuelled = tracker.Augment(InCar(lap: 5, fuel: 90));
        TelemetryFrame lap6 = tracker.Augment(InCar(lap: 6, fuel: 88));

        Assert.Null(refuelled.Car.FuelThisLapLiters);
        Assert.Null(lap6.Car.FuelLastLapLiters);
        Assert.Null(lap6.Car.FuelStintPerLapLiters);
    }

    [Fact]
    public void ARefuelPouredInOverManyFramesOrAStopInTheBoxMakesTheLapNotCount()
    {
        // LMU adds fuel a little at a time: no single frame rises by much.
        LapUsageTracker tracker = new();
        tracker.Augment(InCar(lap: 1, fuel: 60));
        tracker.Augment(InCar(lap: 2, fuel: 50));
        for (float fuel = 50; fuel <= 55; fuel += 0.1f)
        {
            tracker.Augment(InCar(lap: 2, fuel: fuel));
        }

        Assert.Null(tracker.Augment(InCar(lap: 3, fuel: 54)).Car.FuelLastLapLiters);

        // A stop in the box with no fuel taken: the lap still does not count.
        tracker.Augment(InCar(lap: 3, fuel: 53) with { Car = new CarState { FuelLiters = 53, PitState = PitState.Stopped } });
        Assert.Null(tracker.Augment(InCar(lap: 4, fuel: 52)).Car.FuelLastLapLiters);
        Assert.Equal(2.0f, tracker.Augment(InCar(lap: 5, fuel: 50)).Car.FuelLastLapLiters);
    }

    [Fact]
    public void TyreWearAndTreadTemperatureAreTakenOverTheLastLap()
    {
        LapUsageTracker tracker = new();
        tracker.Augment(WithTyres(InCar(lap: 1, fuel: 60), wear: 100, temp: 80));
        tracker.Augment(WithTyres(InCar(lap: 2, fuel: 59), wear: 99, temp: 80)); // lap 2 starts at 99 %
        tracker.Augment(WithTyres(InCar(lap: 2, fuel: 58), wear: 98.5f, temp: 90));
        TelemetryFrame lap3 = tracker.Augment(WithTyres(InCar(lap: 3, fuel: 57), wear: 97.5f, temp: 70));

        Assert.All(lap3.Tires, tire =>
        {
            Assert.Equal(1.5f, tire.WearLastLapPercent);
            Assert.Equal(85f, tire.AverageTempLastLapCelsius); // the lap's two frames, not the line's
        });
    }

    [Fact]
    public void TheTopSpeedIsTheFastestFrameOfTheLastLapSeenFromTheLine()
    {
        LapUsageTracker tracker = new();
        TelemetryFrame AtSpeed(int lap, float speed) => InCar(lap, fuel: 60) with { Car = new CarState { FuelLiters = 60, SpeedMetersPerSecond = speed } };

        tracker.Augment(AtSpeed(lap: 1, speed: 90));            // joined mid-lap: lap 1 is not seen whole
        TelemetryFrame lap2 = tracker.Augment(AtSpeed(lap: 2, speed: 40));
        tracker.Augment(AtSpeed(lap: 2, speed: 85.5f));
        tracker.Augment(AtSpeed(lap: 2, speed: 60));
        TelemetryFrame lap3 = tracker.Augment(AtSpeed(lap: 3, speed: 88)); // the line belongs to lap 3

        Assert.Null(lap2.Lap.LastLapTopSpeedMetersPerSecond);
        Assert.Equal(85.5f, lap3.Lap.LastLapTopSpeedMetersPerSecond);
        Assert.Null(tracker.Augment(AtSpeed(lap: 5, speed: 70)).Lap.LastLapTopSpeedMetersPerSecond); // a lap missed
    }

    [Fact]
    public void LapAveragesCountTheLastValidLapsOnceTheGameHasTimedThem()
    {
        LapPaceTracker tracker = new();
        tracker.Augment(Lap(1, last: 0, lastValid: true));
        double[] times = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
        for (int i = 0; i < times.Length; i++)
        {
            // Lap i + 1 ends; scoring times it a frame after the lap number moves on. The fifth
            // lap is invalid and never counts.
            bool valid = i != 4;
            double previous = i == 0 ? 0 : times[i - 1];
            tracker.Augment(Lap(i + 2, last: previous, lastValid: valid));
            tracker.Augment(Lap(i + 2, last: times[i], lastValid: valid));
        }

        TelemetryFrame frame = tracker.Augment(Lap(12, last: 110, lastValid: true));

        Assert.Equal((106 + 107 + 108 + 109 + 110) / 5.0, frame.Lap.LastFiveLapsAverage);
        Assert.Equal((101 + 102 + 103 + 105 + 106 + 107 + 108 + 109 + 110 + 100) / 10.0, frame.Lap.LastTenLapsAverage);
        Assert.Equal(100, frame.Lap.AllTimeBestLapTime);
    }

    [Fact]
    public void TheAllTimeBestIsTheStoredBestForThisTrackAndCarUnlessThisSessionWasFaster()
    {
        LapPaceTracker tracker = new();
        tracker.SetStoredBest(new StoredBestLap("LMU", "Spa", "Entry #7", 98.5));
        Assert.Equal(98.5, tracker.Augment(Lap(3, last: 0, lastValid: true)).Lap.AllTimeBestLapTime);
        Assert.Equal(97.25, tracker.Augment(Lap(3, last: 0, lastValid: true) with { Lap = new LapState { CurrentLap = 3, BestLapTime = 97.25 } }).Lap.AllTimeBestLapTime);

        tracker.SetStoredBest(new StoredBestLap("LMU", "Spa", "Another car", 90));
        Assert.Null(tracker.Augment(Lap(3, last: 0, lastValid: true)).Lap.AllTimeBestLapTime);
    }

    [Fact]
    public void TheAllTimeBestKeepsALapFromAnEarlierSessionUntilTheCarChanges()
    {
        LapPaceTracker tracker = new();
        tracker.SetStoredBest(new StoredBestLap("LMU", "Spa", "Entry #7", 99));
        tracker.Augment(Lap(1, last: 0, lastValid: true));
        tracker.Augment(Lap(2, last: 0, lastValid: true));
        Assert.Equal(97.5, tracker.Augment(Lap(2, last: 97.5, lastValid: true)).Lap.AllTimeBestLapTime);

        // Practice ends and qualifying starts: same track and car, so the 97.5 still stands even
        // though the stored best is only looked up again for another car.
        TelemetryFrame qualifying = Lap(1, last: 0, lastValid: true);
        qualifying = qualifying with { Session = qualifying.Session with { SessionType = SessionType.Qualify, SessionTime = 5 } };
        Assert.Equal(97.5, tracker.Augment(qualifying).Lap.AllTimeBestLapTime);

        TelemetryFrame otherCar = qualifying with { Session = qualifying.Session with { Car = "Entry #8" } };
        Assert.Null(tracker.Augment(otherCar).Lap.AllTimeBestLapTime);
    }

    [Fact]
    public void TheStoredBestIsLookedUpOncePerContextFromValidLaps()
    {
        CountingStore store = new(
        [
            Session("Spa", "Entry #7", (99.0, true), (95.0, false), (97.5, true)),
            Session("Spa", "Another car", (90.0, true)),
        ]);
        List<StoredBestLap?> delivered = [];
        StoredBestLapDelivery delivery = new(store, delivered.Add);

        delivery.Observe(InCar(lap: 1, fuel: 60));
        delivery.Observe(InCar(lap: 2, fuel: 59));
        delivery.Observe(InCar(lap: 2, fuel: 59) with { Session = new SessionInfo { Game = "LMU", Track = "Monza", Car = "Entry #7" } });

        Assert.Equal(new StoredBestLap?[] { new("LMU", "Spa", "Entry #7", 97.5), null }, delivered);
        Assert.Equal(2, store.Loads);
    }

    [Fact]
    public void APitStopCostsTheLaneLossPlusTheStandingTime()
    {
        PitLossTracker tracker = new();

        // A 100 s lap round a 1 km track: in at 0.9 of the lap at 100 s, stood 110–135 s, out at
        // 0.05 at 150 s. The lane took 50 s, 25 of them standing, and 15 s of driving the same
        // stretch would have cost anyway: a 10 s lane loss.
        TelemetryFrame frame = Stop(90, 850, inPit: false, PitState.None);
        frame = Stop(100, 900, inPit: true, PitState.Entering);
        Assert.Null(frame.Lap.PitLossSeconds);
        Stop(110, 950, inPit: true, PitState.Stopped);
        Stop(135, 950, inPit: true, PitState.Exiting);
        frame = Stop(150, 50, inPit: false, PitState.None);

        Assert.Equal(35.0, frame.Lap.PitLossSeconds);

        TelemetryFrame Stop(double time, double lapDistance, bool inPit, PitState state) => tracker.Augment(new TelemetryFrame
        {
            Session = new SessionInfo { Track = "Spa", SessionType = SessionType.Race, SessionTime = time, TrackLengthMeters = 1000 },
            Field = [new FieldCar { Id = 1, CarClass = "Hyper", IsPlayer = true, LapDistanceMeters = lapDistance, InPitLane = inPit, PitState = state, BestLapTime = 100 }],
        });
    }

    private static TelemetryFrame Lap(int lap, double last, bool lastValid) => new()
    {
        Session = new SessionInfo { Game = "LMU", Track = "Spa", Car = "Entry #7", SessionType = SessionType.Race, SessionTime = 100, InCar = true },
        Lap = new LapState { CurrentLap = lap, LastLapTime = last, LastLapValid = lastValid },
    };

    private static LapHistorySession Session(string track, string car, params (double Seconds, bool Valid)[] laps) => new()
    {
        Context = new LapHistoryContext { Game = "LMU", TrackCourse = track, CarModel = car },
        Laps = [.. laps.Select(lap => new LapHistoryRecord { LapTimeSeconds = lap.Seconds, IsValid = lap.Valid })],
    };

    private sealed class CountingStore(IReadOnlyList<LapHistorySession> sessions) : ILapHistoryStore
    {
        public int Loads { get; private set; }

        public IReadOnlyList<LapHistorySession> LoadAll()
        {
            this.Loads++;
            return sessions;
        }

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();
    }
}
