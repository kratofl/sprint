using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.PitWall;

// The pit wall's data: what the driver's desktop sends over the live link and what the engineer's
// shows as state.link.pitWall. JSON names (camelCase) and enum names are the contract with the
// renderer (app/desktop/src/bridge.ts) and, on the wire, with a desktop running another build.

/// <summary>The session as the pit wall header shows it. Temperatures °C; wetness, rain and grip 0..1; times seconds.</summary>
public sealed record PitWallSession
{
    public string Track { get; init; } = "";

    public double? TrackLengthMeters { get; init; }

    public SessionType SessionType { get; init; } = SessionType.Unknown;

    public double? TimeRemaining { get; init; }

    public double? TotalTime { get; init; }

    public int MaxLaps { get; init; }

    public double? AirTemp { get; init; }

    public double? TrackTemp { get; init; }

    /// <summary>Average wetness of the racing line.</summary>
    public double? Wetness { get; init; }

    public double? Raining { get; init; }

    /// <summary>Grip as a fraction; null while no game reports one.</summary>
    public double? Grip { get; init; }

    /// <summary>The game's own grip grade, comparable only with itself (LMU mTrackGripLevel); null when it does not say.</summary>
    public double? GripLevel { get; init; }

    /// <summary>Seconds into the session on the game's clock: what the race control feed is timed by.</summary>
    public double Elapsed { get; init; }

    public SessionPhase Phase { get; init; }

    /// <summary>A local yellow in sector 1, 2, 3; always three entries.</summary>
    public IReadOnlyList<bool> YellowSectors { get; init; } = [false, false, false];
}

/// <summary>One car in the timing table, the track map and the relative. Times in seconds.</summary>
public sealed record PitWallCar
{
    public int Id { get; init; }

    public string Driver { get; init; } = "";

    public string Car { get; init; } = "";

    public string CarClass { get; init; } = "";

    public bool IsPlayer { get; init; }

    public int Place { get; init; }

    public int ClassPlace { get; init; }

    /// <summary>The place the car started the race from, recorded by the driver's desktop; null outside a race or when it joined late.</summary>
    public int? StartPlace { get; init; }

    public int LapsCompleted { get; init; }

    /// <summary>How far round the lap, 0..1.</summary>
    public double LapFraction { get; init; }

    public int Sector { get; init; }

    public double? LastLap { get; init; }

    public double? BestLap { get; init; }

    /// <summary>Sector durations of the last lap, always three entries.</summary>
    public IReadOnlyList<double?> LastSectors { get; init; } = [null, null, null];

    /// <summary>This car's best of each sector seen so far; kept by the engineer's desktop, always three entries.</summary>
    public IReadOnlyList<double?> BestSectors { get; init; } = [null, null, null];

    public double GapToLeader { get; init; }

    public int LapsToLeader { get; init; }

    public double GapToNext { get; init; }

    public int LapsToNext { get; init; }

    public bool InPit { get; init; }

    public PitState PitState { get; init; }

    public int PitStops { get; init; }

    /// <summary>Penalties still to serve; the game gives a count, not the kind.</summary>
    public int Penalties { get; init; }

    public bool BlueFlag { get; init; }

    public FinishStatus FinishStatus { get; init; }

    /// <summary>
    /// Standing still on track while the race runs, as the engineer's desktop works it out (no game
    /// says so); the driver's desktop always sends false.
    /// </summary>
    public bool Stopped { get; init; }

    public string? Compound { get; init; }

    /// <summary>World position from above, metres, in <see cref="CarPose"/>'s frame.</summary>
    public double X { get; init; }

    public double Z { get; init; }
}

/// <summary>One tyre corner: surface temperatures inner/middle/outer, core and brake in °C.</summary>
public sealed record PitWallTyre
{
    public TirePosition Position { get; init; }

    public double Inner { get; init; }

    public double Middle { get; init; }

    public double Outer { get; init; }

    public double Core { get; init; }

    public double Brake { get; init; }

    public double PressureKPa { get; init; }

    public double WearPercent { get; init; }

    public string Compound { get; init; } = "";
}

/// <summary>The last impact: when (session seconds), how hard, and on which lap when the driver's desktop saw it happen.</summary>
public sealed record PitWallImpact(double SessionTime, double Magnitude, int? Lap);

