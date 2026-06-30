using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games.LeMansUltimate;

internal sealed class LmuTelemetryMapper
{
    private const string GameName = "LeMansUltimate";
    private const double KelvinOffset = 273.15;
    private const double SessionTimeResetThreshold = 1.0;
    private const double LapTimeSpikeThreshold = 2.0;
    private const int FuelDeltaWindow = 5;

    private readonly Func<DateTimeOffset> _clock;
    private readonly Queue<float> _completedLapFuelDeltas = new();

    private bool _lapTimeValid;
    private int _lapTimeSession;
    private int _lapTimeLap;
    private double _lapTimeMax;
    private double _lapTimeSessionElapsed;

    private int? _fuelLap;
    private float? _fuelAtLapStart;

    public LmuTelemetryMapper(Func<DateTimeOffset>? clock = null)
    {
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    public void Reset()
    {
        _lapTimeValid = false;
        _lapTimeSession = 0;
        _lapTimeLap = 0;
        _lapTimeMax = 0;
        _lapTimeSessionElapsed = 0;
        _fuelLap = null;
        _fuelAtLapStart = null;
        _completedLapFuelDeltas.Clear();
    }

    public TelemetryFrame Map(LmuParsedFrame parsed)
    {
        var playerIsRealtime = parsed.PlayerHasVehicle && parsed.ScoringInfo.InRealtime;
        if (!playerIsRealtime)
        {
            return SessionOnlyFrame(parsed.ScoringInfo);
        }

        var telemetry = parsed.Telemetry ?? throw new LmuDecodeException("LMU parsed frame is in-car but telemetry is missing");
        var scoring = parsed.Scoring ?? throw new LmuDecodeException("LMU parsed frame is in-car but scoring is missing");

        var frontCompound = telemetry.FrontCompoundName;
        var rearCompound = telemetry.RearCompoundName;
        var currentLapTime = MonotonicCurrentLapTime(
            scoring.TimeIntoLap,
            telemetry.ElapsedTime,
            telemetry.LapStartElapsedTime,
            telemetry.LapNumber,
            parsed.ScoringInfo);
        var fuel = ToF32(telemetry.FuelLiters);

        return new TelemetryFrame
        {
            Timestamp = _clock(),
            Session = new SessionInfo
            {
                Game = GameName,
                Track = parsed.ScoringInfo.TrackName,
                Car = telemetry.VehicleName,
                SessionType = MapSessionType(parsed.ScoringInfo.Session),
                SessionTime = ToF64(parsed.ScoringInfo.CurrentElapsedTime),
                BestLapTime = ToF64(scoring.BestLapTime),
                MaxLaps = parsed.ScoringInfo.MaxLaps,
                InCar = true
            },
            Car = new CarState
            {
                SpeedMetersPerSecond = Speed(telemetry.LocalVelocity),
                Gear = telemetry.Gear,
                Rpm = ToF32(telemetry.EngineRpm),
                MaxRpm = ToF32(telemetry.EngineMaxRpm),
                Throttle = ToF32(telemetry.FilteredThrottle),
                Brake = ToF32(telemetry.FilteredBrake),
                Clutch = ToF32(telemetry.FilteredClutch),
                Steering = ToF32(telemetry.FilteredSteering),
                FuelLiters = fuel,
                FuelPerLapLiters = FuelPerLap(telemetry.LapNumber, fuel),
                PositionX = ToF32(telemetry.Position.X),
                PositionY = ToF32(telemetry.Position.Y),
                PositionZ = ToF32(telemetry.Position.Z),
                BrakeBiasRear = ToF32(telemetry.RearBrakeBias)
            },
            Tires = MapTires(telemetry.Wheels, frontCompound, rearCompound),
            Lap = new LapState
            {
                CurrentLap = telemetry.LapNumber,
                CurrentLapTime = currentLapTime,
                LastLapTime = ToF64(scoring.LastLapTime),
                BestLapTime = ToF64(scoring.BestLapTime),
                Sector = (telemetry.CurrentSectorRaw & 0x7FFFFFFF) + 1,
                IsValid = scoring.CountLapFlag == 2,
                TrackPosition = TrackPosition(scoring.LapDistance, parsed.ScoringInfo.LapDistance)
            },
            Flags = new RaceFlags
            {
                Yellow = scoring.UnderYellow,
                SafetyCar = parsed.ScoringInfo.GamePhase == 6,
                Red = parsed.ScoringInfo.GamePhase == 7,
                Checkered = scoring.FinishStatus == 1
            },
            Electronics = new ElectronicsState
            {
                TractionControlActive = telemetry.TractionControlActive,
                TractionControl = telemetry.TractionControl,
                TractionControlMax = telemetry.TractionControlMax,
                Abs = telemetry.Abs,
                AbsMax = telemetry.AbsMax,
                MotorMap = telemetry.MotorMap,
                MotorMapMax = telemetry.MotorMapMax,
                DrsActive = scoring.DrsState
            },
            Race = new RaceState
            {
                Position = scoring.Place,
                TotalPositions = ToByte(parsed.ScoringInfo.NumVehicles),
                GapAhead = Sanitize(telemetry.GapAhead),
                GapBehind = Sanitize(telemetry.GapBehind)
            },
            Energy = new EnergyState
            {
                VirtualEnergy = Sanitize(telemetry.VirtualEnergy),
                StateOfCharge = Sanitize(telemetry.StateOfCharge),
                RegenPower = Sanitize(telemetry.RegenPower)
            },
            Penalties = new PenaltiesState
            {
                Incidents = scoring.Penalties,
                TrackLimitSteps = telemetry.TrackLimitSteps,
                PitStops = scoring.PitStops
            }
        };
    }

    private TelemetryFrame SessionOnlyFrame(LmuScoringInfo scoringInfo)
    {
        return new TelemetryFrame
        {
            Timestamp = _clock(),
            Session = new SessionInfo
            {
                Game = GameName,
                Track = scoringInfo.TrackName,
                SessionType = MapSessionType(scoringInfo.Session),
                SessionTime = ToF64(scoringInfo.CurrentElapsedTime),
                MaxLaps = scoringInfo.MaxLaps,
                InCar = false
            }
        };
    }

    private double MonotonicCurrentLapTime(
        double scoringRaw,
        double telemetryElapsed,
        double telemetryLapStart,
        int lapNumber,
        LmuScoringInfo scoringInfo)
    {
        var scoringLapTime = ClampNonNegative(ToF64(scoringRaw));
        var telemetryLapTime = ClampNonNegative(ToF64(telemetryElapsed - telemetryLapStart));
        var sessionElapsed = ClampNonNegative(ToF64(scoringInfo.CurrentElapsedTime));

        var sessionChanged = _lapTimeValid && scoringInfo.Session != _lapTimeSession;
        var lapWentBack = _lapTimeValid && lapNumber < _lapTimeLap;
        var sessionReset = _lapTimeValid && sessionElapsed + SessionTimeResetThreshold < _lapTimeSessionElapsed;
        var newLap = _lapTimeValid && lapNumber != _lapTimeLap;

        if (!_lapTimeValid)
        {
            var lapTime = telemetryLapTime;
            if (lapTime <= 0)
            {
                lapTime = scoringLapTime;
            }

            SetLapTimeState(scoringInfo.Session, lapNumber, lapTime, sessionElapsed);
            return lapTime;
        }

        if (sessionChanged || lapWentBack || sessionReset || newLap)
        {
            var lapTime = TransitionLapTimeSeed(scoringLapTime, telemetryLapTime);
            SetLapTimeState(scoringInfo.Session, lapNumber, lapTime, sessionElapsed);
            return lapTime;
        }

        var candidate = telemetryLapTime;
        if (candidate <= 0)
        {
            candidate = scoringLapTime;
        }

        var sessionDelta = sessionElapsed - _lapTimeSessionElapsed;
        if (sessionDelta < 0)
        {
            sessionDelta = 0;
        }

        var maxAdvance = LapTimeSpikeThreshold + sessionDelta;
        if (telemetryLapTime > 0 && telemetryLapTime > _lapTimeMax + maxAdvance)
        {
            if (scoringLapTime > _lapTimeMax && scoringLapTime <= _lapTimeMax + maxAdvance)
            {
                candidate = scoringLapTime;
            }
            else
            {
                candidate = _lapTimeMax;
            }
        }

        if (candidate < _lapTimeMax)
        {
            candidate = _lapTimeMax;
        }
        else
        {
            _lapTimeMax = candidate;
        }

        if (sessionElapsed > _lapTimeSessionElapsed)
        {
            _lapTimeSessionElapsed = sessionElapsed;
        }

        return candidate;
    }

    private void SetLapTimeState(int session, int lapNumber, double lapTime, double sessionElapsed)
    {
        _lapTimeValid = true;
        _lapTimeSession = session;
        _lapTimeLap = lapNumber;
        _lapTimeMax = lapTime;
        _lapTimeSessionElapsed = sessionElapsed;
    }

    private static double TransitionLapTimeSeed(double scoringLapTime, double telemetryLapTime)
    {
        if (scoringLapTime > 0 && telemetryLapTime > 0)
        {
            return Math.Min(scoringLapTime, telemetryLapTime);
        }

        if (telemetryLapTime > 0 && telemetryLapTime <= LapTimeSpikeThreshold)
        {
            return telemetryLapTime;
        }

        return scoringLapTime;
    }

    private float FuelPerLap(int lapNumber, float fuel)
    {
        if (fuel <= 0)
        {
            return AverageFuelDelta();
        }

        if (_fuelLap is null)
        {
            _fuelLap = lapNumber;
            _fuelAtLapStart = fuel;
            return AverageFuelDelta();
        }

        if (lapNumber != _fuelLap)
        {
            if (lapNumber > _fuelLap && _fuelAtLapStart is { } startFuel)
            {
                var delta = startFuel - fuel;
                if (delta > 0)
                {
                    _completedLapFuelDeltas.Enqueue(delta);
                    while (_completedLapFuelDeltas.Count > FuelDeltaWindow)
                    {
                        _completedLapFuelDeltas.Dequeue();
                    }
                }
            }

            _fuelLap = lapNumber;
            _fuelAtLapStart = fuel;
        }

        return AverageFuelDelta();
    }

    private float AverageFuelDelta()
    {
        if (_completedLapFuelDeltas.Count == 0)
        {
            return 0;
        }

        return _completedLapFuelDeltas.Sum() / _completedLapFuelDeltas.Count;
    }

    private static IReadOnlyList<TireState> MapTires(IReadOnlyList<LmuWheel> wheels, string frontCompound, string rearCompound)
    {
        return
        [
            MapTire(TirePosition.FrontLeft, GetWheel(wheels, 0), frontCompound),
            MapTire(TirePosition.FrontRight, GetWheel(wheels, 1), frontCompound),
            MapTire(TirePosition.RearLeft, GetWheel(wheels, 2), rearCompound),
            MapTire(TirePosition.RearRight, GetWheel(wheels, 3), rearCompound)
        ];
    }

    private static LmuWheel GetWheel(IReadOnlyList<LmuWheel> wheels, int index)
    {
        return index < wheels.Count ? wheels[index] : new LmuWheel();
    }

    private static TireState MapTire(TirePosition position, LmuWheel wheel, string compound)
    {
        return new TireState
        {
            Position = position,
            TempInnerCelsius = KelvinToCelsius(wheel.TempInnerKelvin),
            TempMiddleCelsius = KelvinToCelsius(wheel.TempMiddleKelvin),
            TempOuterCelsius = KelvinToCelsius(wheel.TempOuterKelvin),
            TempCoreCelsius = KelvinToCelsius(wheel.CarcassTempKelvin),
            PressureKPa = ToF32(wheel.PressureKPa),
            WearPercent = ToF32(wheel.WearFraction * 100),
            Compound = compound
        };
    }

    private static SessionType MapSessionType(int session)
    {
        return session switch
        {
            0 => SessionType.Practice,
            >= 1 and <= 4 => SessionType.Practice,
            >= 5 and <= 8 => SessionType.Qualify,
            9 => SessionType.Warmup,
            >= 10 and <= 13 => SessionType.Race,
            _ => SessionType.Unknown
        };
    }

    private static float Speed(LmuVector3 velocity)
    {
        var speed = Math.Sqrt(velocity.X * velocity.X + velocity.Y * velocity.Y + velocity.Z * velocity.Z);
        return ToF32(speed);
    }

    private static float TrackPosition(double lapDistance, double trackLapDistance)
    {
        if (trackLapDistance <= 0 || !double.IsFinite(trackLapDistance))
        {
            return 0;
        }

        return Math.Clamp(ToF32(lapDistance / trackLapDistance), 0, 1);
    }

    private static float KelvinToCelsius(double kelvin) => ToF32(kelvin - KelvinOffset);

    private static double ClampNonNegative(double value) => value < 0 ? 0 : value;

    private static double ToF64(double value) => double.IsFinite(value) ? value : 0;

    private static float ToF32(double value)
    {
        if (!double.IsFinite(value))
        {
            return 0;
        }

        var converted = (float)value;
        return float.IsFinite(converted) ? converted : 0;
    }

    private static float Sanitize(float value) => float.IsFinite(value) ? value : 0;

    private static byte ToByte(int value)
    {
        return value switch
        {
            < byte.MinValue => byte.MinValue,
            > byte.MaxValue => byte.MaxValue,
            _ => (byte)value
        };
    }
}
