namespace Sprint.Desktop.Api.Telemetry;

public sealed record TelemetryFrame
{
    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;
    public SessionInfo Session { get; init; } = new();
    public CarState Car { get; init; } = new();
    public IReadOnlyList<TireState> Tires { get; init; } =
    [
        new() { Position = TirePosition.FrontLeft },
        new() { Position = TirePosition.FrontRight },
        new() { Position = TirePosition.RearLeft },
        new() { Position = TirePosition.RearRight }
    ];
    public LapState Lap { get; init; } = new();
    public RaceFlags Flags { get; init; } = new();
    public ElectronicsState Electronics { get; init; } = new();
    public RaceState Race { get; init; } = new();
    public EnergyState Energy { get; init; } = new();
    public PenaltiesState Penalties { get; init; } = new();
    public SessionConditions Conditions { get; init; } = new();

    /// <summary>
    /// Every car in the session, the player's included, as the game last scored them; null when
    /// the game does not report other cars. Scoring updates far less often than telemetry (LMU:
    /// ~5 Hz against ~60 Hz), so a source hands out the same list until scoring changes, and a
    /// recording stores it only when it did.
    /// </summary>
    public IReadOnlyList<FieldCar>? Field { get; init; }
}

/// <summary>
/// One car in the session as scoring reports it: enough for a timing table and a track map.
/// Flat on purpose, so two snapshots compare by value.
/// </summary>
public sealed record FieldCar
{
    /// <summary>The game's slot id. Unique within a snapshot; a server can reuse it after someone leaves.</summary>
    public int Id { get; init; }
    public string Driver { get; init; } = "";

    /// <summary>The entry as the game names it (team, livery, number) — <see cref="SessionInfo.Car"/> for the player.</summary>
    public string Car { get; init; } = "";

    /// <summary>The class as the game states it, in <see cref="SessionInfo.CarClass"/>'s spelling.</summary>
    public string CarClass { get; init; } = "";
    public bool IsPlayer { get; init; }

    /// <summary>1-based overall position; 0 when unknown.</summary>
    public int Place { get; init; }

    /// <summary>1-based position within <see cref="CarClass"/>, ranked from <see cref="Place"/>; 0 when unknown.</summary>
    public int ClassPlace { get; init; }
    public int LapsCompleted { get; init; }

    /// <summary>Distance around the lap in metres; against <see cref="SessionInfo.TrackLengthMeters"/> it is the lap fraction.</summary>
    public double LapDistanceMeters { get; init; }

    /// <summary>The sector the car is in, 1–3; 0 when unknown.</summary>
    public int Sector { get; init; }
    public double? BestLapTime { get; init; }
    public double? LastLapTime { get; init; }

    /// <summary>Sector durations of the last lap; all null unless the lap's marks were credible.</summary>
    public double? LastLapSector1 { get; init; }
    public double? LastLapSector2 { get; init; }
    public double? LastLapSector3 { get; init; }

    /// <summary>Sector durations of the lap being driven, each null until that sector is done.</summary>
    public double? CurrentLapSector1 { get; init; }
    public double? CurrentLapSector2 { get; init; }

    /// <summary>Seconds and whole laps behind the overall leader.</summary>
    public double GapToLeader { get; init; }
    public int LapsToLeader { get; init; }

    /// <summary>Seconds and whole laps behind the car one place ahead.</summary>
    public double GapToNext { get; init; }
    public int LapsToNext { get; init; }
    public bool InPitLane { get; init; }
    public bool InGarage { get; init; }
    public PitState PitState { get; init; }
    public int PitStops { get; init; }
    public FinishStatus FinishStatus { get; init; }

    /// <summary>World position in metres, in <see cref="CarPose"/>'s convention (right-handed, +Y up), seen from above.</summary>
    public float PositionX { get; init; }
    public float PositionZ { get; init; }
}

/// <summary>Where a car is in a pit stop.</summary>
public enum PitState
{
    None,
    Requested,
    Entering,
    Stopped,
    Exiting
}

public enum FinishStatus
{
    None,
    Finished,
    Dnf,
    Disqualified
}

/// <summary>
/// The conditions a session is being run under. Every value is nullable because no game
/// reports all of them: null means "this game did not say", never a default. Recorded with
/// each lap so filtering history by conditions becomes possible later without re-driving
/// anything.
/// </summary>
public sealed record SessionConditions
{
    /// <summary>Average wetness of the racing line, 0–1. Null when the game does not report it.</summary>
    public double? PathWetness { get; init; }

    /// <summary>
    /// Track grip as the game grades it. A game-defined level, not a physical coefficient,
    /// so it is only comparable against itself.
    /// </summary>
    public double? TrackGripLevel { get; init; }