/// <summary>Body damage: eight dent severities (0 none, 1 some, 2 more) in the game's order.</summary>
public sealed record PitWallDamage
{
    public IReadOnlyList<int> Dents { get; init; } = [0, 0, 0, 0, 0, 0, 0, 0];

    public PitWallImpact? LastImpact { get; init; }

    public bool Overheating { get; init; }

    public bool DetachedParts { get; init; }
}

/// <summary>The driver's car: tyres front-left, front-right, rear-left, rear-right; energy fractions 0..1.</summary>
public sealed record PitWallCarStatus
{
    public IReadOnlyList<PitWallTyre> Tyres { get; init; } = [];

    public double FuelLiters { get; init; }

    public double FuelPerLapLiters { get; init; }

    public double? FuelCapacityLiters { get; init; }

    public double? VirtualEnergy { get; init; }

    public double? VirtualEnergyPerLap { get; init; }

    public double? Battery { get; init; }

    public PitWallDamage? Damage { get; init; }
}

/// <summary>A car near the driver's: metres to the right (+) and ahead (+) of it.</summary>
public sealed record PitWallRadarCar(int Id, string Driver, double Right, double Ahead);

/// <summary>A point on the track outline, from above.</summary>
public sealed record PitWallPoint(double X, double Z);

/// <summary>The four pressures (kPa) as a lap of the stint was completed.</summary>
public sealed record PitWallLapPressures(int Lap, double Fl, double Fr, double Rl, double Rr);

/// <summary>What race control's feed lists: a change of the session's flag, a sector's yellow, or something one car did.</summary>
public enum PitWallEventKind
{
    Green,
    FullCourseYellow,
    Stopped,
    Over,
    SectorYellow,
    SectorClear,
    CarStopped,
    Penalty,
    PenaltyServed,
    BlueFlag,
    Retired,
    Disqualified,
}

/// <summary>
/// One line of the race control feed, at <paramref name="Time"/> seconds into the session. A car's
/// event names the car as it was then (it may have left since); a sector event its sector, 1–3.
/// </summary>
public sealed record PitWallEvent(double Time, PitWallEventKind Kind, int? CarId, string Driver, string Car, int? Sector, int? Lap);

/// <summary>
/// What a stop costs, measured from the stops the engineer's desktop has seen this session:
/// <paramref name="Lane"/> is the time lost driving through the pit lane instead of past it (every
/// car's stops), <paramref name="Standing"/> the time stood in the box — from our car's stops, or
/// the class's until ours has made one (<paramref name="StandingFromOwn"/>). Seconds; null until seen.
/// </summary>
public sealed record PitWallPitLoss(double? Lane, int LaneStops, double? Standing, int StandingStops, bool StandingFromOwn);

/// <summary>What the driver's desktop sends twice a second as the <c>board</c> blob.</summary>
public sealed record PitWallBoard(PitWallSession Session, IReadOnlyList<PitWallCar> Field, PitWallCarStatus Car);

/// <summary>
/// One lap's traces against distance (0..1): speed km/h, pedals 0..1, steering -1..1, at most
/// <see cref="PitWallLapTraces.Points"/> points. Empty arrays when there is no such lap.
/// </summary>
public sealed record PitWallTrace(
    int? Lap,
    double? LapTime,
    IReadOnlyList<double> Distance,
    IReadOnlyList<double> Speed,
    IReadOnlyList<double> Throttle,
    IReadOnlyList<double> Brake,
    IReadOnlyList<double> Steering)
{
    public static readonly PitWallTrace Empty = new(null, null, [], [], [], [], []);
}

/// <summary>Which lap <c>GET /api/pitwall/trace</c> returns.</summary>
public enum PitWallTraceLap
{
    Current,
    Last,
    Best,
    Target,
}

/// <summary>The engineer's pit wall: <c>state.link.pitWall</c>.</summary>
public sealed record PitWallState
{
    public PitWallSession Session { get; init; } = new();

    public IReadOnlyList<PitWallCar> Field { get; init; } = [];

    public PitWallCarStatus Car { get; init; } = new();

    public IReadOnlyList<PitWallRadarCar> Radar { get; init; } = [];

