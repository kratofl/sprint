using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Delivery of a plan's targets to the wheel (#189): which target set is in force, when a
/// change to it takes effect, and which tier the chosen lap can actually deliver.
/// <para>
/// The corpus lap used throughout is a closed-form one — elapsed time at track position
/// <c>p</c> is exactly <c>p * 100</c> — so every expected reference time is arithmetic
/// stated by hand rather than a second implementation of the interpolation.
/// </para>
/// </summary>
public sealed class PlanTargetDeliveryTests
{
    private const string Game = "Le Mans Ultimate";
    private const string Track = "Spa-Francorchamps";
    private const string Car = "Porsche 963";
    private const string SessionId = "hs-q-current";

    [Fact]
    public void A_curve_backed_target_delivers_both_the_reference_and_the_scalar()
    {
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanWith(RaceTarget()), Corpus());
        delivery.ResolveReferences();

        bool latched = delivery.Observe(RaceFrame(lap: 1));

        Assert.True(latched);
        Assert.Equal(100, delivery.Targets.LapTimeSeconds);
        DeltaReference reference = Assert.IsType<Sprint.Desktop.Features.Live.DeltaReference>(delivery.Reference);
        Assert.Equal(100, reference.LapTimeSeconds);
        Assert.Equal(0.01, reference.PositionStep);
        Assert.Equal(50, reference.TimesSeconds[50], precision: 6); // half a lap ⇒ half the time
    }

    [Fact]
    public void A_scalar_only_target_delivers_a_time_and_no_reference()
    {
        // An imported lap: a real target time, but nothing describing how it was driven.
        PlanTarget manual = new PlanTarget { Scope = PlanTargetScope.Manual, LapTimeSeconds = 100 };
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanWith(manual), Corpus());

        delivery.Observe(RaceFrame(lap: 1));

        Assert.Equal(100, delivery.Targets.LapTimeSeconds);
        // A pro-rata delta from a bare time would read as measured. There is nothing to
        // measure against, so the tracker is told nothing and keeps its own comparison.
        Assert.Null(delivery.Reference);
    }

    [Fact]
    public void A_target_whose_lap_lost_its_curve_falls_back_to_the_scalar()
    {
        // The stored target says the lap had a curve; the corpus no longer holds that lap.
        // The claim on the target is not evidence — only the lap itself is.
        PlanTargetDelivery delivery = new PlanTargetDelivery(
            () => PlanWith(RaceTarget()),
            new FakeLapHistoryStore([]));
        delivery.ResolveReferences();

        delivery.Observe(RaceFrame(lap: 1));

        Assert.Equal(100, delivery.Targets.LapTimeSeconds);
        Assert.Null(delivery.Reference);
    }

    [Fact]
    public void A_target_changed_mid_lap_takes_effect_only_at_the_next_line()
    {
        PlanTarget target = RaceTarget();
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanWith(target), Corpus());
        delivery.ResolveReferences();

        // No lap was in progress, so the first frame in the car applies at once.
        Assert.True(delivery.Observe(RaceFrame(lap: 4)));
        Assert.Equal(100, delivery.Targets.LapTimeSeconds);

        // The driver retargets a slower lap while lap 4 is still running. Measuring the rest
        // of lap 4 against a target it was never started with would make the delta a
        // comparison of two different things.
        target = new PlanTarget { Scope = PlanTargetScope.Manual, LapTimeSeconds = 105 };
        Assert.False(delivery.Observe(RaceFrame(lap: 4)));
        Assert.Equal(100, delivery.Targets.LapTimeSeconds);
        Assert.NotNull(delivery.Reference);

        // Crossing the line starts a lap that is driven against the new target, so that is
        // the instant it takes effect.
        Assert.True(delivery.Observe(RaceFrame(lap: 5)));
        Assert.Equal(105, delivery.Targets.LapTimeSeconds);
        Assert.Null(delivery.Reference);
    }

    [Fact]
    public void Clearing_the_target_takes_the_reference_away_at_the_next_line()
    {
        PlanTarget? target = RaceTarget();
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanWith(target), Corpus());
        delivery.ResolveReferences();

        delivery.Observe(RaceFrame(lap: 4));
        Assert.NotNull(delivery.Reference);

        target = null;

        // Still latched to the lap that was started with a target.
        delivery.Observe(RaceFrame(lap: 4));
        Assert.NotNull(delivery.Reference);

        delivery.Observe(RaceFrame(lap: 5));
        Assert.Null(delivery.Reference);
        Assert.Null(delivery.Targets.LapTimeSeconds);
    }

    [Fact]
    public void A_plan_with_no_target_delivers_nothing_at_all()
    {
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanWith(null), Corpus());

        Assert.True(delivery.Observe(RaceFrame(lap: 1)));

        Assert.True(delivery.Targets.IsEmpty);
        Assert.Null(delivery.Reference);
    }

    [Fact]
    public void No_active_plan_delivers_nothing_at_all()
    {
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => null, Corpus());

        delivery.Observe(RaceFrame(lap: 1));

        Assert.True(delivery.Targets.IsEmpty);
        Assert.Null(delivery.Reference);
    }

    [Fact]
    public void A_qualifying_target_is_not_delivered_into_the_race()
    {
        SessionPlan plan = new SessionPlan
        {
            Id = "plan-1",
            Game = Game,
            Track = Track,
            Car = Car,
            Targets = [new PlanTargets { Kind = SegmentKind.Qualifying, LapTime = RaceTarget() }],
        };
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanTargetDelivery.Aim.Of(plan), Corpus());

        delivery.Observe(RaceFrame(lap: 1, sessionType: SessionType.Race));
        Assert.True(delivery.Targets.IsEmpty);

        delivery.Observe(RaceFrame(lap: 1, sessionType: SessionType.Qualify));
        Assert.Equal(100, delivery.Targets.LapTimeSeconds);
    }

    [Fact]
    public void The_planned_fuel_per_lap_is_delivered_as_a_target()
    {
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanWith(null, fuelPerLapLiters: 3.4), Corpus());

        delivery.Observe(RaceFrame(lap: 1));

        Assert.Equal(3.4, delivery.Targets.FuelPerLapLiters);
    }

    [Fact]
    public void A_plan_that_leaves_fuel_to_the_laps_gets_the_laps_figure_as_its_target()
    {
        PlanTargetDelivery delivery = new PlanTargetDelivery(
            () => PlanWith(null),
            Corpus(),
            new FixedFuelHistory(new FuelHistoryFigures(null, 0, 3.6, 9, null)));

        delivery.Observe(RaceFrame(lap: 1));

        Assert.Equal(3.6, delivery.Targets.FuelPerLapLiters);
    }

    [Fact]
    public void A_typed_fuel_per_lap_wins_over_the_laps()
    {
        PlanTargetDelivery delivery = new PlanTargetDelivery(
            () => PlanWith(null, fuelPerLapLiters: 3.4),
            Corpus(),
            new FixedFuelHistory(new FuelHistoryFigures(null, 0, 3.6, 9, null)));

        delivery.Observe(RaceFrame(lap: 1));

        Assert.Equal(3.4, delivery.Targets.FuelPerLapLiters);
    }

    [Fact]
    public void A_legacy_zero_fuel_per_lap_is_not_typed_and_the_laps_figure_stands_in()
    {
        // Plans stored before the planner refused 0 kept it for "not typed"; the Race card shows the
        // laps' median for them, so the wheel must aim at that too rather than at 0 L.
        PlanTargetDelivery delivery = new PlanTargetDelivery(
            () => PlanWith(null, fuelPerLapLiters: 0),
            Corpus(),
            new FixedFuelHistory(new FuelHistoryFigures(null, 0, 3.6, 9, null)));

        delivery.Observe(RaceFrame(lap: 1));

        Assert.Equal(3.6, delivery.Targets.FuelPerLapLiters);
    }

    [Fact]
    public void The_laps_fuel_target_comes_from_what_the_state_poll_worked_out_never_from_the_corpus()
    {
        CountingStore corpus = new(
        [
            new LapHistorySession
            {
                Id = "hs-race",
                Kind = HistorySessionKind.Race,
                Context = new LapHistoryContext { Game = Game, TrackCourse = Track, CarModel = Car },
                Laps = [new LapHistoryRecord { LapNumber = 2, IsValid = true, LapTimeSeconds = 120, FuelUsedLiters = 3.5 }],
            },
        ]);
        LapHistoryFuelSource fuel = new(corpus, () => FuelHistorySource.AllValidLaps);
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanWith(null), Corpus(), fuel);

        // Out of the car the latch applies on every frame, and it still never reads the corpus:
        // nothing has worked the figure out yet, so there is no fuel target rather than a stall.
        delivery.Observe(RaceFrame(lap: 1, inCar: false));
        delivery.Observe(RaceFrame(lap: 1));
        Assert.Equal(0, corpus.Reads);
        Assert.Null(delivery.Targets.FuelPerLapLiters);

        // The state poll asks for the plan's race fuel; the next line picks the figure up.
        fuel.ForRace(new PlanContext(Game, Car, Track));
        Assert.Equal(1, corpus.Reads);
        delivery.Observe(RaceFrame(lap: 2));

        Assert.Equal(3.5, delivery.Targets.FuelPerLapLiters);
        Assert.Equal(1, corpus.Reads);
    }

    [Fact]
    public void The_reference_comes_from_what_a_resolve_found_never_from_the_corpus_at_the_line()
    {
        CountingStore corpus = new CountingStore(Corpus().LoadAll());
        PlanTargetDelivery delivery = new PlanTargetDelivery(() => PlanWith(RaceTarget()), corpus);

        // Out of the car the latch applies on every frame, and neither that nor a line reads the
        // corpus: nothing has resolved the lap yet, so the tracker stays on its session best.
        delivery.Observe(RaceFrame(lap: 1, inCar: false));
        delivery.Observe(RaceFrame(lap: 1));
        Assert.Equal(0, corpus.Reads);
        Assert.Null(delivery.Reference);
        Assert.Equal(100, delivery.Targets.LapTimeSeconds);

        // The state poll resolves the curve mid-lap; the lap in progress keeps what it started with.
        delivery.ResolveReferences();
        Assert.Equal(1, corpus.Reads);
        Assert.False(delivery.Observe(RaceFrame(lap: 1)));
        Assert.Null(delivery.Reference);

        // The next line picks it up, still without a read.
        Assert.True(delivery.Observe(RaceFrame(lap: 2)));
        DeltaReference reference = Assert.IsType<DeltaReference>(delivery.Reference);
        Assert.Equal(50, reference.TimesSeconds[50], precision: 6);
        Assert.Equal(1, corpus.Reads);
    }

    private sealed class FixedFuelHistory(FuelHistoryFigures figures) : IFuelHistorySource
    {
        public FuelHistoryFigures ForRace(PlanContext context) => figures;

        public FuelHistoryFigures? Cached(PlanContext context) => figures;
    }

    /// <summary>A corpus that counts its full reads: the loading path the telemetry loop must never take.</summary>
    private sealed class CountingStore(IReadOnlyList<LapHistorySession> sessions) : ILapHistoryStore
    {
        public int Reads { get; private set; }

        public IReadOnlyList<LapHistorySession> LoadAll()
        {
            this.Reads++;
            return sessions;
        }

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();
    }

    // ---- fixtures ----

    private static TelemetryFrame RaceFrame(
        int lap,
        SessionType sessionType = SessionType.Race,
        bool inCar = true,
        string track = Track) => new()
        {
            Session = new SessionInfo
            {
                Game = Game,
                Track = track,
                Car = Car,
                SessionType = sessionType,
                InCar = inCar,
            },
            Lap = new LapState { CurrentLap = lap },
        };

    private static PlanTarget RaceTarget(bool hasReferenceCurve = true) => new()
    {
        Scope = PlanTargetScope.CurrentQualifying,
        Statistic = PlanTargetStatistic.Fastest,
        LapTimeSeconds = 100,
        SampleSize = 1,
        LapSessionId = SessionId,
        LapNumber = 1,
        HasReferenceCurve = hasReferenceCurve,
    };

    private static PlanTargetDelivery.Aim PlanWith(PlanTarget? lapTime, double? fuelPerLapLiters = null) => PlanTargetDelivery.Aim.Of(new SessionPlan
    {
        Id = "plan-1",
        Game = Game,
        Track = Track,
        Car = Car,
        Status = PlanStatus.Tracking,
        FuelPerLapLiters = fuelPerLapLiters,
        Targets = lapTime is null
            ? []
            : [new PlanTargets { Kind = SegmentKind.Race, LapTime = lapTime }],
    });

    // One recorded lap whose curve is exactly p * 100.
    private static ILapHistoryStore Corpus() => new FakeLapHistoryStore(
    [
        new LapHistorySession
        {
            Id = SessionId,
            Kind = HistorySessionKind.Qualifying,
            Origin = LapHistoryOrigin.Recorded,
            StartedAt = new DateTimeOffset(2026, 7, 31, 18, 0, 0, TimeSpan.Zero),
            Context = new LapHistoryContext { Game = Game, TrackCourse = Track, CarModel = Car },
            Laps =
            [
                new LapHistoryRecord
                {
                    LapNumber = 1,
                    IsValid = true,
                    LapTimeSeconds = 100,
                    ReferenceCurve = new LapReferenceCurve
                    {
                        PositionStep = 0.01,
                        TimesSeconds = [.. Enumerable.Range(0, 101).Select(i => i * 0.01 * 100)],
                    },
                },
            ],
        },
    ]);

    private sealed class FakeLapHistoryStore(IReadOnlyList<LapHistorySession> sessions) : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => sessions;

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();
    }
}
