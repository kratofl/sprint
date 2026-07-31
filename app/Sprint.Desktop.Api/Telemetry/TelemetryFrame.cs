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
}

public sealed record SessionInfo
{
    public string Game { get; init; } = "";
    public string Track { get; init; } = "";
    public string Car { get; init; } = "";
    public SessionType SessionType { get; init; } = SessionType.Unknown;
    public double SessionTime { get; init; }
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
