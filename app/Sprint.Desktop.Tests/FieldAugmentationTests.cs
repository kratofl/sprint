using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// What the telemetry engine reads off the scored field for the dash: the session's sector and lap
/// bests (<see cref="SectorBestsTracker"/>) and the cars alongside (<see cref="Spotter"/>).
/// </summary>
public sealed class FieldAugmentationTests
{
    private static TelemetryFrame Frame(IReadOnlyList<FieldCar> field, double sessionTime = 100, string track = "Spa", CarPose? pose = null) => new()
    {
        Session = new SessionInfo { Track = track, SessionType = SessionType.Race, SessionTime = sessionTime, CarClass = "Hyper" },
        Car = new CarState { Pose = pose },
        Field = field,
    };

    private static FieldCar Car(int id, string carClass, bool player = false, double? s1 = null, double? s2 = null, double? s3 = null, double? best = null) => new()
    {
        Id = id,
        CarClass = carClass,
        IsPlayer = player,
        LastLapSector1 = s1,
        LastLapSector2 = s2,
        LastLapSector3 = s3,
        BestLapTime = best,
    };

    [Fact]
    public void SectorBestsAreKeptPerDriverClassAndSessionAcrossScoringUpdates()
    {
        SectorBestsTracker tracker = new();
        tracker.Augment(Frame([Car(1, "Hyper", player: true, 31.0, 35.0, 37.0), Car(2, "LMP2", s1: 30.5, s2: 36.0, s3: 36.5)]));

        // The next lap: the player is slower in S1 and faster in S3; the faster car's times are gone from scoring.
        LapState lap = tracker.Augment(Frame([Car(1, "Hyper", player: true, 31.5, 35.0, 36.8, best: 103.0), Car(2, "LMP2", best: 102.0)])).Lap;

        Assert.Equal(new double?[] { 31.0, 35.0, 36.8 }, lap.PersonalBestSectorsSeconds);
        Assert.Equal(new double?[] { 30.5, 35.0, 36.5 }, lap.SessionBestSectorsSeconds);
        Assert.Equal(new double?[] { 31.0, 35.0, 36.8 }, lap.ClassBestSectorsSeconds);
        Assert.Equal(102.0, lap.SessionBestLapTime);
        Assert.Equal(103.0, lap.ClassBestLapTime);
    }

    [Fact]
    public void SectorBestsStartOverWhenTheSessionRestartsOrTheTrackChanges()
    {
        SectorBestsTracker tracker = new();
        tracker.Augment(Frame([Car(1, "Hyper", player: true, 31.0, 35.0, 37.0)], sessionTime: 500));

        Assert.Equal(new double?[] { null, null, null }, tracker.Augment(Frame([Car(1, "Hyper", player: true)], sessionTime: 10)).Lap.PersonalBestSectorsSeconds);

        tracker.Augment(Frame([Car(1, "Hyper", player: true, 31.0, 35.0, 37.0)], sessionTime: 20));
        Assert.Equal(new double?[] { null, null, null }, tracker.Augment(Frame([Car(1, "Hyper", player: true)], sessionTime: 30, track: "Monza")).Lap.SessionBestSectorsSeconds);
    }

    [Fact]
    public void AFrameWithoutAFieldPassesUnchanged()
    {
        TelemetryFrame frame = new() { Session = new SessionInfo { Track = "Spa" } };
        Assert.Same(frame, new SectorBestsTracker().Augment(frame));
        Assert.Same(frame, Spotter.Augment(frame));
    }

    // Facing -Z (no rotation): world +X is the driver's right, -Z is ahead.
    private static readonly CarPose Straight = new();

    // Turned 90° left about +Y: forward (-Z in the body) now points along world -X.
    private static readonly CarPose TurnedLeft = new() { OrientationY = MathF.Sqrt(0.5f), OrientationW = MathF.Sqrt(0.5f) };

    private static FieldCar At(int id, float x, float z, bool player = false, bool inPitLane = false) =>
        new() { Id = id, IsPlayer = player, PositionX = x, PositionZ = z, InPitLane = inPitLane };

    [Fact]
    public void TheSpotterNamesTheNearestCarAlongsideOnEachSide()
    {
        TelemetryFrame frame = Frame(
            [At(1, 100, 100, player: true), At(2, 97.5f, 98), At(3, 102.5f, 103.5f), At(4, 102.5f, 101)],
            pose: Straight);

        RaceState race = Spotter.Augment(frame).Race;

        // Car 2 is 2.5 m left and 2 m ahead; on the right car 4 (1 m behind) is nearer than car 3 (3.5 m behind).
        Assert.Equal(2f, race.CarLeftMeters!.Value, 3);
        Assert.Equal(-1f, race.CarRightMeters!.Value, 3);
    }

    [Fact]
    public void TheSpotterReadsSidesInTheCarsOwnFrame()
    {
        // Heading along world -X, a car at world -Z of the player is on its right.
        TelemetryFrame frame = Frame([At(1, 0, 0, player: true), At(2, -1, -2.5f)], pose: TurnedLeft);

        RaceState race = Spotter.Augment(frame).Race;

        Assert.Null(race.CarLeftMeters);
        Assert.Equal(1f, race.CarRightMeters!.Value, 3);
    }

    [Fact]
    public void TheSpotterIgnoresCarsOutOfReachOrInAnotherLane()
    {
        TelemetryFrame frame = Frame(
            [At(1, 0, 0, player: true), At(2, -2.5f, -8), At(3, 6, 0), At(4, 2.5f, 0, inPitLane: true)],
            pose: Straight);

        RaceState race = Spotter.Augment(frame).Race;

        Assert.Null(race.CarLeftMeters);
        Assert.Null(race.CarRightMeters);
    }
}