    /// <summary>Fuel usage multiplier, where the game exposes one.</summary>
    public double? FuelMultiplier { get; init; }

    /// <summary>Tyre wear multiplier, where the game exposes one.</summary>
    public double? TireMultiplier { get; init; }

    /// <summary>Whether the session forces a fixed setup.</summary>
    public bool? FixedSetup { get; init; }
}

public sealed record SessionInfo
{
    public string Game { get; init; } = "";
    public string Track { get; init; } = "";

    /// <summary>
    /// Length of the track layout in metres, or null when unknown. Recorded beside a lap's
    /// context as a cross-check between writers — a live lap distance and an imported track
    /// length should agree about which layout was driven.
    /// </summary>
    public double? TrackLengthMeters { get; init; }
    public string Car { get; init; } = "";

    /// <summary>
    /// The car's class as the game states it (e.g. "Hypercar"), empty when unknown. Kept
    /// beside <see cref="Car"/> so history can record class as metadata without making it
    /// part of a context key.
    /// </summary>
    public string CarClass { get; init; } = "";

    /// <summary>
    /// The car's model as the game names it (e.g. "Oreca 07"), empty when unknown.
    /// <see cref="Car"/> can name an entry — a livery with a team and a number — so this is
    /// what says which car it actually is.
    /// </summary>
    public string CarType { get; init; } = "";

    /// <summary>
    /// The championship the car is entered in, as the game names it (e.g. "WEC 2026",
    /// "ELMS 2025"), empty when unknown.
    /// </summary>
    public string CarChampionship { get; init; } = "";
    public SessionType SessionType { get; init; } = SessionType.Unknown;

    /// <summary>Seconds elapsed in the current session.</summary>
    public double SessionTime { get; init; }

    /// <summary>
    /// Total length of a timed session in seconds, or null when the game does not report
    /// one (a lap-based session) or reports an implausible value. Null means unknown — a
    /// planner must ask rather than commit a number nobody can vouch for.
    /// </summary>
    public double? TotalSessionTime { get; init; }

    /// <summary>
    /// Seconds left in a timed session, or null when the session has no known length. Only
    /// meaningful alongside <see cref="TotalSessionTime"/>: without a total there is
    /// nothing for a remainder to be a remainder of.
    /// </summary>
    public double? SessionTimeRemaining { get; init; }
    public double BestLapTime { get; init; }
    public int MaxLaps { get; init; }
    public bool InCar { get; init; }
}

public enum SessionType
{
    Practice,
    Qualify,
    Race,
    Warmup,
    Unknown
}

public sealed record CarState
{
    public float SpeedMetersPerSecond { get; init; }
    public int Gear { get; init; }
    public float Rpm { get; init; }
    public float MaxRpm { get; init; }

    /// <summary>Driver throttle position before traction control or other vehicle-side filtering.</summary>
    public float Throttle { get; init; }

    /// <summary>Driver brake position before ABS or other vehicle-side filtering.</summary>
    public float Brake { get; init; }

    /// <summary>Driver clutch position before vehicle-side filtering.</summary>
    public float Clutch { get; init; }

    /// <summary>Driver steering position before steering assists or vehicle-side filtering.</summary>
    public float Steering { get; init; }

    /// <summary>
    /// The throttle the car actually got, 0–1: <see cref="Throttle"/> after traction control,
    /// rev and speed limiting. Null when the game does not say.
    /// </summary>
    public float? ThrottleApplied { get; init; }

    /// <summary>
    /// The brake the car actually got, 0–1: <see cref="Brake"/> after ABS. Null when the game
    /// does not say.
    /// </summary>
    public float? BrakeApplied { get; init; }
    public float FuelLiters { get; init; }
    public float FuelPerLapLiters { get; init; }
    /// <summary>World position in the game's own frame, for track maps. <see cref="Pose"/> is the frame-neutral one.</summary>
    public float PositionX { get; init; }
    public float PositionY { get; init; }
    public float PositionZ { get; init; }
    public float BrakeBiasRear { get; init; }

    /// <summary>
    /// Whether the car stands in its own garage stall, the only place its setup can be changed.
    /// Null when the game does not say.
    /// </summary>
    public bool? InGarage { get; init; }

    /// <summary>Whether the car is between pit entry and pit exit. Null when the game does not say.</summary>
    public bool? InPitLane { get; init; }

    /// <summary>Where the car is in a pit stop. Null when the game does not say.</summary>
    public PitState? PitState { get; init; }

    /// <summary>Whether the pit speed limiter is switched on. Null when the game does not say.</summary>
    public bool? PitLimiter { get; init; }

