using System.Text;
using System.Text.Json;
using Sprint.Contracts;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Peer;
using Sprint.Desktop.Features.PitWall;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The pit wall's parts apart from the socket: blobs over datagrams, the driver's board (start
/// places, radar), the engineer's accumulation (sector bests, lap traces) and the layout rules.
/// </summary>
public sealed class PitWallTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 11, 20, 0, 0, TimeSpan.Zero);

    private static readonly string[] Drivers =
    [
        "D. Novak", "R. Lindqvist", "E. Varga", "T. Okafor", "J. Marchetti", "A. Duval",
        "S. Brandt", "M. Haas", "L. Ferreira", "K. Sato", "P. Ivanova", "B. Coleman",
    ];

    [Fact]
    public void ABlobArrivesWholeWhateverTheOrderAndRepeatsOfItsParts()
    {
        byte[] payload = Encoding.UTF8.GetBytes(string.Join(",", Enumerable.Range(0, 4000).Select(index => Guid.NewGuid().ToString("N")[..(index % 30)])));
        IReadOnlyList<PeerBlobMessage> parts = PeerBlobs.Split("board", 7, payload);
        Assert.True(parts.Count > 3);

        PeerBlobAssembler assembler = new();
        byte[]? whole = null;
        foreach (PeerBlobMessage part in parts.Reverse().Prepend(parts[1]))
            whole = assembler.Accept(part) ?? whole;

        Assert.Equal(payload, whole);
        // Once complete, a repeat of the same version is not handed out again.
        Assert.Null(assembler.Accept(parts[0]));
    }

    [Fact]
    public void ANewerVersionDropsTheOneBeingCollectedAndAnOlderOneIsIgnored()
    {
        IReadOnlyList<PeerBlobMessage> old = PeerBlobs.Split("plan", 1, RandomPayload(3000));
        byte[] newer = Encoding.UTF8.GetBytes("{\"id\":\"p2\"}");
        PeerBlobAssembler assembler = new();

        Assert.Null(assembler.Accept(old[0]));
        Assert.Equal(newer, assembler.Accept(PeerBlobs.Split("plan", 2, newer)[0]));
        Assert.All(old.Skip(1), part => Assert.Null(assembler.Accept(part)));
    }

    [Fact]
    public void EverySealedPitWallDatagramFitsOnAnyPath()
    {
        // A full grid with the longest names the game allows, and the busiest radar.
        TelemetryFrame frame = RaceFrame(T0, Grid(60, lapsCompleted: 12, name: new string('W', 32)));
        byte[] board = JsonSerializer.SerializeToUtf8Bytes(new PitWallBoardBuilder().Build(frame), PitWallWire.Json);
        PeerRadarMessage radar = new([.. Enumerable.Range(0, PitWallBoardBuilder.RadarCars).Select(id => new PitWallRadarCar(int.MaxValue - id, new string('W', 32), -39.9, -39.9))]);

        IEnumerable<PeerMessage> messages = PeerBlobs.Split("board", long.MaxValue, board).Cast<PeerMessage>()
            .Concat(PeerBlobs.Split("target", long.MaxValue, RandomPayload(40_000)))
            .Append(radar);

        Assert.All(messages, message => Assert.True(PeerMessage.Serialize(message).Length + PeerChannel.Overhead <= 1200, message.GetType().Name));
    }

    [Fact]
    public void AnUnknownMessageTypeFromANewerPeerIsIgnored() =>
        Assert.Null(PeerMessage.Deserialize("{\"type\":\"weather\",\"rain\":1}"u8));

    [Fact]
    public void StartPlacesAreTheGridAndStayWhileThePlacesChange()
    {
        PitWallBoardBuilder builder = new();
        builder.Build(RaceFrame(T0, Grid(3, lapsCompleted: 0)));
        IReadOnlyList<FieldCar> later = [.. Grid(3, lapsCompleted: 2).Select(car => car with { Place = 4 - car.Place })];

        PitWallBoard board = builder.Build(RaceFrame(T0.AddMinutes(4), later, sessionTime: 240));

        Assert.All(board.Field, car => Assert.Equal(4 - car.Place, car.StartPlace));
        Assert.Equal(1, board.Field[0].Place);
    }

    [Fact]
    public void StartPlacesAreUnknownForARaceJoinedLateAndOutsideARace()
    {
        PitWallBoard late = new PitWallBoardBuilder().Build(RaceFrame(T0, Grid(3, lapsCompleted: 5)));
        PitWallBoard practice = new PitWallBoardBuilder().Build(RaceFrame(T0, Grid(3, lapsCompleted: 0)) with
        {
            Session = new SessionInfo { Track = "Spa", SessionType = SessionType.Practice, TrackLengthMeters = 7004 },
        });

        Assert.All(late.Field, car => Assert.Null(car.StartPlace));
        Assert.All(practice.Field, car => Assert.Null(car.StartPlace));
    }

    [Fact]
    public void ARestartedRaceRecordsItsGridAgain()
    {
        PitWallBoardBuilder builder = new();
        builder.Build(RaceFrame(T0, Grid(2, lapsCompleted: 0), sessionTime: 600));
        IReadOnlyList<FieldCar> swapped = [.. Grid(2, lapsCompleted: 0).Select(car => car with { Place = 3 - car.Place })];

        PitWallBoard restarted = builder.Build(RaceFrame(T0.AddMinutes(1), swapped, sessionTime: 5));

        Assert.All(restarted.Field, car => Assert.Equal(car.Place, car.StartPlace));
    }

    [Fact]
    public void AnImpactSeenHappeningCarriesItsLap()
    {
        PitWallBoardBuilder builder = new();
        TelemetryFrame before = RaceFrame(T0, Grid(1, 3)) with { Damage = new DamageState { LastImpactSessionTime = 100, LastImpactMagnitude = 2 } };
        Assert.Null(builder.Build(before).Car.Damage?.LastImpact?.Lap);

        TelemetryFrame hit = before with
        {
            Lap = new LapState { CurrentLap = 9 },
            Damage = new DamageState { Dents = [0, 2, 0, 0, 0, 0, 0, 1], LastImpactSessionTime = 412.5, LastImpactMagnitude = 14.2 },
        };
        PitWallDamage? damage = builder.Build(hit).Car.Damage;

        Assert.Equal(new PitWallImpact(412.5, 14.2, 9), damage?.LastImpact);
        Assert.Equal(new[] { 0, 2, 0, 0, 0, 0, 0, 1 }, damage?.Dents);
    }

    [Fact]
    public void RadarPlacesCarsAroundTheDriversHeading()
    {
        // Heading +X (a quarter turn about +Y from -Z): +Z is to the right.
        double half = Math.Sqrt(0.5);
        FieldCar own = Car(1, 1) with { IsPlayer = true, PositionX = 100, PositionZ = 50 };
        TelemetryFrame frame = RaceFrame(T0, [own, Car(2, 2) with { PositionX = 110, PositionZ = 52 }, Car(3, 3) with { PositionX = 300, PositionZ = 50 }]) with
        {
            Car = new CarState { Pose = new CarPose { OrientationY = (float)-half, OrientationW = (float)half } },
        };

        PitWallRadarCar alongside = Assert.Single(PitWallBoardBuilder.Radar(frame));

        Assert.Equal(2, alongside.Id);
        Assert.Equal(10, alongside.Ahead, precision: 1);
        Assert.Equal(2, alongside.Right, precision: 1);
    }

    [Fact]
    public void TheEngineerKeepsEachCarsBestSectors()
    {
        PitWallAccumulator wall = new();
        wall.Board(Board(Entry(5, 1) with { LastSectors = [30.2, 41.0, null] }), T0);
        wall.Board(Board(Entry(5, 1) with { LastSectors = [30.5, 40.1, 33.3] }), T0.AddMinutes(2));

        PitWallCar car = Assert.Single(Assert.IsType<PitWallState>(wall.State(T0)).Field);

        Assert.Equal(new double?[] { 30.2, 40.1, 33.3 }, car.BestSectors);
        Assert.Equal(new double?[] { 30.5, 40.1, 33.3 }, car.LastSectors);
    }

    [Fact]
    public void AnotherTrackStartsTheBestsOver()
    {
        PitWallAccumulator wall = new();
        wall.Board(Board(Entry(5, 1) with { LastSectors = [30.2, 41.0, 33.0] }), T0);
        wall.Board(Board(Entry(5, 1) with { LastSectors = [31.0, 42.0, 34.0] }) with { Session = new PitWallSession { Track = "Monza", SessionType = SessionType.Race } }, T0);

        Assert.Equal(new double?[] { 31.0, 42.0, 34.0 }, Assert.Single(Assert.IsType<PitWallState>(wall.State(T0)).Field).BestSectors);
    }

    [Fact]
    public void TheFirstRacingLapCountsThoughLmuNumbersItZero()
    {
        PitWallAccumulator wall = new();
        wall.Sample(new LiveSample { Lap = 0, TrackPosition = 0.4, SpeedKph = 250 });
        Assert.Single(wall.Trace(PitWallTraceLap.Current).Distance);

        Drive(wall, lap: 0, lapTime: 131.0, valid: true);

        Assert.Equal(0, wall.Trace(PitWallTraceLap.Last).Lap);
        Assert.Equal(131.0, wall.Trace(PitWallTraceLap.Best).LapTime);
    }

    [Fact]
    public void LapTracesFollowTheSamplesByTrackPosition()
    {
        PitWallAccumulator wall = new();
        Drive(wall, lap: 1, lapTime: 125.0, valid: true);
        Drive(wall, lap: 2, lapTime: 123.5, valid: false);
        Drive(wall, lap: 3, lapTime: 124.0, valid: true);
        wall.Sample(new LiveSample { Lap = 4, TrackPosition = 0.0001, LastLapTime = 124.0, SpeedKph = 80 });

        PitWallTrace last = wall.Trace(PitWallTraceLap.Last);
        PitWallTrace best = wall.Trace(PitWallTraceLap.Best);
        PitWallTrace current = wall.Trace(PitWallTraceLap.Current);

        Assert.Equal(3, last.Lap);
        Assert.Equal(124.0, last.LapTime);
        // Lap 2 was quicker but invalid.
        Assert.Equal(3, best.Lap);
        Assert.Equal(124.0, best.LapTime);
        Assert.InRange(last.Distance.Count, 300, PitWallLapTraces.Points);
        Assert.Equal(last.Distance.Order(), last.Distance);
        Assert.All(new[] { last.Speed, last.Throttle, last.Brake, last.Steering }, channel => Assert.Equal(last.Distance.Count, channel.Count));
        Assert.Equal(4, current.Lap);
        Assert.Single(current.Distance);
        Assert.Equal(PitWallTrace.Empty, wall.Trace(PitWallTraceLap.Target));
    }

    [Fact]
    public void PressuresAreKeptPerLapAndAPitStopStartsANewStint()
    {
        PitWallAccumulator wall = new();
        foreach ((int laps, int stops, double kpa) in new[] { (3, 0, 170.0), (4, 0, 172.0), (5, 0, 173.0), (5, 1, 165.0), (6, 1, 168.0) })
            wall.Board(Board(Entry(1, 1) with { IsPlayer = true, LapsCompleted = laps, PitStops = stops }) with { Car = Status(kpa) }, T0);

        PitWallLapPressures lap = Assert.Single(Assert.IsType<PitWallState>(wall.State(T0)).Pressures);

        Assert.Equal(new PitWallLapPressures(6, 168, 168, 168, 168), lap);
    }

    [Fact]
    public void RadarGoesQuietWhenItStopsArriving()
    {
        PitWallAccumulator wall = new();
        wall.Board(Board(Entry(1, 1)), T0);
        wall.Radar([new PitWallRadarCar(2, "R. Lindqvist", 2, 1)], T0);

        Assert.Single(Assert.IsType<PitWallState>(wall.State(T0.AddMilliseconds(500))).Radar);
        Assert.Empty(Assert.IsType<PitWallState>(wall.State(T0.AddSeconds(2))).Radar);
    }

    [Fact]
    public void AStoredLapIsThinnedToTheTracePointBudget()
    {
        LapChannelTraceFixture stored = new(2001);

        PitWallTrace? trace = PitWallPlanShare.FromStored(stored.Trace, 12, 124.25);

        Assert.NotNull(trace);
        Assert.InRange(trace.Distance.Count, 500, PitWallLapTraces.Points);
        Assert.Equal(0, trace.Distance[0]);
        Assert.Equal(12, trace.Lap);
        Assert.Equal(124.25, trace.LapTime);
    }

    [Fact]
    public void TheDefaultLayoutIsValidAndCoversTheMockups()
    {
        Assert.Null(PitWallLayouts.Check(PitWallLayouts.Default));
        Assert.Equal(new[] { "Race", "Car", "Traces" }, PitWallLayouts.Default.Pages.Select(page => page.Name));
        Assert.Equal(PitWallLayouts.Kinds.Order(), PitWallLayouts.Default.Pages.SelectMany(page => page.Tiles).SelectMany(tile => tile.Layers).Distinct().Order());
    }

    [Theory]
    [InlineData("""{"pages":[]}""", "1 to 12 pages")]
    [InlineData("""{"pages":[{"id":"a","name":"A","tiles":[{"id":"t1","layers":["timing"],"x":0,"y":0,"w":6,"h":4},{"id":"t2","layers":["track"],"x":5,"y":3,"w":2,"h":2}]}]}""", "overlaps")]
    [InlineData("""{"pages":[{"id":"a","name":"A","tiles":[{"id":"t1","layers":["weather"],"x":0,"y":0,"w":1,"h":1}]}]}""", "unknown tile kind")]
    [InlineData("""{"pages":[{"id":"a","name":"A","tiles":[{"id":"t1","layers":["timing"],"x":10,"y":0,"w":3,"h":1}]}]}""", "12×8")]
    [InlineData("""{"pages":[{"id":"a","name":"A","tiles":[{"id":"t1","layers":["timing","radar"],"x":0,"y":0,"w":1,"h":1,"cycleSeconds":2}]}]}""", "3 to 120 seconds")]
    [InlineData("""{"pages":[{"id":"a","name":"A","tiles":[]},{"id":"a","name":"B","tiles":[]}]}""", "used twice")]
    [InlineData("""{"pages":[{"id":"a","name":"   ","tiles":[]}]}""", "1 to 40 characters")]
    [InlineData("""{"pages":[{"id":"a","name":"This page name is far too long to fit a tab","tiles":[]}]}""", "1 to 40 characters")]
    [InlineData("""{"pages":[{"id":"a","name":"A","tiles":[{"id":"t1","layers":["timing","radar","track","fuel","stint","tyres","damage"],"x":0,"y":0,"w":1,"h":1}]}]}""", "1 to 6 layers")]
    public void AnInvalidLayoutIsRefusedWithTheReason(string json, string reason)
    {
        using JsonDocument document = JsonDocument.Parse(json);

        Assert.False(PitWallLayouts.TryParse(document.RootElement, null, out _, out string error));
        Assert.Contains(reason, error, StringComparison.Ordinal);
    }

    [Fact]
    public void ALayoutIsKeptAcrossARestartWithItsWindows()
    {
        string root = Path.Combine(Path.GetTempPath(), "Sprint.PitWallTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            PitWallLayoutStore store = new(root);
            string json = """{"pages":[{"id":"strategy","name":"Strategy","detached":true,"tiles":[{"id":"s1","layers":["fuel","stint"],"x":0,"y":0,"w":6,"h":4,"cycleSeconds":10,"pauseOnHover":true,"jumpRadar":false,"jumpDamage":true,"detached":false,"bounds":null}]}]}""";
            using JsonDocument document = JsonDocument.Parse(json);
            Assert.True(store.TrySave(document.RootElement, out string error), error);
            Assert.True(store.TryPlace(PitWallWindow.Page, "strategy", new PitWallBounds(1920, 0, 1280, 720), out error), error);
            Assert.True(store.TryPlace(PitWallWindow.Main, null, new PitWallBounds(0, 0, 1920, 1080), out error), error);
            Assert.False(store.TryPlace(PitWallWindow.Tile, "nope", new PitWallBounds(0, 0, 10, 10), out _));

            PitWallLayout reloaded = new PitWallLayoutStore(root).Layout;

            PitWallPage page = Assert.Single(reloaded.Pages);
            Assert.Equal(new PitWallBounds(1920, 0, 1280, 720), page.Bounds);
            Assert.Equal(new PitWallBounds(0, 0, 1920, 1080), reloaded.MainBounds);
            PitWallTile tile = Assert.Single(page.Tiles);
            Assert.Equal(new[] { "fuel", "stint" }, tile.Layers);
            Assert.Equal(10, tile.CycleSeconds);
            Assert.True(tile.PauseOnHover && tile.JumpDamage && !tile.JumpRadar);

            store.Reset();
            Assert.Equal(
                PitWallLayouts.Default.Pages.SelectMany(defaultPage => defaultPage.Tiles).Select(defaultTile => defaultTile.Id),
                new PitWallLayoutStore(root).Layout.Pages.SelectMany(resetPage => resetPage.Tiles).Select(resetTile => resetTile.Id));
            Assert.Equal(new PitWallBounds(0, 0, 1920, 1080), store.Layout.MainBounds);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AnUnreadableLayoutFileIsTheDefault()
    {
        string root = Path.Combine(Path.GetTempPath(), "Sprint.PitWallTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            File.WriteAllText(Path.Combine(root, PitWallLayoutStore.FileName), "{ not json");

            Assert.Same(PitWallLayouts.Default, new PitWallLayoutStore(root).Layout);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AFinishedLapStillReportingThePreviousLapsTimeTakesItsOwnRunningTime()
    {
        PitWallAccumulator wall = new();
        for (int index = 0; index < 2500; index++)
            wall.Sample(new LiveSample { Lap = 2, TrackPosition = index / 2500.0, CurrentLapTime = 124.3 * index / 2500, LastLapTime = 124.6 });

        // The lap number moved on, but the game has not published lap 2's time yet.
        wall.Sample(new LiveSample { Lap = 3, TrackPosition = 0, LastLapTime = 124.6 });

        Assert.Equal(Math.Round(124.3 * 2499 / 2500, 3), wall.Trace(PitWallTraceLap.Last).LapTime);
    }

    [Fact]
    public void EnergyKeepsTheScaleItStartedTheSessionWith()
    {
        PitWallBoardBuilder builder = new();
        TelemetryFrame full = RaceFrame(T0, Grid(1, 3)) with { Energy = new EnergyState { VirtualEnergy = 50, StateOfCharge = 0.6f } };
        Assert.Equal(0.5, builder.Build(full).Car.VirtualEnergy);

        PitWallCarStatus low = builder.Build(full with { Energy = new EnergyState { VirtualEnergy = 0.8f, StateOfCharge = 0.6f } }).Car;

        Assert.Equal(0.008, low.VirtualEnergy ?? 0, precision: 4);
        Assert.Equal(0.6, low.Battery ?? 0, precision: 4);
    }

    [Fact]
    public void AnUnknownBlobKindIsDropped() =>
        Assert.Null(new PeerBlobAssembler().Accept(PeerBlobs.Split("weather", 1, "{}"u8)[0]));

    [Fact]
    public void RadarWithLongNonAsciiNamesStillFitsOneDatagramNearestFirst()
    {
        string name = string.Concat(Enumerable.Repeat("Žćđš", 8));
        IReadOnlyList<PitWallRadarCar> nearestFirst = [.. Enumerable.Range(0, PitWallBoardBuilder.RadarCars)
            .Select(id => new PitWallRadarCar(int.MaxValue - id, name[..PitWallBoardBuilder.RadarNameLength], -10 - id, -39.9))];

        PeerRadarMessage radar = PeerRadarMessage.Fitting(nearestFirst);

        Assert.True(PeerMessage.Serialize(radar).Length + PeerChannel.Overhead <= 1200);
        Assert.InRange(radar.Cars.Count, 1, nearestFirst.Count - 1);
        Assert.Equal(nearestFirst.Take(radar.Cars.Count), radar.Cars);
    }

    [Fact]
    public void RadarCutsLongNames()
    {
        FieldCar own = Car(1, 1) with { IsPlayer = true };
        TelemetryFrame frame = RaceFrame(T0, [own, Car(2, 2) with { Driver = new string('W', 32), PositionX = 3 }]) with
        {
            Car = new CarState { Pose = new CarPose() },
        };

        Assert.Equal(PitWallBoardBuilder.RadarNameLength, Assert.Single(PitWallBoardBuilder.Radar(frame)).Driver.Length);
    }

    [Fact]
    public void ABoardWithoutATrackKeepsWhatTheSessionGathered()
    {
        PitWallAccumulator wall = new();
        wall.Board(Board(Entry(5, 1) with { LastSectors = [30.2, 41.0, 33.0] }), T0);

        wall.Board(Board(Entry(5, 1)) with { Session = new PitWallSession { Track = "", SessionType = SessionType.Unknown } }, T0);

        Assert.Equal(new double?[] { 30.2, 41.0, 33.0 }, Assert.Single(Assert.IsType<PitWallState>(wall.State(T0)).Field).BestSectors);
    }

    [Fact]
    public void AMissingTargetTraceIsReadAgainAfterTheRetry()
    {
        string root = Path.Combine(Path.GetTempPath(), "Sprint.PitWallTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            SessionPlannerService planner = new(new LocalSessionPlanStore(root));
            SessionPlan plan = planner.CreatePlan(new CreatePlanRequest { Name = "Spa 6 Hours", Game = "LeMansUltimate", Car = "Porsche 963", Track = "Spa" });
            plan.SetLapTimeTarget(SegmentKind.Race, new PlanTarget { LapSessionId = "s1", LapNumber = 4, LapTimeSeconds = 124.5 });
            planner.UpdatePlan(plan);
            planner.Arm(plan.Id);
            OneTraceStore store = new();
            DateTimeOffset now = T0;
            PitWallPlanShare share = new(planner, store, () => now);

            Assert.Null(share.Snapshot(SessionType.Race)?.Target);
            store.Trace = new LapChannelTraceFixture(800).Trace;
            now += TimeSpan.FromSeconds(5);
            Assert.Null(share.Snapshot(SessionType.Race)?.Target);
            now += PitWallPlanShare.MissingRetry;

            Assert.Equal(4, share.Snapshot(SessionType.Race)?.Target?.Lap);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    /// <summary>One lap at 20 Hz: 2500 samples round the track, the last one's running time is the lap time.</summary>
    private static void Drive(PitWallAccumulator wall, int lap, double lapTime, bool valid)
    {
        const int samples = 2500;
        for (int index = 0; index < samples; index++)
        {
            double position = index / (double)samples;
            wall.Sample(new LiveSample
            {
                Lap = lap,
                TrackPosition = position,
                CurrentLapTime = lapTime * position,
                LastLapTime = lap > 1 ? 120 : 0,
                LapValid = valid || index < samples / 2,
                SpeedKph = 100 + (100 * position),
                Throttle = position,
            });
        }

        wall.Sample(new LiveSample { Lap = lap + 1, TrackPosition = 0, LastLapTime = lapTime });
    }

    private static byte[] RandomPayload(int length)
    {
        byte[] bytes = new byte[length];
        new Random(length).NextBytes(bytes);
        return bytes;
    }

    private static TelemetryFrame RaceFrame(DateTimeOffset at, IReadOnlyList<FieldCar> field, double sessionTime = 30) => new()
    {
        Timestamp = at,
        Session = new SessionInfo { Track = "Spa", SessionType = SessionType.Race, TrackLengthMeters = 7004, SessionTime = sessionTime, InCar = true },
        Field = field,
    };

    private static IReadOnlyList<FieldCar> Grid(int cars, int lapsCompleted, string? name = null) =>
        [.. Enumerable.Range(1, cars).Select(place => Car(place * 7, place) with
        {
            Driver = name ?? Drivers[(place - 1) % Drivers.Length],
            Car = name ?? $"Team {place} #{place}",
            LapsCompleted = lapsCompleted,
            LapDistanceMeters = 7004 - (place * 15),
            LastLapSector1 = 35.123,
            LastLapSector2 = 54.456,
            LastLapSector3 = 35.789,
            Compound = "Medium",
        })];

    private static FieldCar Car(int id, int place) => new()
    {
        Id = id,
        Driver = Drivers[(place - 1) % Drivers.Length],
        Car = $"#{id}",
        CarClass = "Hypercar",
        Place = place,
        ClassPlace = place,
    };

    private static PitWallCar Entry(int id, int place) => new() { Id = id, Place = place };

    private static PitWallBoard Board(params PitWallCar[] field) =>
        new(new PitWallSession { Track = "Spa", SessionType = SessionType.Race }, field, new PitWallCarStatus());

    private static PitWallCarStatus Status(double kpa) => new()
    {
        Tyres = [.. new[] { TirePosition.FrontLeft, TirePosition.FrontRight, TirePosition.RearLeft, TirePosition.RearRight }
            .Select(position => new PitWallTyre { Position = position, PressureKPa = kpa })],
    };

    /// <summary>A stored lap with every default channel on a grid of <c>samples</c> points.</summary>
    private sealed class LapChannelTraceFixture
    {
        public LapChannelTraceFixture(int samples)
        {
            float[] Ramp() => [.. Enumerable.Range(0, samples).Select(index => index / (float)samples)];
            this.Trace = new LapChannelTrace
            {
                PositionStep = 1.0 / (samples - 1),
                Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
                {
                    [LapTraceChannels.SpeedKph] = Ramp(),
                    [LapTraceChannels.Throttle] = Ramp(),
                    [LapTraceChannels.Brake] = Ramp(),
                    [LapTraceChannels.Steering] = Ramp(),
                },
            };
        }

        public LapChannelTrace Trace { get; }
    }

    /// <summary>A trace store holding at most one trace, handed out for any id.</summary>
    private sealed class OneTraceStore : ILapTraceStore
    {
        public LapChannelTrace? Trace { get; set; }

        public void Save(string traceId, LapChannelTrace trace) => this.Trace = trace;

        public LapChannelTrace? Load(string traceId) => this.Trace;

        public void Delete(string traceId) => this.Trace = null;

        public IReadOnlyList<LapTraceInfo> List() => [];
    }
}