    /// <summary>The track outline seen so far, in lap order.</summary>
    public IReadOnlyList<PitWallPoint> Outline { get; init; } = [];

    /// <summary>Per completed lap of the current stint.</summary>
    public IReadOnlyList<PitWallLapPressures> Pressures { get; init; } = [];

    /// <summary>The session plan as the driver's desktop stores it (one entry of <c>state.plans</c>), while the driver shares it.</summary>
    public JsonElement? Plan { get; init; }

    /// <summary>Race control's feed this session, oldest first.</summary>
    public IReadOnlyList<PitWallEvent> RaceControl { get; init; } = [];

    public PitWallPitLoss PitLoss { get; init; } = new(null, 0, null, 0, false);

    /// <summary>Unix ms when the newest board arrived.</summary>
    public long ReceivedAt { get; init; }
}

/// <summary>The plan the driver would share, as the driver's Live link page names it.</summary>
public sealed record PeerSharedPlan(string Id, string Name);

/// <summary>
/// What the driver's desktop offers to share, read from its session planner: the active plan as
/// JSON in <c>state.plans</c>' shape and the trace of the lap it targets.
/// </summary>
public sealed record PitWallShare(string PlanId, string PlanName, string PlanJson, PitWallTrace? Target);

/// <summary>
/// Reading what the driver's desktop sent. It may run another build, so a payload is read once
/// here and every missing list or text is filled in; the pit wall inward of this trusts its data.
/// </summary>
public static class PitWallWire
{
    /// <summary>The JSON options of the blob payloads: camelCase, enums by name, as <c>/api/state</c> writes them.</summary>
    public static JsonSerializerOptions Json { get; } = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    /// <summary>A board, or null when the payload is not one. Throws <see cref="JsonException"/> on malformed JSON.</summary>
    public static PitWallBoard? ReadBoard(ReadOnlySpan<byte> payload)
    {
        if (JsonSerializer.Deserialize<PitWallBoard>(payload, Json) is not { } board)
            return null;

        PitWallSession? session = board.Session;
        PitWallCarStatus? car = board.Car;
        IReadOnlyList<PitWallCar>? field = board.Field;
        if (session is null || car is null)
            return null;

        return new PitWallBoard(
            session with
            {
                Track = session.Track ?? "",
                YellowSectors = session.YellowSectors is { Count: 3 } yellows ? yellows : [false, false, false],
            },
            [.. (field ?? []).OfType<PitWallCar>().Select(Clean)],
            car with
            {
                Tyres = [.. (car.Tyres ?? []).OfType<PitWallTyre>().Select(tyre => tyre with { Compound = tyre.Compound ?? "" })],
                Damage = car.Damage is { } damage
                    ? damage with { Dents = damage.Dents is { Count: 8 } dents ? dents : [0, 0, 0, 0, 0, 0, 0, 0] }
                    : null,
            });
    }

    /// <summary>A lap trace, or null when the payload is null or its arrays are missing or uneven.</summary>
    public static PitWallTrace? ReadTrace(ReadOnlySpan<byte> payload)
    {
        if (JsonSerializer.Deserialize<PitWallTrace>(payload, Json) is not { } trace)
            return null;

        IReadOnlyList<double>?[] arrays = [trace.Distance, trace.Speed, trace.Throttle, trace.Brake, trace.Steering];
        return arrays.All(array => array is not null && array.Count == arrays[0]?.Count) ? trace : null;
    }

    /// <summary>Radar cars with their names filled in.</summary>
    public static IReadOnlyList<PitWallRadarCar> Clean(IReadOnlyList<PitWallRadarCar>? cars) =>
        [.. (cars ?? []).OfType<PitWallRadarCar>().Select(car => car with { Driver = car.Driver ?? "" })];

    private static PitWallCar Clean(PitWallCar car) => car with
    {
        Driver = car.Driver ?? "",
        Car = car.Car ?? "",
        CarClass = car.CarClass ?? "",
        LastSectors = Three(car.LastSectors),
        BestSectors = Three(car.BestSectors),
    };

    private static IReadOnlyList<double?> Three(IReadOnlyList<double?>? sectors) =>
        sectors is { Count: 3 } ? sectors : [null, null, null];
}
