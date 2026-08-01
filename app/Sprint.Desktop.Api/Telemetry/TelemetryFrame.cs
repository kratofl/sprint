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
    public float FuelLiters { get; init; }
    public float FuelPerLapLiters { get; init; }
    public float PositionX { get; init; }
    public float PositionY { get; init; }
    public float PositionZ { get; init; }
    public float BrakeBiasRear { get; init; }
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

public sealed record ElectronicsState
{
    public bool TractionControlActive { get; init; }
    public byte TractionControl { get; init; }
    public byte TractionControlMax { get; init; }
    public byte Abs { get; init; }
    public byte AbsMax { get; init; }
    public byte MotorMap { get; init; }
    public byte MotorMapMax { get; init; }
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
