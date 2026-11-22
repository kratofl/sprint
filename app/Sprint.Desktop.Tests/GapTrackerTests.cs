using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// <see cref="GapTracker"/>: gaps timed from where each car was when, fed scoring updates at
/// LMU's 5 Hz with synthetic cars on a 5 km track.
/// </summary>
public sealed class GapTrackerTests
{
    private const double Length = 5000;
    private const double Step = 0.2;

    // What the game itself says, so a test can tell the fallback from a measured gap.
    private const float GameGapAhead = 9.5f;
    private const float GameGapBehind = 8.5f;

    private static TelemetryFrame Frame(double time, params FieldCar[] cars) => new()
    {
        Session = new SessionInfo { Track = "Spa", SessionType = SessionType.Race, SessionTime = time, TrackLengthMeters = Length, InCar = true },
        Race = new RaceState { GapAhead = GameGapAhead, GapBehind = GameGapBehind },
        Field = cars,
    };

    private static FieldCar Car(int id, double totalMeters, int place, bool player = false, double gapToNext = 0, double gapToLeader = 0) => new()
    {
        Id = id,
        Driver = $"Driver {id}",
        CarClass = "Hyper",
        IsPlayer = player,
        Place = place,
        ClassPlace = place,
        LapsCompleted = (int)Math.Floor(totalMeters / Length),
        LapDistanceMeters = totalMeters - (Math.Floor(totalMeters / Length) * Length),
        GapToNext = gapToNext,
        GapToLeader = gapToLeader,
    };

    // A lap's worth of speed: flat out, a hard stop for a slow corner, out of it again.
    private static double Speed(double t) => t switch
    {
        < 5 => 80,
        < 7 => 80 - ((t - 5) * 30),
        < 9 => 20,
        < 12 => 20 + ((t - 9) * 20),
        _ => 80,
    };

    // Distance driven by time t from 1 km into the lap, the speed integrated in 1 ms steps.
    private static double Driven(double t)
    {
        double distance = 1000;
        for (double at = 0; at < t; at += 0.001)
        {
            distance += Speed(at) * 0.001;
        }

        return distance;
    }

    [Fact]
    public void TwoCarsAConstantTimeApartKeepTheirGapWhenBothBrake()
    {
        // The leader drives the profile; the player drives the same profile 1.5 s later.
        const double apart = 1.5;
        GapTracker tracker = new();
        List<float> gaps = [];
        for (double t = apart; t <= 20; t += Step)
        {
            TelemetryFrame frame = tracker.Augment(Frame(t, Car(1, Driven(t), place: 1), Car(2, Driven(t - apart), place: 2, player: true)));
            // Once the leader's history reaches back to where the player is.
            if (t >= (2 * apart) + Step)
            {
                gaps.Add(frame.Race.GapAhead);
                Assert.Equal(frame.Race.GapAhead, frame.Race.PositionGapAhead);
                Assert.Equal(frame.Race.GapAhead, frame.Race.ClassGapAhead);
                Assert.Equal(frame.Race.GapAhead, frame.Race.GapToLeader);
                Assert.Equal(frame.Race.GapAhead, frame.Race.GapToClassLeader);
                Assert.Equal(-frame.Race.GapAhead, frame.Field!.Single(car => car.Id == 1).RelativeGapSeconds!.Value, 3);
            }
        }

        // Through the braking zone (5–7 s for the leader, 6.5–8.5 s for the player) and out of it.
        Assert.All(gaps, gap => Assert.InRange(gap, apart - 0.02, apart + 0.02));
    }

    [Fact]
    public void OutsideARaceTheGapsToPlacesAreTheGamesAndOnlyTheRoadIsTimed()
    {
        // Practice places go by best lap: the car one place ahead is 1.5 s up the road, but the
        // gap to its place is the game's difference in lap time.
        const double apart = 1.5;
        GapTracker tracker = new();
        TelemetryFrame frame = Frame(0);
        for (double t = apart; t <= 15; t += Step)
        {
            TelemetryFrame practice = Frame(t, Car(1, Driven(t), place: 1), Car(2, Driven(t - apart), place: 2, player: true, gapToNext: 0.75, gapToLeader: 0.75));
            frame = tracker.Augment(practice with { Session = practice.Session with { SessionType = SessionType.Practice } });
        }

        Assert.InRange(frame.Race.GapAhead, apart - 0.02, apart + 0.02);
        Assert.Equal(0.75f, frame.Race.PositionGapAhead);
        Assert.Equal(0.75f, frame.Race.GapToLeader);
    }

    [Fact]
    public void TheCarBehindIsTimedThroughThePlayersOwnHistory()
    {
        const double apart = 2.0;
        GapTracker tracker = new();
        TelemetryFrame frame = Frame(0);
        for (double t = apart; t <= 15; t += Step)
        {
            frame = tracker.Augment(Frame(t, Car(1, Driven(t), place: 1, player: true), Car(2, Driven(t - apart), place: 2)));
        }

        Assert.InRange(frame.Race.GapBehind, apart - 0.02, apart + 0.02);
        Assert.InRange(frame.Race.PositionGapBehind!.Value, apart - 0.02, apart + 0.02);
        Assert.InRange(frame.Field!.Single(car => car.Id == 2).RelativeGapSeconds!.Value, apart - 0.02, apart + 0.02);
        Assert.Null(frame.Field!.Single(car => car.IsPlayer).RelativeGapSeconds);
        Assert.Null(frame.Race.GapToLeader); // the player leads
    }

