#if DEBUG
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.Development;

public enum DevelopmentGamePreset
{
    Idle,
    Grid,
    Racing,
    Redline,
    PitLane,
}

public sealed record DevelopmentGameValues
{
    public double SpeedKph { get; init; }
    public double Rpm { get; init; }
    public double MaxRpm { get; init; } = 10_000;
    public int Gear { get; init; }
    public double ThrottlePercent { get; init; }
    public double BrakePercent { get; init; }
    public double FuelLiters { get; init; } = 50;
    public int CurrentLap { get; init; } = 1;
    public double LapTimeSeconds { get; init; }
    public double DeltaSeconds { get; init; }
    public int Position { get; init; } = 1;
    public int TotalPositions { get; init; } = 20;
    public bool YellowFlag { get; init; }
    public bool RedFlag { get; init; }
    public bool CheckeredFlag { get; init; }
    public bool TractionControlActive { get; init; }

    /// <summary>Assist settings (levels), independent from the activity flags so a level change — and only a level change — fires the dash change alerts. (The telemetry contract has no ABS-activity flag, so the simulator offers none.)</summary>
    public int TractionControl { get; init; } = 4;
    public int Abs { get; init; } = 3;
    public int MotorMap { get; init; } = 3;
}

/// <summary>
/// Development-only global telemetry override. It is independent from any
/// individual screen: every dashboard consumer resolves through the same state,
/// while screen test patterns and other development modules can remain active at
/// the same time.
/// </summary>
public sealed class DevelopmentGameState
{
    private readonly object _gate = new();
    private readonly ILog _log;
    private DevelopmentGameValues _values = PresetValues(DevelopmentGamePreset.Idle);
    private bool _enabled;

    public DevelopmentGameState(ILog? log = null)
    {
        _log = log ?? NullLog.Instance;
    }

    public event EventHandler? Changed;

    public bool Enabled
    {
        get
        {
            lock (_gate)
            {
                return _enabled;
            }
        }
    }

    public DevelopmentGameValues Values
    {
        get
        {
            lock (_gate)
            {
                return _values;
            }
        }
    }