    /// <summary>Where the car is and how it is moving. Null when the game does not say.</summary>
    public CarPose? Pose { get; init; }
}

/// <summary>
/// The car's rigid-body state in one convention every consumer shares, whatever the game uses:
/// right-handed, +Y up; the body frame is +X right, +Y up, -Z forward (as OpenXR), and
/// <see cref="Orientation"/> rotates body vectors into world vectors. A game adapter converts
/// into this at the edge, so no consumer ever learns a game's axes.
/// </summary>
public sealed record CarPose
{
    /// <summary>World position in metres. Double, because a track spans kilometres from its origin.</summary>
    public double PositionX { get; init; }
    public double PositionY { get; init; }
    public double PositionZ { get; init; }

    /// <summary>Unit quaternion, body to world.</summary>
    public float OrientationX { get; init; }
    public float OrientationY { get; init; }
    public float OrientationZ { get; init; }
    public float OrientationW { get; init; } = 1;

    /// <summary>Velocity in the body frame, m/s.</summary>
    public float VelocityX { get; init; }
    public float VelocityY { get; init; }
    public float VelocityZ { get; init; }

    /// <summary>Angular velocity in the body frame, rad/s.</summary>
    public float AngularVelocityX { get; init; }
    public float AngularVelocityY { get; init; }
    public float AngularVelocityZ { get; init; }
}

public enum TirePosition
{
    FrontLeft,
    FrontRight,
    RearLeft,
    RearRight
}

public sealed record TireState
{
    public TirePosition Position { get; init; }
    public float TempInnerCelsius { get; init; }
    public float TempMiddleCelsius { get; init; }
    public float TempOuterCelsius { get; init; }
    public float TempSurfaceCelsius { get; init; }
    public float TempCoreCelsius { get; init; }
    public float PressureKPa { get; init; }
    public float WearPercent { get; init; }
    public string Compound { get; init; } = "";
}

public sealed record LapState
{
    public int CurrentLap { get; init; }
    public double CurrentLapTime { get; init; }
    public double LastLapTime { get; init; }
    public double BestLapTime { get; init; }
    public double TargetLapTime { get; init; }
    public double Delta { get; init; }
    public int Sector { get; init; }

    /// <summary>
    /// Durations of the last completed lap's sectors in seconds, in order. Empty when the
    /// game has not reported credible marks yet (an out lap, or a build that does not fill
    /// them). Durations, not the cumulative marks sims usually publish.
    /// </summary>
    public IReadOnlyList<double> LastLapSectorsSeconds { get; init; } = [];

    public bool IsValid { get; init; } = true;
    public float TrackPosition { get; init; }
}

public sealed record RaceFlags
{
    public bool Yellow { get; init; }
    public bool DoubleYellow { get; init; }
    public bool Red { get; init; }
    public bool SafetyCar { get; init; }
    public bool VirtualSafetyCar { get; init; }
    public bool Checkered { get; init; }
}

/// <summary>
/// The car's driver aids and the settings the driver can change from the cockpit. Each setting
/// pairs with a maximum; a maximum of 0 means the car does not offer it.
/// </summary>
public sealed record ElectronicsState
{
    public bool TractionControlActive { get; init; }
    public byte TractionControl { get; init; }
    public byte TractionControlMax { get; init; }

    /// <summary>Traction control slip.</summary>
    public byte TractionControlSlip { get; init; }
    public byte TractionControlSlipMax { get; init; }

    /// <summary>Traction control power cut.</summary>
    public byte TractionControlCut { get; init; }
    public byte TractionControlCutMax { get; init; }
    public byte Abs { get; init; }
    public byte AbsMax { get; init; }
    public byte MotorMap { get; init; }
    public byte MotorMapMax { get; init; }

    /// <summary>Brake migration.</summary>
    public byte Migration { get; init; }
    public byte MigrationMax { get; init; }
    public byte FrontAntiRollBar { get; init; }
    public byte FrontAntiRollBarMax { get; init; }
    public byte RearAntiRollBar { get; init; }
    public byte RearAntiRollBarMax { get; init; }
    public bool DrsActive { get; init; }
}

public sealed record RaceState
{
    public byte Position { get; init; }
    public byte TotalPositions { get; init; }
    public float GapAhead { get; init; }
    public float GapBehind { get; init; }
}

public sealed record EnergyState
{
    public float VirtualEnergy { get; init; }
    public float VirtualEnergyPerLap { get; init; }
    public float StateOfCharge { get; init; }
    public float RegenPower { get; init; }
    public float DeployPower { get; init; }
}

public sealed record PenaltiesState
{
    public short Incidents { get; init; }
    public byte TrackLimitSteps { get; init; }
    public short PitStops { get; init; }
}