    [Fact]
    public void UntilTheHistoryReachesTheGameGapStandsIn()
    {
        GapTracker tracker = new();
        TelemetryFrame first = tracker.Augment(Frame(100, Car(1, 2100, place: 1), Car(2, 2000, place: 2, player: true, gapToNext: 1.25, gapToLeader: 1.25)));

        Assert.Equal(GameGapAhead, first.Race.GapAhead);
        Assert.Equal(1.25f, first.Race.PositionGapAhead);
        Assert.Equal(1.25f, first.Race.GapToLeader);
        Assert.Null(first.Field!.Single(car => car.Id == 1).RelativeGapSeconds);
    }

    [Fact]
    public void ALappedPlayerIsTimedToTheLeaderByTotalDistanceAndToItOnTheRoadByPosition()
    {
        // 50 m/s round a 1 km lap (20 s a lap). The leader runs 25 s ahead: a lap and 5 s.
        GapTracker tracker = new();
        TelemetryFrame frame = Frame(0);
        for (double t = 0; t <= 40; t += Step)
        {
            frame = tracker.Augment(new TelemetryFrame
            {
                Session = new SessionInfo { Track = "Short", SessionType = SessionType.Race, SessionTime = t, TrackLengthMeters = 1000, InCar = true },
                Field = [OnShort(1, 1250 + (50 * t), place: 1), OnShort(2, 50 * t, place: 2, player: true)],
            });
        }

        Assert.InRange(frame.Race.GapToLeader!.Value, 24.98, 25.02);
        Assert.InRange(frame.Race.GapAhead, 4.98, 5.02); // the same car on the road, a quarter lap up

        static FieldCar OnShort(int id, double total, int place, bool player = false) => new()
        {
            Id = id,
            Driver = $"Driver {id}",
            CarClass = "Hyper",
            IsPlayer = player,
            Place = place,
            ClassPlace = place,
            LapsCompleted = (int)Math.Floor(total / 1000),
            LapDistanceMeters = total % 1000,
        };
    }

    [Fact]
    public void AOneUpdateGlitchAtTheLineIsIgnoredButAConfirmedJumpStartsTheCarOver()
    {
        // Constant 60 m/s, the leader 1 s up.
        GapTracker tracker = new();
        TelemetryFrame frame = Frame(0);
        for (double t = 1; t <= 10; t += Step)
        {
            // At 5 s the leader's lap count runs ahead of its lap distance for one update.
            double glitch = Math.Abs(t - 5) < 0.01 ? Length : 0;
            frame = tracker.Augment(Frame(t, Car(1, 1000 + (60 * t) + glitch, place: 1), Car(2, 1000 + (60 * (t - 1)), place: 2, player: true)));
            if (t > 2.5)
            {
                Assert.InRange(frame.Race.GapAhead, 0.98, 1.02);
            }
        }

        // The leader is taken back to its garage, 3 km back, and stays there: its history starts
        // over and no longer reaches the player, so the game's figures stand in.
        for (double t = 10.2; t <= 11; t += Step)
        {
            frame = tracker.Augment(Frame(t, Car(1, 1000, place: 1) with { InGarage = true }, Car(2, 1000 + (60 * (t - 1)), place: 2, player: true, gapToNext: 3.5)));
        }

        Assert.Equal(3.5f, frame.Race.PositionGapAhead);
        Assert.Equal(GameGapAhead, frame.Race.GapAhead); // nobody else on the road
    }

    [Fact]
    public void ARestartedSessionForgetsEveryCar()
    {
        GapTracker tracker = new();
        for (double t = 100; t <= 105; t += Step)
        {
            tracker.Augment(Frame(t, Car(1, 1000 + (60 * t), place: 1), Car(2, 1000 + (60 * (t - 1)), place: 2, player: true)));
        }

        TelemetryFrame restarted = tracker.Augment(Frame(3, Car(1, 1180, place: 1), Car(2, 1120, place: 2, player: true, gapToNext: 0.75)));

        Assert.Equal(0.75f, restarted.Race.PositionGapAhead);
        Assert.Equal(GameGapAhead, restarted.Race.GapAhead);
    }

    [Fact]
    public void ScoringUpdatesInBetweenFramesReuseOneMeasuredField()
    {
        GapTracker tracker = new();
        FieldCar[] field = [Car(1, 2100, place: 1), Car(2, 2000, place: 2, player: true)];

        TelemetryFrame first = tracker.Augment(Frame(1, field));
        TelemetryFrame second = tracker.Augment(Frame(1, field));

        Assert.Same(first.Field, second.Field);
        TelemetryFrame bare = Frame(1);
        Assert.Same(bare, tracker.Augment(bare)); // no field: unchanged
    }
}
