using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for the lap-history corpus (#179): the store boundary, the
/// always-on recorder, and the context key both writers have to agree on. The corpus is
/// deliberately separate from plan history — plans stay a short curated list while this
/// grows to hundreds of sessions.
/// </summary>
public sealed class LapHistoryTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ARecordedSessionRoundTripsThroughTheLocalStore()
    {
        WithStore((store, root) =>
        {
            store.Save(new LapHistorySession
            {
                Id = "hs-1",
                Kind = HistorySessionKind.Practice,
                StartedAt = Now,
                Context = new LapHistoryContext
                {
                    Game = "Le Mans Ultimate",
                    TrackCourse = "Spa-Francorchamps",
                    CarModel = "Porsche 963",
                    CarClass = "Hypercar",
                    TrackLengthMeters = 7004,
                },
                Laps =
                [
                    new LapHistoryRecord { LapNumber = 3, IsValid = true, LapTimeSeconds = 130.5 },
                ],
            });

            var loaded = Assert.Single(new LocalLapHistoryStore(root).LoadAll());

            Assert.Equal("hs-1", loaded.Id);
            Assert.Equal(HistorySessionKind.Practice, loaded.Kind);
            Assert.Equal(Now, loaded.StartedAt);
            Assert.Equal("Spa-Francorchamps", loaded.Context.TrackCourse);
            Assert.Equal("Porsche 963", loaded.Context.CarModel);
            Assert.Equal("Hypercar", loaded.Context.CarClass);
            Assert.Equal(7004, loaded.Context.TrackLengthMeters);
            var lap = Assert.Single(loaded.Laps);
            Assert.Equal(3, lap.LapNumber);
            Assert.Equal(130.5, lap.LapTimeSeconds);
            Assert.True(lap.IsValid);
        });
    }

    [Fact]
    public void ACorruptHistoryFileIsSkippedWithoutLosingTheRestOfTheCorpus()
    {
        WithStore((store, root) =>
        {
            store.Save(NewSession("hs-1", HistorySessionKind.Practice));
            store.Save(NewSession("hs-2", HistorySessionKind.Race));
            File.WriteAllText(Path.Combine(root, "hs-corrupt.json"), "{ not json at all");

            var loaded = new LocalLapHistoryStore(root).LoadAll();

            Assert.Equal(2, loaded.Count);
            Assert.Contains(loaded, session => session.Id == "hs-1");
            Assert.Contains(loaded, session => session.Id == "hs-2");
        });
    }

    [Fact]
    public void DeletingASessionLeavesTheOthersInPlace()
    {
        WithStore((store, root) =>
        {
            store.Save(NewSession("hs-1", HistorySessionKind.Practice));
            store.Save(NewSession("hs-2", HistorySessionKind.Race));

            store.Delete("hs-1");
            store.Delete("hs-missing");

            var remaining = Assert.Single(store.LoadAll());
            Assert.Equal("hs-2", remaining.Id);
        });
    }

    [Theory]
    [InlineData(SessionType.Practice, HistorySessionKind.Practice)]
    [InlineData(SessionType.Qualify, HistorySessionKind.Qualifying)]
    [InlineData(SessionType.Race, HistorySessionKind.Race)]
    [InlineData(SessionType.Warmup, HistorySessionKind.Warmup)]
    [InlineData(SessionType.Unknown, HistorySessionKind.Unknown)]
    public void EveryCompletedLapIsRecordedInEverySessionTypeWithNoPlanArmed(
        SessionType sessionType,
        HistorySessionKind expected)
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // Nothing about this path consults a plan: practice grinding with no plan armed is
        // exactly the case the corpus exists for.
        recorder.Ingest(Frame(sessionType, lap: 1));
        recorder.Ingest(Frame(sessionType, lap: 2, lastLapTime: 131.25));

        var session = Assert.Single(store.Sessions);
        Assert.Equal(expected, session.Kind);
        Assert.Equal(LapHistoryOrigin.Recorded, session.Origin);
        var lap = Assert.Single(session.Laps);
        Assert.Equal(1, lap.LapNumber);
        Assert.Equal(131.25, lap.LapTimeSeconds);
    }

    [Fact]
    public void ACarClassChangeDoesNotSplitTheBucketBecauseClassIsNotPartOfTheKey()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        recorder.Ingest(Frame(SessionType.Practice, lap: 1));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0));
        // The class arrives late or differently spelled; the laps are still the same car at
        // the same track and must stay in one bucket.
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0) with
        {
            Session = Frame(SessionType.Practice, lap: 2).Session with { CarClass = "HYPERCAR" },
        });
        recorder.Ingest(Frame(SessionType.Practice, lap: 3, lastLapTime: 130.0));

        var session = Assert.Single(store.Sessions);
        Assert.Equal(2, session.Laps.Count);
    }

    [Fact]
    public void ADifferentTrackLayoutStartsItsOwnSessionSoAShorterCourseCannotDragTheMedian()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        recorder.Ingest(Frame(SessionType.Practice, lap: 1));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0));
        recorder.Ingest(Frame(SessionType.Practice, lap: 1, track: "Spa-Francorchamps Endurance"));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 128.0, track: "Spa-Francorchamps Endurance"));

        Assert.Equal(2, store.Sessions.Count);
        Assert.Collection(
            store.Sessions.OrderBy(session => session.Context.TrackCourse, StringComparer.Ordinal),
            first => Assert.Equal("Spa-Francorchamps", first.Context.TrackCourse),
            second => Assert.Equal("Spa-Francorchamps Endurance", second.Context.TrackCourse));
    }

    [Fact]
    public void ANewCarStartsItsOwnSession()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        recorder.Ingest(Frame(SessionType.Practice, lap: 1));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0));
        recorder.Ingest(Frame(SessionType.Practice, lap: 1, car: "Peugeot 9X8"));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 132.0, car: "Peugeot 9X8"));

        Assert.Equal(2, store.Sessions.Count);
    }

    [Fact]
    public void ALapIsNotFiledUntilTheGameHasNamedTheTrackAndCar()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // Loading screen: a game name but nothing to file a lap under. Guessing a bucket
        // here would silently corrupt every statistic drawn from it.
        recorder.Ingest(Frame(SessionType.Practice, lap: 1, track: "", car: ""));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0, track: "", car: ""));

        Assert.Empty(store.Sessions);
        Assert.Null(recorder.OpenSession);
    }

    [Fact]
    public void TrackLengthIsRecordedBesideTheKeyAsACrossCheckBetweenWriters()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);
        var frame = Frame(SessionType.Practice, lap: 1) with
        {
            Session = Frame(SessionType.Practice, lap: 1).Session with { TrackLengthMeters = 7004 },
        };

        recorder.Ingest(frame);
        recorder.Ingest(frame with
        {
            Lap = new LapState { CurrentLap = 2, LastLapTime = 131.0, IsValid = true },
        });

        var session = Assert.Single(store.Sessions);
        Assert.Equal(7004, session.Context.TrackLengthMeters);
    }

    [Fact]
    public void AnUnknownTrackLengthStaysNullRatherThanBecomingZero()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        recorder.Ingest(Frame(SessionType.Practice, lap: 1));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0));

        var session = Assert.Single(store.Sessions);
        Assert.Null(session.Context.TrackLengthMeters);
    }

    [Fact]
    public void ARecordedLapCarriesFuelVirtualEnergyAndPerCornerTyreState()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        recorder.Ingest(RichFrame(lap: 1, fuel: 62.5f, virtualEnergy: 88f));
        recorder.Ingest(RichFrame(lap: 2, fuel: 59.0f, virtualEnergy: 84.5f, lastLapTime: 131.0));
        recorder.Ingest(RichFrame(lap: 3, fuel: 55.4f, virtualEnergy: 80.75f, lastLapTime: 130.5));

        var session = Assert.Single(store.Sessions);
        Assert.Equal(2, session.Laps.Count);

        // The first recorded lap has no earlier crossing to measure against, so usage is
        // unknown rather than the whole tank.
        var first = session.Laps[0];
        Assert.Null(first.FuelUsedLiters);
        Assert.Equal(59.0, first.FuelRemainingLiters!.Value, precision: 3);
        Assert.Null(first.VirtualEnergyUsed);
        Assert.Equal(84.5, first.VirtualEnergyRemaining!.Value, precision: 3);

        var second = session.Laps[1];
        Assert.Equal(3.6, second.FuelUsedLiters!.Value, precision: 3);
        Assert.Equal(55.4, second.FuelRemainingLiters!.Value, precision: 3);
        Assert.Equal(3.75, second.VirtualEnergyUsed!.Value, precision: 3);
        Assert.Equal(80.75, second.VirtualEnergyRemaining!.Value, precision: 3);

        Assert.Equal(4, second.Tires.Count);
        var frontLeft = second.Tires[0];
        Assert.Equal(nameof(TirePosition.FrontLeft), frontLeft.Position);
        Assert.Equal(12.5, frontLeft.WearPercent!.Value, precision: 3);
        Assert.Equal("Soft", frontLeft.Compound);
        Assert.Equal(88.0, frontLeft.TempAverageCelsius!.Value, precision: 3);
        Assert.Equal(190.0, frontLeft.PressureKPa!.Value, precision: 3);
    }

    [Fact]
    public void NumericsTheGameDoesNotReportStayNullRatherThanBecomingZero()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        recorder.Ingest(Frame(SessionType.Practice, lap: 1));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.Null(lap.FuelUsedLiters);
        Assert.Null(lap.FuelRemainingLiters);
        Assert.Null(lap.VirtualEnergyUsed);
        Assert.Null(lap.VirtualEnergyRemaining);
        Assert.Empty(lap.Tires);
    }

    [Fact]
    public void RefuellingDoesNotRecordANegativeFuelUsage()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        recorder.Ingest(RichFrame(lap: 1, fuel: 20f, virtualEnergy: 30f));
        recorder.Ingest(RichFrame(lap: 2, fuel: 18f, virtualEnergy: 28f, lastLapTime: 131.0));
        // An in-lap stop refills the tank: the next lap's usage cannot be measured this way.
        recorder.Ingest(RichFrame(lap: 3, fuel: 70f, virtualEnergy: 95f, lastLapTime: 140.0));

        var laps = Assert.Single(store.Sessions).Laps;
        Assert.Equal(2, laps.Count);
        Assert.Null(laps[1].FuelUsedLiters);
        Assert.Null(laps[1].VirtualEnergyUsed);
        Assert.Equal(70.0, laps[1].FuelRemainingLiters!.Value, precision: 3);
    }

    [Fact]
    public void ARecordedLapCarriesItsSectorTimesAndValidity()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);
        var crossing = Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0, isValid: false);

        recorder.Ingest(Frame(SessionType.Practice, lap: 1));
        recorder.Ingest(crossing with
        {
            Lap = crossing.Lap with { LastLapSectorsSeconds = [30.5, 44.75, 55.75] },
        });

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.Equal([30.5, 44.75, 55.75], lap.SectorsSeconds);
        Assert.False(lap.IsValid);
    }

    [Fact]
    public void TheConditionsASessionWasDrivenInAreRecordedAndStayNullWhenUnreported()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);
        var conditions = new SessionConditions
        {
            PathWetness = 0.35,
            TrackGripLevel = 92,
            FixedSetup = true,
        };

        recorder.Ingest(Frame(SessionType.Race, lap: 1) with { Conditions = conditions });
        recorder.Ingest(Frame(SessionType.Race, lap: 2, lastLapTime: 131.0) with { Conditions = conditions });

        var recorded = Assert.Single(store.Sessions).Conditions;
        Assert.Equal(0.35, recorded.PathWetness!.Value, precision: 3);
        Assert.Equal(92, recorded.TrackGripLevel);
        Assert.True(recorded.FixedSetup);
        // An import can never supply these, so they must remain absent rather than default.
        Assert.Null(recorded.FuelMultiplier);
        Assert.Null(recorded.TireMultiplier);
    }

    [Fact]
    public void ProgramTagsExistOnTheRecordButAreNotWrittenYet()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        recorder.Ingest(Frame(SessionType.Practice, lap: 1));
        recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.Null(lap.ProgramType);
        Assert.Null(lap.ProgramId);
        Assert.Null(lap.RunId);
    }

    [Fact]
    public void TheCorpusDoesNotDisturbPlanHistoryOrTheTwoValuedSegmentKind()
    {
        // The corpus exists precisely so hundreds of sessions stay out of the plan list, and
        // so the Q/R tab model, auto-start and segment detail keep their two-valued kind.
        Assert.Equal([SegmentKind.Qualifying, SegmentKind.Race], Enum.GetValues<SegmentKind>());

        var store = new CollectingLapHistoryStore();
        var planRoot = TestEnv.NewTempDataRoot();
        try
        {
            var planner = new SessionPlannerService(new LocalSessionPlanStore(planRoot), clock: () => Now);
            var recorder = NewRecorder(store);

            recorder.Ingest(Frame(SessionType.Practice, lap: 1));
            recorder.Ingest(Frame(SessionType.Practice, lap: 2, lastLapTime: 131.0));

            Assert.Single(store.Sessions);
            Assert.Empty(planner.Plans);
        }
        finally
        {
            Directory.Delete(planRoot, recursive: true);
        }
    }

    [Fact]
    public void RecordingDoesNotBlockTheTelemetryReadThatDeliveredTheFrame()
    {
        using var release = new ManualResetEventSlim(false);
        using var writeStarted = new ManualResetEventSlim(false);
        var store = new BlockingLapHistoryStore(release, writeStarted);
        // The default hand-off, not the synchronous one the other tests inject: a locked or
        // slow disk must not stall the pipeline that produced the frame.
        var recorder = new LapHistoryRecorder(store, clock: () => Now, idFactory: () => "hs-1");

        recorder.Ingest(Frame(SessionType.Race, lap: 1));
        var elapsed = System.Diagnostics.Stopwatch.StartNew();
        recorder.Ingest(Frame(SessionType.Race, lap: 2, lastLapTime: 131.0));
        elapsed.Stop();

        // A synchronous write would still be parked inside Ingest, waiting on `release`.
        Assert.True(writeStarted.Wait(TimeSpan.FromSeconds(5)), "the lap was never written");
        Assert.True(elapsed.Elapsed < TimeSpan.FromSeconds(1), $"Ingest blocked for {elapsed.Elapsed}");
        release.Set();
    }

    [Fact]
    public void AFailingStoreDoesNotPropagateIntoTheTelemetryPath()
    {
        var recorder = new LapHistoryRecorder(
            new ThrowingLapHistoryStore(),
            clock: () => Now,
            idFactory: () => "hs-1",
            dispatch: work => work());

        recorder.Ingest(Frame(SessionType.Race, lap: 1));
        recorder.Ingest(Frame(SessionType.Race, lap: 2, lastLapTime: 131.0));

        // Losing a lap to a bad disk is survivable; taking the telemetry pipeline down is not.
        Assert.Single(recorder.OpenSession!.Laps);
    }

    private sealed class BlockingLapHistoryStore(
        ManualResetEventSlim release,
        ManualResetEventSlim writeStarted) : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => [];

        public void Save(LapHistorySession session)
        {
            writeStarted.Set();
            release.Wait(TimeSpan.FromSeconds(30));
        }

        public void Delete(string sessionId)
        {
        }
    }

    private sealed class ThrowingLapHistoryStore : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => [];

        public void Save(LapHistorySession session) => throw new IOException("disk is unavailable");

        public void Delete(string sessionId) => throw new IOException("disk is unavailable");
    }

    private static TelemetryFrame RichFrame(
        int lap,
        float fuel,
        float virtualEnergy,
        double lastLapTime = 0)
    {
        var basic = Frame(SessionType.Race, lap, lastLapTime);
        return basic with
        {
            Car = new CarState { FuelLiters = fuel },
            Energy = new EnergyState { VirtualEnergy = virtualEnergy },
            Tires =
            [
                Tire(TirePosition.FrontLeft, wear: 12.5f, temp: 88f),
                Tire(TirePosition.FrontRight, wear: 13.0f, temp: 89f),
                Tire(TirePosition.RearLeft, wear: 15.5f, temp: 92f),
                Tire(TirePosition.RearRight, wear: 16.0f, temp: 93f),
            ],
        };
    }

    private static TireState Tire(TirePosition position, float wear, float temp) => new()
    {
        Position = position,
        WearPercent = wear,
        Compound = "Soft",
        TempSurfaceCelsius = temp,
        PressureKPa = 190f,
    };

    private static LapHistoryRecorder NewRecorder(ILapHistoryStore store)
    {
        var counter = 0;
        return new LapHistoryRecorder(
            store,
            clock: () => Now,
            idFactory: () => $"hs-{++counter}",
            dispatch: work => work());
    }

    private static TelemetryFrame Frame(
        SessionType sessionType,
        int lap,
        double lastLapTime = 0,
        bool isValid = true,
        string track = "Spa-Francorchamps",
        string car = "Porsche 963") => new()
        {
            Session = new SessionInfo
            {
                Game = "Le Mans Ultimate",
                Track = track,
                Car = car,
                CarClass = "Hypercar",
                SessionType = sessionType,
                InCar = true,
            },
            Lap = new LapState { CurrentLap = lap, LastLapTime = lastLapTime, IsValid = isValid },
        };

    private sealed class CollectingLapHistoryStore : ILapHistoryStore
    {
        private readonly Dictionary<string, LapHistorySession> _sessions = [];

        public IReadOnlyCollection<LapHistorySession> Sessions => _sessions.Values;

        public IReadOnlyList<LapHistorySession> LoadAll() => [.. _sessions.Values];

        public void Save(LapHistorySession session) => _sessions[session.Id] = session;

        public void Delete(string sessionId) => _sessions.Remove(sessionId);
    }

    private static LapHistorySession NewSession(string id, HistorySessionKind kind) => new()
    {
        Id = id,
        Kind = kind,
        StartedAt = Now,
        Context = new LapHistoryContext
        {
            Game = "Le Mans Ultimate",
            TrackCourse = "Spa-Francorchamps",
            CarModel = "Porsche 963",
        },
    };

    private static void WithStore(Action<LocalLapHistoryStore, string> body)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            body(new LocalLapHistoryStore(root), root);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
