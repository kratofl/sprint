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

    [Fact]
    public void ALapSprintRecordsItselfCarriesAPositionToTimeCurve()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.True(lap.HasReferenceCurve);
        var curve = lap.ReferenceCurve!;
        // ~0.5 % of the track: 200 intervals from the start of the lap to the finish line.
        Assert.Equal(0.005, curve.PositionStep, precision: 6);
        Assert.Equal(201, curve.TimesSeconds.Count);
        // The lap was driven at constant speed, so elapsed time at position p is exactly
        // p * lapTime — a closed form, not the resampler's own arithmetic.
        Assert.Equal(30.0, curve.TimesSeconds[50], precision: 3);
        Assert.Equal(60.0, curve.TimesSeconds[100], precision: 3);
        Assert.Equal(90.0, curve.TimesSeconds[150], precision: 3);
        Assert.Equal(119.4, curve.TimesSeconds[199], precision: 3);
        Assert.Equal(120.0, curve.TimesSeconds[200], precision: 3);
    }

    [Fact]
    public void ALapJoinedPartWayRoundIsRecordedWithNoCurveRatherThanAMisleadingOne()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // Joining a session in progress: the first half of the lap was never observed, so any
        // curve over it would describe pace nobody saw.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0, fromPosition: 0.5);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        // The lap itself still counts — it is simply a scalar-only target.
        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.Equal(120.0, lap.LapTimeSeconds);
        Assert.Null(lap.ReferenceCurve);
        Assert.False(lap.HasReferenceCurve);
    }

    [Fact]
    public void ALapWhoseTraceStopsLongBeforeTheLineGetsNoCurveEvenThoughItStartedCleanly()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // Observation ended at 60 % of the lap. Flattening the rest to the lap time would
        // read as a car that stopped gaining time through the last third of the circuit.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0, toPosition: 0.6);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.Null(lap.ReferenceCurve);
        Assert.False(lap.HasReferenceCurve);
    }

    [Fact]
    public void ALapSeenAtOnlyAHandfulOfPositionsGetsNoCurve()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // The ends look complete, but a 200-point curve stretched over four readings would
        // invent every corner between them.
        foreach (var position in new[] { 0.0, 0.3, 0.6, 0.9 })
        {
            recorder.Ingest(LapFrame(lap: 1, position, lapTime: position * 120.0));
        }

        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.Null(lap.ReferenceCurve);
        Assert.False(lap.HasReferenceCurve);
    }

    [Fact]
    public void ATripToTheMonitorMidLapDropsTheTraceInsteadOfSplicingTwoStints()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // A quarter of the lap driven, then out of the cockpit, then back on track near the
        // end of the same lap. Joining those two stretches would claim a lap nobody drove.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0, toPosition: 0.25);
        recorder.Ingest(OutOfCarFrame(lap: 1, position: 0.25));
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0, fromPosition: 0.6);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.Null(lap.ReferenceCurve);
        Assert.False(lap.HasReferenceCurve);
    }

    [Fact]
    public void ALapFollowingOneThatWasNeverFiledStillGetsItsOwnCurve()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // The first crossing carries no completed time, so that lap is never filed. The trace
        // still has to start over at the line: otherwise the next lap's positions all sit
        // behind the previous trace's furthest point and it is never sampled at all.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(LapFrame(lap: 2, position: 0, lapTime: 0));
        DriveLap(recorder, lap: 2, lapTimeSeconds: 110.0);
        recorder.Ingest(Crossing(lap: 3, lastLapTime: 110.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.Equal(2, lap.LapNumber);
        Assert.True(lap.HasReferenceCurve);
        // Lap 2 was driven at constant speed to a 110 s total, so half distance is half of it.
        Assert.Equal(55.0, lap.ReferenceCurve!.TimesSeconds[100], precision: 3);
        Assert.Equal(110.0, lap.ReferenceCurve.TimesSeconds[200], precision: 3);
    }

    [Fact]
    public void ARecordedCurveRoundTripsThroughTheLocalStore()
    {
        WithStore((store, root) =>
        {
            var recorder = NewRecorder(store);

            DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
            recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

            var lap = Assert.Single(Assert.Single(new LocalLapHistoryStore(root).LoadAll()).Laps);
            Assert.True(lap.HasReferenceCurve);
            Assert.Equal(0.005, lap.ReferenceCurve!.PositionStep, precision: 6);
            Assert.Equal(201, lap.ReferenceCurve.TimesSeconds.Count);
            Assert.Equal(30.0, lap.ReferenceCurve.TimesSeconds[50], precision: 3);
            Assert.Equal(90.0, lap.ReferenceCurve.TimesSeconds[150], precision: 3);
            Assert.Equal(120.0, lap.ReferenceCurve.TimesSeconds[200], precision: 3);
        });
    }

    [Fact]
    public void ACurveCostsOnlyAFewKilobytesPerLapOnDisk()
    {
        WithStore((store, root) =>
        {
            var recorder = NewRecorder(store);

            // A full practice run's worth of laps in one file: the curve is by far the largest
            // per-lap field, so this is what decides whether the corpus stays cheap to keep.
            for (var lap = 1; lap <= 20; lap++)
            {
                DriveLap(recorder, lap, lapTimeSeconds: 120.0);
                recorder.Ingest(Crossing(lap + 1, lastLapTime: 120.0));
            }

            var session = Assert.Single(new LocalLapHistoryStore(root).LoadAll());
            Assert.Equal(20, session.Laps.Count);
            Assert.All(session.Laps, lap => Assert.True(lap.HasReferenceCurve));

            var bytesPerLap = new FileInfo(Directory.EnumerateFiles(root, "*.json").Single()).Length
                / session.Laps.Count;
            Assert.InRange(bytesPerLap, 1, 4 * 1024);
        });
    }

    [Fact]
    public void ALapWithHalfOfItUnobservedGetsNoCurveEvenThoughItsEndsLookComplete()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // Lap 2 is seen crossing the line and seen again from half distance on, so its first
        // and last samples do span the lap. Nothing in between was observed though, and a
        // curve would draw a straight line through corners nobody saw.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));
        DriveLap(recorder, lap: 2, lapTimeSeconds: 120.0, fromPosition: 0.5);
        recorder.Ingest(Crossing(lap: 3, lastLapTime: 120.0));

        var laps = Assert.Single(store.Sessions).Laps;
        Assert.Equal(2, laps.Count);
        Assert.True(laps[0].HasReferenceCurve);
        Assert.Null(laps[1].ReferenceCurve);
        Assert.False(laps[1].HasReferenceCurve);
    }

    [Fact]
    public void AnImportedLapReportsNoCurveAndSoDoesOneThatCameBackEmpty()
    {
        WithStore((store, root) =>
        {
            var session = NewSession("hs-import", HistorySessionKind.Race);
            session.Origin = LapHistoryOrigin.Imported;
            session.Laps =
            [
                new LapHistoryRecord { LapNumber = 1, LapTimeSeconds = 130.5 },
                // A results file can never carry a trace, and an empty curve is the same tier
                // as none at all: neither may read as a lap that can drive a delta.
                new LapHistoryRecord
                {
                    LapNumber = 2,
                    LapTimeSeconds = 131.0,
                    ReferenceCurve = new LapReferenceCurve(),
                },
            ];
            store.Save(session);

            var loaded = Assert.Single(new LocalLapHistoryStore(root).LoadAll());
            Assert.Equal(LapHistoryOrigin.Imported, loaded.Origin);
            Assert.Null(loaded.Laps[0].ReferenceCurve);
            Assert.All(loaded.Laps, lap => Assert.False(lap.HasReferenceCurve));
        });
    }

    [Fact]
    public void SamplingALapNeverTouchesTheStoreUntilTheLapIsFiled()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);

        // Hundreds of frames have been folded into the lap's shape in memory. Writing per
        // sample instead of per lap would put the disk on the telemetry path a few hundred
        // times a lap.
        Assert.Equal(0, store.Saves);

        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        Assert.Equal(1, store.Saves);
    }

    [Fact]
    public void ANonFinitePositionIsIgnoredRatherThanCostingTheLapItsCurve()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        // A garbage reading at the start of the lap would otherwise become the trace's first
        // sample and then swallow the whole lap: nothing compares true against NaN, so every
        // real sample after it looks like backwards progress.
        recorder.Ingest(LapFrame(lap: 1, position: double.NaN, lapTime: 0));
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.True(lap.HasReferenceCurve);
        Assert.All(lap.ReferenceCurve!.TimesSeconds, time => Assert.True(double.IsFinite(time)));
        Assert.Equal(60.0, lap.ReferenceCurve.TimesSeconds[100], precision: 3);
    }

    [Fact]
    public void TheRecorderFilesAChannelTraceForACompletedLap()
    {
        var store = new CollectingLapHistoryStore();
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(store, traces);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.True(lap.HasChannelTrace);
        // Derived from the session and lap, so a lap and its trace can always find each other.
        Assert.Equal(LapTraceId.For("hs-1", 1), lap.TraceId);

        var trace = traces.Load(lap.TraceId!);
        Assert.NotNull(trace);
        Assert.True(trace!.IsUsable);
        foreach (var name in LapTraceChannels.Default)
        {
            Assert.True(trace.TryGetChannel(name, out var values), $"missing channel {name}");
            Assert.Equal(trace.SampleCount, values.Length);
        }
    }

    [Fact]
    public void TheRecordedChannelsAreTheOnesTheDriverActuallyProduced()
    {
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(new CollectingLapHistoryStore(), traces);

        // LapFrame ramps every input with track position, so mid-lap has a known answer:
        // speed 40 + 30*0.5 = 55 m/s = 198 km/h, throttle 0.5, brake 0.5, half the lap time.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var trace = Assert.Single(traces.All).Value;
        Assert.Equal(198.0, trace.ValueAt(LapTraceChannels.SpeedKph, 0.5)!.Value, 0);
        Assert.Equal(0.5, trace.ValueAt(LapTraceChannels.Throttle, 0.5)!.Value, 2);
        Assert.Equal(0.5, trace.ValueAt(LapTraceChannels.Brake, 0.5)!.Value, 2);
        Assert.Equal(60.0, trace.ValueAt(LapTraceChannels.ElapsedSeconds, 0.5)!.Value, 1);
    }

    [Fact]
    public void TheTraceGridIsSizedFromTheTracksLength()
    {
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(new CollectingLapHistoryStore(), traces);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 200.0, trackLengthMeters: 13_626);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 200.0, trackLengthMeters: 13_626));

        var trace = Assert.Single(traces.All).Value;
        Assert.InRange(trace.PositionStep * 13_626, 1.5, 5.0);
        Assert.Equal(13_626, trace.TrackLengthMeters);
    }

    [Fact]
    public void APracticeLapWithNoPlanArmedStillGetsATrace()
    {
        // The trace tier inherits the always-on recorder's reach: nothing here consults a plan,
        // and practice with no plan armed is precisely the case Live Compare exists for.
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(new CollectingLapHistoryStore(), traces);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        Assert.Single(traces.All);
    }

    [Fact]
    public void APartialLapProducesNeitherACurveNorATrace()
    {
        var store = new CollectingLapHistoryStore();
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(store, traces);

        // Joined at half distance: the same guard both tiers apply, so neither tier appears.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0, fromPosition: 0.5);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.False(lap.HasReferenceCurve);
        Assert.False(lap.HasChannelTrace);
        Assert.Empty(traces.All);
    }

    [Fact]
    public void ARecorderWithNoTraceStoreRecordsLapsThatHonestlyReportNoTrace()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.True(lap.HasReferenceCurve);
        // Not merely "no file": the record must not claim a tier nobody stored.
        Assert.False(lap.HasChannelTrace);
        Assert.Null(lap.TraceId);
    }

    [Fact]
    public void TraceWritingHappensOnTheDispatchHandOffNotTheTelemetryThread()
    {
        // Nothing may reach the disk on the thread that delivered the frame: the engine polls
        // at 200 Hz and a locked disk would stall the read that feeds the wheel screen.
        var traces = new CollectingLapTraceStore();
        var queued = new List<Action>();
        var recorder = new LapHistoryRecorder(
            new CollectingLapHistoryStore(),
            traces,
            clock: () => Now,
            idFactory: () => "hs-1",
            dispatch: queued.Add);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        Assert.Empty(traces.All);
        Assert.NotEmpty(queued);
        foreach (var work in queued)
        {
            work();
        }

        Assert.Single(traces.All);
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

    private static LapHistoryRecorder NewRecorder(ILapHistoryStore store, ILapTraceStore? traces = null)
    {
        var counter = 0;
        return new LapHistoryRecorder(
            store,
            traces,
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
        string car = "Porsche 963",
        // Unknown by default, so the test that asserts an unreported length stays null keeps
        // its premise. Only the lap-driving helpers supply one, because only the channel
        // trace's grid is derived from it.
        double? trackLengthMeters = null) => new()
        {
            Session = new SessionInfo
            {
                Game = "Le Mans Ultimate",
                Track = track,
                Car = car,
                CarClass = "Hypercar",
                TrackLengthMeters = trackLengthMeters,
                SessionType = sessionType,
                InCar = true,
            },
            Lap = new LapState { CurrentLap = lap, LastLapTime = lastLapTime, IsValid = isValid },
        };

    /// <summary>
    /// Drives one lap at constant speed, so elapsed time at track position p is exactly
    /// <c>p * lapTimeSeconds</c> and every resampled value has an independently known
    /// expectation. Sampled finer than the curve's own interval so each curve point is
    /// bracketed by real samples, and on an interval that does not line up with the curve's,
    /// so the interpolation is actually exercised rather than hitting samples head-on.
    /// </summary>
    private static void DriveLap(
        LapHistoryRecorder recorder,
        int lap,
        double lapTimeSeconds,
        double fromPosition = 0.0,
        double toPosition = 1.0,
        double sampleStep = 0.003,
        double? trackLengthMeters = 5000)
    {
        for (var i = 0; ; i++)
        {
            var position = fromPosition + (i * sampleStep);
            if (position >= toPosition)
            {
                return;
            }

            recorder.Ingest(LapFrame(
                lap,
                position,
                position * lapTimeSeconds,
                trackLengthMeters: trackLengthMeters));
        }
    }

    /// <summary>
    /// The start/finish frame: position has wrapped and the lap timer has already reseeded
    /// to the new lap, so the finished lap's total only lives in <c>LastLapTime</c>.
    /// </summary>
    private static TelemetryFrame Crossing(int lap, double lastLapTime, double? trackLengthMeters = 5000) =>
        LapFrame(lap, position: 0, lapTime: 0, lastLapTime, trackLengthMeters);

    /// <summary>A frame from the monitor or the garage: still the same lap, but not driven.</summary>
    private static TelemetryFrame OutOfCarFrame(int lap, double position)
    {
        var frame = LapFrame(lap, position, lapTime: position * 120.0);
        return frame with { Session = frame.Session with { InCar = false } };
    }

    /// <summary>
    /// One frame mid-lap. Every driver input ramps with track position, so a resampled channel
    /// trace has an independently known expectation at each grid point — the same property
    /// <see cref="DriveLap"/> gives elapsed time.
    /// </summary>
    private static TelemetryFrame LapFrame(
        int lap,
        double position,
        double lapTime,
        double lastLapTime = 0,
        double? trackLengthMeters = 5000)
    {
        var frame = Frame(SessionType.Practice, lap, lastLapTime, trackLengthMeters: trackLengthMeters);
        // A NaN position is deliberately fed by one test. Clamping leaves it NaN, and .NET's
        // saturating float-to-int conversion turns (int)NaN into 0, so Gear stays valid; the
        // recorder rejects the frame on its non-finite guard before any of this is sampled.
        var ramp = Math.Clamp(position, 0, 1);
        return frame with
        {
            Car = frame.Car with
            {
                SpeedMetersPerSecond = (float)(40 + (30 * ramp)),
                Throttle = (float)(1 - ramp),
                Brake = (float)ramp,
                Steering = (float)((2 * ramp) - 1),
                Gear = 1 + (int)(ramp * 6),
            },
            Lap = frame.Lap with
            {
                TrackPosition = (float)position,
                CurrentLapTime = lapTime,
            },
        };
    }

    private sealed class CollectingLapHistoryStore : ILapHistoryStore
    {
        private readonly Dictionary<string, LapHistorySession> _sessions = [];

        public IReadOnlyCollection<LapHistorySession> Sessions => _sessions.Values;

        /// <summary>How often the disk was asked for, not how many sessions exist.</summary>
        public int Saves { get; private set; }

        public IReadOnlyList<LapHistorySession> LoadAll() => [.. _sessions.Values];

        public void Save(LapHistorySession session)
        {
            Saves++;
            _sessions[session.Id] = session;
        }

        public void Delete(string sessionId) => _sessions.Remove(sessionId);
    }

    /// <summary>An in-memory <see cref="ILapTraceStore"/>, so recorder tests never touch a disk.</summary>
    private sealed class CollectingLapTraceStore : ILapTraceStore
    {
        public Dictionary<string, LapChannelTrace> All { get; } = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => All[traceId] = trace;

        public LapChannelTrace? Load(string traceId) =>
            All.TryGetValue(traceId, out var trace) ? trace : null;

        public void Delete(string traceId) => All.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() =>
            [.. All.Select(pair => new LapTraceInfo(pair.Key, 0, Now))];
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
