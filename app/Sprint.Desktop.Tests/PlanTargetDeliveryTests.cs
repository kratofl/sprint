using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
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
        var delivery = new PlanTargetDelivery(() => PlanWith(RaceTarget()), Corpus());

        var latched = delivery.Observe(RaceFrame(lap: 1));

        Assert.True(latched);
        Assert.Equal(100, delivery.Targets.LapTimeSeconds);
        var reference = Assert.IsType<Sprint.Desktop.Features.Live.DeltaReference>(delivery.Reference);
        Assert.Equal(100, reference.LapTimeSeconds);
        Assert.Equal(0.01, reference.PositionStep);
        Assert.Equal(50, reference.TimesSeconds[50], precision: 6); // half a lap ⇒ half the time
    }

    [Fact]
    public void A_scalar_only_target_delivers_a_time_and_no_reference()
    {
        // An imported lap: a real target time, but nothing describing how it was driven.
        var manual = new PlanTarget { Scope = PlanTargetScope.Manual, LapTimeSeconds = 100 };
        var delivery = new PlanTargetDelivery(() => PlanWith(manual), Corpus());

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
        var delivery = new PlanTargetDelivery(
            () => PlanWith(RaceTarget()),
            new FakeLapHistoryStore([]));

        delivery.Observe(RaceFrame(lap: 1));

        Assert.Equal(100, delivery.Targets.LapTimeSeconds);
        Assert.Null(delivery.Reference);
    }

    [Fact]
    public void A_target_changed_mid_lap_takes_effect_only_at_the_next_line()
    {
        var target = RaceTarget();
        var delivery = new PlanTargetDelivery(() => PlanWith(target), Corpus());

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
        var delivery = new PlanTargetDelivery(() => PlanWith(target), Corpus());

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
        var delivery = new PlanTargetDelivery(() => PlanWith(null), Corpus());

        Assert.True(delivery.Observe(RaceFrame(lap: 1)));

        Assert.True(delivery.Targets.IsEmpty);
        Assert.Null(delivery.Reference);
    }

    [Fact]
    public void No_active_plan_delivers_nothing_at_all()
    {
        var delivery = new PlanTargetDelivery(() => null, Corpus());

        delivery.Observe(RaceFrame(lap: 1));

        Assert.True(delivery.Targets.IsEmpty);
        Assert.Null(delivery.Reference);
    }

    [Fact]
    public void A_qualifying_target_is_not_delivered_into_the_race()
    {
        var plan = new SessionPlan
        {
            Id = "plan-1",
            Game = Game,
            Track = Track,
            Car = Car,
            Targets = [new PlanTargets { Kind = SegmentKind.Qualifying, LapTime = RaceTarget() }],
        };
        var delivery = new PlanTargetDelivery(() => plan, Corpus());

        delivery.Observe(RaceFrame(lap: 1, sessionType: SessionType.Race));
        Assert.True(delivery.Targets.IsEmpty);

        delivery.Observe(RaceFrame(lap: 1, sessionType: SessionType.Qualify));
        Assert.Equal(100, delivery.Targets.LapTimeSeconds);
    }

    [Fact]
    public void The_planned_fuel_per_lap_is_delivered_as_a_target()
    {
        var delivery = new PlanTargetDelivery(() => PlanWith(null, fuelPerLapLiters: 3.4), Corpus());

        delivery.Observe(RaceFrame(lap: 1));

        Assert.Equal(3.4, delivery.Targets.FuelPerLapLiters);
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

    private static SessionPlan PlanWith(PlanTarget? lapTime, double? fuelPerLapLiters = null) => new()
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
    };

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