    public void SetEnabled(bool enabled)
    {
        lock (_gate)
        {
            _enabled = enabled;
        }

        _log.Info($"Development game simulation {(enabled ? "enabled" : "disabled")}.");
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void ApplyPreset(DevelopmentGamePreset preset)
    {
        lock (_gate)
        {
            _values = PresetValues(preset);
            _enabled = true;
        }

        _log.Info($"Development game preset applied: preset={preset}.");
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void Update(DevelopmentGameValues values)
    {
        lock (_gate)
        {
            _values = values;
        }

        _log.Debug(
            $"Development game state updated: speedKph={values.SpeedKph:0} rpm={values.Rpm:0} " +
            $"gear={values.Gear} lap={values.CurrentLap}.");
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public TelemetryFrame Resolve(TelemetryFrame liveFrame)
    {
        DevelopmentGameValues values;
        lock (_gate)
        {
            if (!_enabled)
            {
                return liveFrame;
            }

            values = _values;
        }

        return ToFrame(values);
    }

    private static DevelopmentGameValues PresetValues(DevelopmentGamePreset preset) => preset switch
    {
        DevelopmentGamePreset.Grid => new DevelopmentGameValues
        {
            Gear = 1,
            Rpm = 1_400,
            FuelLiters = 82,
            CurrentLap = 1,
            Position = 6,
        },
        DevelopmentGamePreset.Racing => new DevelopmentGameValues
        {
            SpeedKph = 220,
            Rpm = 7_200,
            Gear = 5,
            ThrottlePercent = 82,
            FuelLiters = 41.5,
            CurrentLap = 12,
            LapTimeSeconds = 64.2,
            DeltaSeconds = 0.12,
            Position = 4,
        },
        DevelopmentGamePreset.Redline => new DevelopmentGameValues
        {
            SpeedKph = 286,
            Rpm = 9_650,
            Gear = 6,
            ThrottlePercent = 100,
            FuelLiters = 28,
            CurrentLap = 18,
            LapTimeSeconds = 71.4,
            DeltaSeconds = -0.18,
            Position = 2,
        },
        DevelopmentGamePreset.PitLane => new DevelopmentGameValues
        {
            SpeedKph = 60,
            Rpm = 3_500,
            Gear = 2,
            ThrottlePercent = 34,
            FuelLiters = 12,
            CurrentLap = 22,
            LapTimeSeconds = 92,
            Position = 8,
        },
        _ => new DevelopmentGameValues
        {
            FuelLiters = 50,
            CurrentLap = 1,
            Position = 1,
        },
    };

    private static TelemetryFrame ToFrame(DevelopmentGameValues values) => new()
    {
        Timestamp = DateTimeOffset.UtcNow,
        Session = new SessionInfo
        {
            Game = "Sprint Development Simulator",
            Track = "Development Circuit",
            Car = "Sprint Test Car",
            SessionType = SessionType.Race,
            SessionTime = values.LapTimeSeconds + ((values.CurrentLap - 1) * 90),
            BestLapTime = 89.5,
            MaxLaps = 30,
            InCar = true,
        },
        Car = new CarState
        {
            SpeedMetersPerSecond = (float)(values.SpeedKph / 3.6),
            Gear = values.Gear,
            Rpm = (float)values.Rpm,
            MaxRpm = (float)values.MaxRpm,
            Throttle = (float)(values.ThrottlePercent / 100),
            Brake = (float)(values.BrakePercent / 100),
            FuelLiters = (float)values.FuelLiters,
            FuelPerLapLiters = 2.8f,
            BrakeBiasRear = 0.46f,
        },
        Tires =
        [
            Tire(TirePosition.FrontLeft, 88),
            Tire(TirePosition.FrontRight, 90),
            Tire(TirePosition.RearLeft, 84),
            Tire(TirePosition.RearRight, 85),
        ],
        Lap = new LapState
        {
            CurrentLap = values.CurrentLap,
            CurrentLapTime = values.LapTimeSeconds,
            LastLapTime = 90.1,
            BestLapTime = 89.5,
            TargetLapTime = 89.8,
            Delta = values.DeltaSeconds,
            Sector = 2,
            TrackPosition = 0.55f,
        },
        Flags = new RaceFlags
        {
            Yellow = values.YellowFlag,
            Red = values.RedFlag,
            Checkered = values.CheckeredFlag,
        },
        Electronics = new ElectronicsState
        {
            TractionControlActive = values.TractionControlActive,
            TractionControl = (byte)Math.Clamp(values.TractionControl, 0, 12),
            TractionControlMax = 12,
            Abs = (byte)Math.Clamp(values.Abs, 0, 12),
            AbsMax = 12,
            MotorMap = (byte)Math.Clamp(values.MotorMap, 0, 8),
            MotorMapMax = 8,
            DrsActive = values.SpeedKph > 180,
        },
        Race = new RaceState
        {
            Position = (byte)Math.Clamp(values.Position, 1, byte.MaxValue),
            TotalPositions = (byte)Math.Clamp(values.TotalPositions, 1, byte.MaxValue),
            GapAhead = 1.4f,
            GapBehind = 0.8f,
        },
        Energy = new EnergyState
        {
            VirtualEnergy = 64,
            VirtualEnergyPerLap = 3.2f,
            StateOfCharge = 0.71f,
            RegenPower = 12,
            DeployPower = 83,
        },
    };

    private static TireState Tire(TirePosition position, float temperature) => new()
    {
        Position = position,
        TempInnerCelsius = temperature + 1,
        TempMiddleCelsius = temperature,
        TempOuterCelsius = temperature - 1,
        TempSurfaceCelsius = temperature,
        TempCoreCelsius = temperature - 4,
        PressureKPa = 190,
        WearPercent = 8,
        Compound = "Medium",
    };
}
#endif
