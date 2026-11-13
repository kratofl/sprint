using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games.LeMansUltimate;

internal sealed class LmuTelemetryMapper
{
    // Shared with the results importer: both writers stamp the same game name into the
    // lap-history context key, and two spellings would split one context into two buckets.
    private const string GameName = LeMansUltimateGameData.GameName;
    private const double KelvinOffset = 273.15;
    private const double SessionTimeResetThreshold = 1.0;
    private const double LapTimeSpikeThreshold = 2.0;
    private const int FuelDeltaWindow = 5;

    private readonly Func<DateTimeOffset> _clock;
    private readonly Queue<float> _completedLapFuelDeltas = new();
    private readonly Queue<float> _completedLapEnergyDeltas = new();

    private bool _lapTimeValid;
    private int _lapTimeSession;
    private int _lapTimeLap;
    private double _lapTimeMax;
    private double _lapTimeSessionElapsed;

    private int? _fuelLap;
    private float? _fuelAtLapStart;

    private int? _energyLap;
    private float? _energyAtLapStart;

    // The model and championship last read in the cockpit. Only the telemetry block carries
    // them, and it is empty outside the car, so a garage-screen frame for the same entry borrows
    // them: without that the car's identity would flip every time the driver steps out of it.
    private LmuCarIdentity? _lastCar;

    // The field last mapped and the scoring it came from. Scoring changes ~5 times a second while
    // frames arrive ~60, so an unchanged vehicle array hands out the same list again: consumers
    // and the recorder can then tell "scoring updated" from "same snapshot" cheaply.
    private IReadOnlyList<LmuVehicleScoring> _fieldScoring = [];
    private IReadOnlyDictionary<int, string> _fieldCompounds = new Dictionary<int, string>();
    private IReadOnlyList<FieldCar> _field = [];

    public LmuTelemetryMapper(Func<DateTimeOffset>? clock = null)
    {
        this._clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    public void Reset()
    {
        this._lapTimeValid = false;
        this._lapTimeSession = 0;
        this._lapTimeLap = 0;
        this._lapTimeMax = 0;
        this._lapTimeSessionElapsed = 0;
        this._fuelLap = null;
        this._fuelAtLapStart = null;
        this._completedLapFuelDeltas.Clear();
        this._energyLap = null;
        this._energyAtLapStart = null;
        this._completedLapEnergyDeltas.Clear();
        this._lastCar = null;
        this._fieldScoring = [];
        this._fieldCompounds = new Dictionary<int, string>();
        this._field = [];
    }

    public TelemetryFrame Map(LmuParsedFrame parsed)
    {
        bool playerIsRealtime = parsed.PlayerHasVehicle && parsed.ScoringInfo.InRealtime;
        if (!playerIsRealtime)
        {
            return this.SessionOnlyFrame(parsed.ScoringInfo, parsed.PlayerVehicle, this.MapField(parsed.Vehicles, parsed.FrontCompounds));
        }

        LmuVehicleTelemetry telemetry = parsed.Telemetry ?? throw new LmuDecodeException("LMU parsed frame is in-car but telemetry is missing");
        LmuVehicleScoring scoring = parsed.Scoring ?? throw new LmuDecodeException("LMU parsed frame is in-car but scoring is missing");

        string frontCompound = telemetry.FrontCompoundName;
        string rearCompound = telemetry.RearCompoundName;
        double currentLapTime = this.MonotonicCurrentLapTime(
            scoring.TimeIntoLap,
            telemetry.ElapsedTime,
            telemetry.LapStartElapsedTime,
            telemetry.LapNumber,
            parsed.ScoringInfo);
        float fuel = ToF32(telemetry.FuelLiters);
        float virtualEnergy = Sanitize(telemetry.VirtualEnergy);
        LmuCarIdentity car = new(
            telemetry.VehicleName,
            telemetry.VehicleModel,
            ChampionshipName(telemetry.VehicleChampionship));
        this._lastCar = car;

        return new TelemetryFrame
        {
            Timestamp = this._clock(),
            Session = new SessionInfo
            {
                Game = GameName,
                Track = parsed.ScoringInfo.TrackName,
                Car = telemetry.VehicleName,
                // Scoring's class string and the telemetry block's class byte say the same thing;
                // the string is what history has always stored, so the byte only fills a gap.
                CarClass = string.IsNullOrWhiteSpace(scoring.VehicleClass)
                    ? ClassName(telemetry.VehicleClass)
                    : scoring.VehicleClass,
                CarType = car.Model,
                CarChampionship = car.Championship,
                TrackLengthMeters = PlausibleTrackLength(parsed.ScoringInfo.LapDistance),
                SessionType = MapSessionType(parsed.ScoringInfo.Session),
                SessionTime = ToF64(parsed.ScoringInfo.CurrentElapsedTime),
                TotalSessionTime = PlausibleSessionLength(parsed.ScoringInfo.EndElapsedTime),
                SessionTimeRemaining = PlausibleTimeRemaining(parsed.ScoringInfo),
                BestLapTime = ToF64(scoring.BestLapTime),
                MaxLaps = LapLimit(parsed.ScoringInfo.MaxLaps),
                InCar = true,
                Phase = MapPhase(parsed.ScoringInfo.GamePhase)
            },
            Car = new CarState
            {
                SpeedMetersPerSecond = Speed(telemetry.LocalVelocity),
                Gear = telemetry.Gear,
                Rpm = ToF32(telemetry.EngineRpm),
                MaxRpm = ToF32(telemetry.EngineMaxRpm),
                Throttle = ToF32(telemetry.UnfilteredThrottle),
                Brake = ToF32(telemetry.UnfilteredBrake),
                Clutch = ToF32(telemetry.UnfilteredClutch),
                Steering = ToF32(telemetry.UnfilteredSteering),
                ThrottleApplied = Applied(telemetry.FilteredThrottle),
                BrakeApplied = Applied(telemetry.FilteredBrake),
                FuelLiters = fuel,
                FuelPerLapLiters = this.FuelPerLap(telemetry.LapNumber, fuel),
                FuelCapacityLiters = double.IsFinite(telemetry.FuelCapacityLiters) && telemetry.FuelCapacityLiters > 0
                    ? (float)telemetry.FuelCapacityLiters
                    : null,
                PositionX = ToF32(telemetry.Position.X),
                PositionY = ToF32(telemetry.Position.Y),
                PositionZ = ToF32(telemetry.Position.Z),
                BrakeBiasRear = ToF32(telemetry.RearBrakeBias),
                InGarage = scoring.InGarageStall,
                InPitLane = scoring.InPits,
                PitState = MapPitState(scoring.PitState),
                PitLimiter = telemetry.SpeedLimiter,
                Pose = MapPose(telemetry)
            },
            Tires = MapTires(telemetry.Wheels, frontCompound, rearCompound),
            Lap = new LapState
            {
                CurrentLap = telemetry.LapNumber,
                CurrentLapTime = currentLapTime,
                LastLapTime = ToF64(scoring.LastLapTime),
                BestLapTime = ToF64(scoring.BestLapTime),
                Sector = (telemetry.CurrentSectorRaw & 0x7FFFFFFF) + 1,
                LastLapSectorsSeconds = SectorDurations(scoring),
                IsValid = scoring.CountLapFlag == 2,
                TrackPosition = TrackPosition(scoring.LapDistance, parsed.ScoringInfo.LapDistance)
            },
            Flags = new RaceFlags
            {
                Yellow = scoring.UnderYellow,
                SafetyCar = parsed.ScoringInfo.GamePhase == 6,
                Red = parsed.ScoringInfo.GamePhase == 7,
                Checkered = scoring.FinishStatus == 1,
                Sector1Yellow = SectorYellow(parsed.ScoringInfo, 1),
                Sector2Yellow = SectorYellow(parsed.ScoringInfo, 2),
                Sector3Yellow = SectorYellow(parsed.ScoringInfo, 3)
            },
            Electronics = new ElectronicsState
            {
                TractionControlActive = telemetry.TractionControlActive,
                TractionControl = telemetry.TractionControl,
                TractionControlMax = telemetry.TractionControlMax,
                TractionControlSlip = telemetry.TractionControlSlip,
                TractionControlSlipMax = telemetry.TractionControlSlipMax,
                TractionControlCut = telemetry.TractionControlCut,
                TractionControlCutMax = telemetry.TractionControlCutMax,
                Abs = telemetry.Abs,
                AbsMax = telemetry.AbsMax,
                MotorMap = telemetry.MotorMap,
                MotorMapMax = telemetry.MotorMapMax,
                Migration = telemetry.Migration,
                MigrationMax = telemetry.MigrationMax,
                FrontAntiRollBar = telemetry.FrontAntiSway,
                FrontAntiRollBarMax = telemetry.FrontAntiSwayMax,
                RearAntiRollBar = telemetry.RearAntiSway,
                RearAntiRollBarMax = telemetry.RearAntiSwayMax,
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
                VirtualEnergy = virtualEnergy,
                VirtualEnergyPerLap = this.VirtualEnergyPerLap(telemetry.LapNumber, virtualEnergy),
                StateOfCharge = Sanitize(telemetry.StateOfCharge),
                RegenPower = Sanitize(telemetry.RegenPower)
            },
            Penalties = new PenaltiesState
            {
                Incidents = scoring.Penalties,
                TrackLimitSteps = telemetry.TrackLimitSteps,
                PitStops = scoring.PitStops
            },
            Conditions = MapConditions(parsed.ScoringInfo),
            Damage = MapDamage(telemetry),
            Field = this.MapField(parsed.Vehicles, parsed.FrontCompounds)
        };
    }

    private TelemetryFrame SessionOnlyFrame(LmuScoringInfo scoringInfo, LmuVehicleScoring? playerVehicle, IReadOnlyList<FieldCar> field)
    {
        string entry = playerVehicle?.VehicleName ?? "";
        LmuCarIdentity? car = this._lastCar is { } last && entry.Length > 0 && last.VehicleName == entry
            ? last
            : null;
        return new TelemetryFrame
        {
            Timestamp = this._clock(),
            Session = new SessionInfo
            {
                Game = GameName,
                Track = scoringInfo.TrackName,
                // Scoring knows the driver's selection in the lobby, so prefill and history
                // lookup work before the cockpit exists.
                Car = entry,
                CarClass = playerVehicle?.VehicleClass ?? "",
                CarType = car?.Model ?? "",
                CarChampionship = car?.Championship ?? "",
                TrackLengthMeters = PlausibleTrackLength(scoringInfo.LapDistance),
                SessionType = MapSessionType(scoringInfo.Session),
                SessionTime = ToF64(scoringInfo.CurrentElapsedTime),
                TotalSessionTime = PlausibleSessionLength(scoringInfo.EndElapsedTime),
                SessionTimeRemaining = PlausibleTimeRemaining(scoringInfo),
                MaxLaps = LapLimit(scoringInfo.MaxLaps),
                InCar = false,
                Phase = MapPhase(scoringInfo.GamePhase)
            },
            Conditions = MapConditions(scoringInfo),
            Field = field
        };
    }

    /// <summary>The scored field, or the previous list unchanged when neither the vehicle array nor any compound has changed since.</summary>
    private IReadOnlyList<FieldCar> MapField(IReadOnlyList<LmuVehicleScoring> vehicles, IReadOnlyDictionary<int, string> compounds)
    {
        if (this._fieldScoring.SequenceEqual(vehicles) && SameCompounds(this._fieldCompounds, compounds))
        {
            return this._field;
        }

        FieldCar[] field = new FieldCar[vehicles.Count];
        for (int i = 0; i < vehicles.Count; i++)
        {
            field[i] = MapFieldCar(vehicles[i], ClassPlace(vehicles, vehicles[i]), compounds.GetValueOrDefault(vehicles[i].Id));
        }

        this._fieldScoring = vehicles;
        this._fieldCompounds = compounds;
        this._field = field;
        return field;
    }

    private static bool SameCompounds(IReadOnlyDictionary<int, string> last, IReadOnlyDictionary<int, string> next) =>
        last.Count == next.Count
        && next.All(entry => last.TryGetValue(entry.Key, out string? held) && string.Equals(held, entry.Value, StringComparison.Ordinal));

    private static FieldCar MapFieldCar(LmuVehicleScoring vehicle, int classPlace, string? compound)
    {
        IReadOnlyList<double> lastSectors = SectorDurations(vehicle);
        // mSector: 0 is sector 3, then 1 and 2. A current-lap mark only counts once the car has
        // left that sector, since the fields can still hold the previous lap's marks before then.
        int sector = vehicle.Sector switch
        {
            1 => 1,
            2 => 2,
            0 => 3,
            _ => 0
        };
        double firstMark = ToF64(vehicle.CurrentSector1);
        double secondMark = ToF64(vehicle.CurrentSector2);
        bool firstDone = sector >= 2 && firstMark > 0;
        bool secondDone = sector == 3 && firstDone && secondMark > firstMark;

        return new FieldCar
        {
            Id = vehicle.Id,
            Driver = vehicle.DriverName,
            Car = vehicle.VehicleName,
            CarClass = vehicle.VehicleClass,
            IsPlayer = vehicle.IsPlayer,
            Place = vehicle.Place,
            ClassPlace = classPlace,
            LapsCompleted = Math.Max(0, (int)vehicle.TotalLaps),
            LapDistanceMeters = ToF64(vehicle.LapDistance),
            Sector = sector,
            BestLapTime = PositiveOrNull(vehicle.BestLapTime),
            LastLapTime = PositiveOrNull(vehicle.LastLapTime),
            LastLapSector1 = lastSectors.Count == 3 ? lastSectors[0] : null,
            LastLapSector2 = lastSectors.Count == 3 ? lastSectors[1] : null,
            LastLapSector3 = lastSectors.Count == 3 ? lastSectors[2] : null,
            CurrentLapSector1 = firstDone ? firstMark : null,
            CurrentLapSector2 = secondDone ? secondMark - firstMark : null,
            GapToLeader = ToF64(vehicle.TimeBehindLeader),
            LapsToLeader = vehicle.LapsBehindLeader,
            GapToNext = ToF64(vehicle.TimeBehindNext),
            LapsToNext = vehicle.LapsBehindNext,
            InPitLane = vehicle.InPits,
            InGarage = vehicle.InGarageStall,
            PitState = MapPitState(vehicle.PitState),
            PitStops = vehicle.PitStops,
            Penalties = Math.Max(0, (int)vehicle.Penalties),
            BlueFlag = vehicle.Flag == 6,
            Compound = compound,
            FinishStatus = vehicle.FinishStatus switch
            {
                1 => FinishStatus.Finished,
                2 => FinishStatus.Dnf,
                3 => FinishStatus.Disqualified,
                _ => FinishStatus.None
            },
            // Mirrored like the player's pose, so the field and lap traces share one map.
            PositionX = ToF32(-vehicle.Position.X),
            PositionZ = ToF32(vehicle.Position.Z)
        };
    }

    /// <summary>The car's place among its class, ranked by overall place; 0 when it has no place yet.</summary>
    private static int ClassPlace(IReadOnlyList<LmuVehicleScoring> vehicles, LmuVehicleScoring vehicle)
    {
        if (vehicle.Place == 0)
        {
            return 0;
        }

        return 1 + vehicles.Count(other =>
            other.Place > 0 && other.Place < vehicle.Place && other.VehicleClass == vehicle.VehicleClass);
    }

    /// <summary>mPitState: 0 none, 1 request, 2 entering, 3 stopped, 4 exiting.</summary>
    private static PitState MapPitState(byte pitState) => pitState switch
    {
        1 => PitState.Requested,
        2 => PitState.Entering,
        3 => PitState.Stopped,
        4 => PitState.Exiting,
        _ => PitState.None
    };

    /// <summary>A lap time, or null for the sim's "none yet" (0 or negative).</summary>
    private static double? PositiveOrNull(double seconds) =>
        double.IsFinite(seconds) && seconds > 0 ? seconds : null;

    /// <summary>
    /// The conditions the sim publishes. Fuel and tyre multipliers are deliberately absent:
    /// they live in PhysicsOptionsV01, which the shared-memory layout does not expose, so
    /// claiming a value would be inventing one.
    /// </summary>
    private static SessionConditions MapConditions(LmuScoringInfo scoringInfo)
    {
        // Both temperatures exactly zero is the empty block before a track is loaded, not weather.
        bool temperatures = scoringInfo.AmbientTemperature != 0 || scoringInfo.TrackTemperature != 0;
        return new SessionConditions
        {
            PathWetness = Fraction(scoringInfo.AveragePathWetness),
            TrackGripLevel = scoringInfo.TrackGripLevel > 0 ? scoringInfo.TrackGripLevel : null,
            FixedSetup = scoringInfo.IsFixedSetup,
            AirTemperatureCelsius = temperatures ? Temperature(scoringInfo.AmbientTemperature) : null,
            TrackTemperatureCelsius = temperatures ? Temperature(scoringInfo.TrackTemperature) : null,
            Raining = Fraction(scoringInfo.Raining),
        };
    }

    /// <summary>A plausible weather temperature in °C, or null.</summary>
    private static double? Temperature(double celsius) =>
        double.IsFinite(celsius) && celsius is > -60 and < 100 ? celsius : null;

    /// <summary>The body's state from the telemetry block: dents, the last impact and the warnings.</summary>
    private static DamageState MapDamage(LmuVehicleTelemetry telemetry) => new()
    {
        Dents = [.. telemetry.DentSeverity.Take(8).Select(dent => Math.Min((int)dent, 2))],
        LastImpactSessionTime = double.IsFinite(telemetry.LastImpactElapsedTime) && telemetry.LastImpactElapsedTime > 0
            ? telemetry.LastImpactElapsedTime
            : null,
        LastImpactMagnitude = ToF64(telemetry.LastImpactMagnitude),
        Overheating = telemetry.Overheating,
        DetachedParts = telemetry.DetachedParts,
    };

    /// <summary>A 0–1 reading, or null when it is not a usable fraction.</summary>
    private static double? Fraction(double value) =>
        double.IsFinite(value) && value is >= 0 and <= 1 ? value : null;

    /// <summary>A filtered pedal (what reached the car), clamped to 0–1; null when the reading is not a number.</summary>
    private static float? Applied(double value) =>
        double.IsFinite(value) ? (float)Math.Clamp(value, 0, 1) : null;

    /// <summary>The class byte in scoring's own spelling, the one history already stores; empty for the pace car or an unknown class.</summary>
    private static string ClassName(LmuVehicleClass vehicleClass) => vehicleClass switch
    {
        LmuVehicleClass.Hypercar => "Hyper",
        LmuVehicleClass.Lmp2Elms => "LMP2_ELMS",
        LmuVehicleClass.Lmp2 => "LMP2",
        LmuVehicleClass.Lmp3 => "LMP3",
        LmuVehicleClass.Gte => "GTE",
        LmuVehicleClass.Gt3 => "GT3",
        _ => "",
    };

    /// <summary>The championship byte spelled as the results archive spells it ("WEC 2026"); empty when unknown.</summary>
    private static string ChampionshipName(LmuVehicleChampionship championship) => championship switch
    {
        LmuVehicleChampionship.Wec2023 => "WEC 2023",
        LmuVehicleChampionship.Wec2024 => "WEC 2024",
        LmuVehicleChampionship.Wec2025 => "WEC 2025",
        LmuVehicleChampionship.Wec2026 => "WEC 2026",
        LmuVehicleChampionship.Elms2025 => "ELMS 2025",
        LmuVehicleChampionship.Elms2026 => "ELMS 2026",
        _ => "",
    };

    /// <summary>What the cockpit last said about the entry <see cref="VehicleName"/> is.</summary>
    private sealed record LmuCarIdentity(string VehicleName, string Model, string Championship);

    private double MonotonicCurrentLapTime(
        double scoringRaw,
        double telemetryElapsed,
        double telemetryLapStart,
        int lapNumber,
        LmuScoringInfo scoringInfo)
    {
        double scoringLapTime = ClampNonNegative(ToF64(scoringRaw));
        double telemetryLapTime = ClampNonNegative(ToF64(telemetryElapsed - telemetryLapStart));
        double sessionElapsed = ClampNonNegative(ToF64(scoringInfo.CurrentElapsedTime));

        bool sessionChanged = this._lapTimeValid && scoringInfo.Session != this._lapTimeSession;
        bool lapWentBack = this._lapTimeValid && lapNumber < this._lapTimeLap;
        bool sessionReset = this._lapTimeValid && sessionElapsed + SessionTimeResetThreshold < this._lapTimeSessionElapsed;
        bool newLap = this._lapTimeValid && lapNumber != this._lapTimeLap;

        if (!this._lapTimeValid)
        {
            double lapTime = telemetryLapTime;
            if (lapTime <= 0)
            {
                lapTime = scoringLapTime;
            }

            this.SetLapTimeState(scoringInfo.Session, lapNumber, lapTime, sessionElapsed);
            return lapTime;
        }

        if (sessionChanged || lapWentBack || sessionReset || newLap)
        {
            double lapTime = TransitionLapTimeSeed(scoringLapTime, telemetryLapTime);
            this.SetLapTimeState(scoringInfo.Session, lapNumber, lapTime, sessionElapsed);
            return lapTime;
        }

        double candidate = telemetryLapTime;
        if (candidate <= 0)
        {
            candidate = scoringLapTime;
        }

        double sessionDelta = sessionElapsed - this._lapTimeSessionElapsed;
        if (sessionDelta < 0)
        {
            sessionDelta = 0;
        }

        double maxAdvance = LapTimeSpikeThreshold + sessionDelta;
        if (telemetryLapTime > 0 && telemetryLapTime > this._lapTimeMax + maxAdvance)
        {
            if (scoringLapTime > this._lapTimeMax && scoringLapTime <= this._lapTimeMax + maxAdvance)
            {
                candidate = scoringLapTime;
            }
            else
            {
                candidate = this._lapTimeMax;
            }
        }

        if (candidate < this._lapTimeMax)
        {
            candidate = this._lapTimeMax;
        }
        else
        {
            this._lapTimeMax = candidate;
        }

        if (sessionElapsed > this._lapTimeSessionElapsed)
        {
            this._lapTimeSessionElapsed = sessionElapsed;
        }

        return candidate;
    }

    private void SetLapTimeState(int session, int lapNumber, double lapTime, double sessionElapsed)
    {
        this._lapTimeValid = true;
        this._lapTimeSession = session;
        this._lapTimeLap = lapNumber;
        this._lapTimeMax = lapTime;
        this._lapTimeSessionElapsed = sessionElapsed;
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
            return this.AverageFuelDelta();
        }

        if (this._fuelLap is null)
        {
            this._fuelLap = lapNumber;
            this._fuelAtLapStart = fuel;
            return this.AverageFuelDelta();
        }

        if (lapNumber != this._fuelLap)
        {
            if (lapNumber > this._fuelLap && this._fuelAtLapStart is { } startFuel)
            {
                float delta = startFuel - fuel;
                if (delta > 0)
                {
                    this._completedLapFuelDeltas.Enqueue(delta);
                    while (this._completedLapFuelDeltas.Count > FuelDeltaWindow)
                    {
                        this._completedLapFuelDeltas.Dequeue();
                    }
                }
            }

            this._fuelLap = lapNumber;
            this._fuelAtLapStart = fuel;
        }

        return this.AverageFuelDelta();
    }

    private float AverageFuelDelta()
    {
        if (this._completedLapFuelDeltas.Count == 0)
        {
            return 0;
        }

        return this._completedLapFuelDeltas.Sum() / this._completedLapFuelDeltas.Count;
    }

    // Rolling virtual-energy burn per completed lap, mirroring FuelPerLap: track the
    // reading at each lap start and average the drop over the last FuelDeltaWindow laps.
    // Units follow the source channel (LMU reports virtual energy as a percentage), so
    // downstream "laps remaining" cancels units cleanly against the current level.
    private float VirtualEnergyPerLap(int lapNumber, float energy)
    {
        if (energy <= 0)
        {
            return this.AverageEnergyDelta();
        }

        if (this._energyLap is null)
        {
            this._energyLap = lapNumber;
            this._energyAtLapStart = energy;
            return this.AverageEnergyDelta();
        }

        if (lapNumber != this._energyLap)
        {
            if (lapNumber > this._energyLap && this._energyAtLapStart is { } startEnergy)
            {
                float delta = startEnergy - energy;
                if (delta > 0)
                {
                    this._completedLapEnergyDeltas.Enqueue(delta);
                    while (this._completedLapEnergyDeltas.Count > FuelDeltaWindow)
                    {
                        this._completedLapEnergyDeltas.Dequeue();
                    }
                }
            }

            this._energyLap = lapNumber;
            this._energyAtLapStart = energy;
        }

        return this.AverageEnergyDelta();
    }

    private float AverageEnergyDelta()
    {
        if (this._completedLapEnergyDeltas.Count == 0)
        {
            return 0;
        }

        return this._completedLapEnergyDeltas.Sum() / this._completedLapEnergyDeltas.Count;
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
        float inner = TemperatureCelsius(wheel.TempInnerKelvin);
        float middle = TemperatureCelsius(wheel.TempMiddleKelvin);
        float outer = TemperatureCelsius(wheel.TempOuterKelvin);

        return new TireState
        {
            Position = position,
            TempInnerCelsius = inner,
            TempMiddleCelsius = middle,
            TempOuterCelsius = outer,
            // The tread average across the three sensors is the temperature a driver
            // reads in-game. Without it, consumers fell back to the carcass reading,
            // which is a different (much cooler, slower) quantity.
            TempSurfaceCelsius = SurfaceAverage(inner, middle, outer),
            TempCoreCelsius = TemperatureCelsius(wheel.CarcassTempKelvin),
            PressureKPa = ToF32(wheel.PressureKPa),
            WearPercent = ToF32(wheel.WearFraction * 100),
            Compound = compound,
            RotationRadiansPerSecond = ToF32(wheel.RotationRadiansPerSecond),
            LongitudinalPatchVelocity = ToF32(wheel.LongitudinalPatchVelocity),
            LateralPatchVelocity = ToF32(wheel.LateralPatchVelocity),
            LongitudinalGroundVelocity = ToF32(wheel.LongitudinalGroundVelocity),
            LateralGroundVelocity = ToF32(wheel.LateralGroundVelocity),
            PatchSlidingFraction = ToF32(wheel.GripFraction),
            LoadNewtons = ToF32(wheel.LoadNewtons),
            LateralForceNewtons = ToF32(wheel.LateralForceNewtons),
            LongitudinalForceNewtons = ToF32(wheel.LongitudinalForceNewtons),
            CamberRadians = ToF32(wheel.CamberRadians),
            RadiusMeters = wheel.RadiusCentimeters / 100f,
            BrakeTempCelsius = ToF32(wheel.BrakeTempCelsius),
            SuspensionDeflectionMeters = ToF32(wheel.SuspensionDeflectionMeters),
            RideHeightMeters = ToF32(wheel.RideHeightMeters),
            Surface = SurfaceOf(wheel.SurfaceType),
            Flat = wheel.Flat,
            Detached = wheel.Detached
        };
    }

    private static TireSurface SurfaceOf(byte surfaceType) => surfaceType switch
    {
        0 => TireSurface.Dry,
        1 => TireSurface.Wet,
        2 => TireSurface.Grass,
        3 => TireSurface.Dirt,
        4 => TireSurface.Gravel,
        5 => TireSurface.RumbleStrip,
        6 => TireSurface.Special,
        _ => TireSurface.Unknown
    };

    /// <summary>
    /// Kelvin → Celsius for a channel that reports 0 K when it has no reading (out of
    /// the car, or a field this build does not fill). A plain conversion would turn
    /// "no data" into a plausible-looking -273 °C, so absent readings stay 0.
    /// </summary>
    private static float TemperatureCelsius(double kelvin) =>
        kelvin <= 0 || !double.IsFinite(kelvin) ? 0 : KelvinToCelsius(kelvin);

    private static float SurfaceAverage(float inner, float middle, float outer)
    {
        float sum = 0f;
        int count = 0;
        foreach (float reading in new[] { inner, middle, outer })
        {
            if (reading > 0)
            {
                sum += reading;
                count++;
            }
        }

        return count == 0 ? 0 : sum / count;
    }

    /// <summary>
    /// mGamePhase: 0 before the session, 1–3 reconnaissance, grid and formation, 4 the start
    /// lights, 5 green, 6 full course yellow or safety car, 7 stopped, 8 over. 9 (paused) and
    /// anything newer say nothing about the track.
    /// </summary>
    private static SessionPhase MapPhase(byte phase) => phase switch
    {
        0 => SessionPhase.BeforeStart,
        1 or 2 or 3 => SessionPhase.Formation,
        4 => SessionPhase.Countdown,
        5 => SessionPhase.Green,
        6 => SessionPhase.FullCourseYellow,
        7 => SessionPhase.Stopped,
        8 => SessionPhase.Over,
        _ => SessionPhase.Unknown
    };

    /// <summary>Whether mSectorFlag shows a yellow in <paramref name="sector"/> (1–3); the array runs like mSector, sector 3 first.</summary>
    private static bool SectorYellow(LmuScoringInfo scoring, int sector) =>
        scoring.SectorFlags.Count == 3 && scoring.SectorFlags[sector % 3] > 0;

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
        double speed = Math.Sqrt(velocity.X * velocity.X + velocity.Y * velocity.Y + velocity.Z * velocity.Z);
        return ToF32(speed);
    }

    /// <summary>
    /// The car's pose in the contract's convention. LMU is left-handed with +X left and +Z back;
    /// the contract is right-handed with +X right, so X is mirrored on both the world and the
    /// body frame (R = F·Rₗ·F, F = diag(-1, 1, 1)). Angular velocity is a pseudovector, so it
    /// picks up the mirror's determinant as well: ω = -F·ωₗ. Null when the matrix is not a
    /// rotation, which is how a car that has not spawned yet reads.
    /// </summary>
    private static CarPose? MapPose(LmuVehicleTelemetry telemetry)
    {
        LmuVector3 x = telemetry.OrientationRowX;
        LmuVector3 y = telemetry.OrientationRowY;
        LmuVector3 z = telemetry.OrientationRowZ;
        double[,] r =
        {
            { x.X, -x.Y, -x.Z },
            { -y.X, y.Y, y.Z },
            { -z.X, z.Y, z.Z },
        };

        if (!TryQuaternion(r, out double qx, out double qy, out double qz, out double qw))
        {
            return null;
        }

        LmuVector3 position = telemetry.Position;
        LmuVector3 velocity = telemetry.LocalVelocity;
        LmuVector3 rotation = telemetry.LocalRotation;
        return new CarPose
        {
            PositionX = -position.X,
            PositionY = position.Y,
            PositionZ = position.Z,
            OrientationX = (float)qx,
            OrientationY = (float)qy,
            OrientationZ = (float)qz,
            OrientationW = (float)qw,
            VelocityX = ToF32(-velocity.X),
            VelocityY = ToF32(velocity.Y),
            VelocityZ = ToF32(velocity.Z),
            AngularVelocityX = ToF32(rotation.X),
            AngularVelocityY = ToF32(-rotation.Y),
            AngularVelocityZ = ToF32(-rotation.Z),
        };
    }

    /// <summary>
    /// A unit quaternion from a rotation matrix (world = r · body), branching on the largest
    /// diagonal term so the square root never runs near zero. False for a matrix that is not
    /// close to a rotation.
    /// </summary>
    private static bool TryQuaternion(double[,] r, out double x, out double y, out double z, out double w)
    {
        x = y = z = 0;
        w = 1;
        foreach (double value in r)
        {
            if (!double.IsFinite(value))
            {
                return false;
            }
        }

        double determinant =
            r[0, 0] * ((r[1, 1] * r[2, 2]) - (r[1, 2] * r[2, 1]))
            - r[0, 1] * ((r[1, 0] * r[2, 2]) - (r[1, 2] * r[2, 0]))
            + r[0, 2] * ((r[1, 0] * r[2, 1]) - (r[1, 1] * r[2, 0]));
        if (Math.Abs(determinant - 1) > 0.1)
        {
            return false;
        }

        double trace = r[0, 0] + r[1, 1] + r[2, 2];
        if (trace > 0)
        {
            double s = Math.Sqrt(trace + 1) * 2;
            w = 0.25 * s;
            x = (r[2, 1] - r[1, 2]) / s;
            y = (r[0, 2] - r[2, 0]) / s;
            z = (r[1, 0] - r[0, 1]) / s;
        }
        else if (r[0, 0] > r[1, 1] && r[0, 0] > r[2, 2])
        {
            double s = Math.Sqrt(1 + r[0, 0] - r[1, 1] - r[2, 2]) * 2;
            w = (r[2, 1] - r[1, 2]) / s;
            x = 0.25 * s;
            y = (r[0, 1] + r[1, 0]) / s;
            z = (r[0, 2] + r[2, 0]) / s;
        }
        else if (r[1, 1] > r[2, 2])
        {
            double s = Math.Sqrt(1 + r[1, 1] - r[0, 0] - r[2, 2]) * 2;
            w = (r[0, 2] - r[2, 0]) / s;
            x = (r[0, 1] + r[1, 0]) / s;
            y = 0.25 * s;
            z = (r[1, 2] + r[2, 1]) / s;
        }
        else
        {
            double s = Math.Sqrt(1 + r[2, 2] - r[0, 0] - r[1, 1]) * 2;
            w = (r[1, 0] - r[0, 1]) / s;
            x = (r[0, 2] + r[2, 0]) / s;
            y = (r[1, 2] + r[2, 1]) / s;
            z = 0.25 * s;
        }

        double length = Math.Sqrt((x * x) + (y * y) + (z * z) + (w * w));
        x /= length;
        y /= length;
        z /= length;
        w /= length;
        return true;
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

    /// <summary>
    /// The longest session length worth believing. Endurance racing legitimately reaches
    /// 24 hours, so the ceiling sits above that with room to spare; anything beyond it is
    /// the game's way of saying "no time limit" rather than a real duration.
    /// </summary>
    private const double MaxPlausibleSessionSeconds = 30 * 60 * 60;

    /// <summary>A 24-hour race on the shortest circuit stays well under this.</summary>
    private const int MaxPlausibleLaps = 10_000;

    /// <summary>
    /// A session length only survives if it could describe a real timed session. Zero,
    /// negative, non-finite and absurd values become null (unknown) instead of a number a
    /// fuel estimate would silently trust.
    /// </summary>
    private static double? PlausibleSessionLength(double value) =>
        double.IsFinite(value) && value > 0 && value <= MaxPlausibleSessionSeconds
            ? value
            : null;

    /// <summary>
    /// Time left in the session, reported only when the session has a believable length: a
    /// remainder without a total describes nothing, and a lap-based session's field is
    /// leftover noise rather than a countdown.
    /// </summary>
    private static double? PlausibleTimeRemaining(LmuScoringInfo scoringInfo)
    {
        if (PlausibleSessionLength(scoringInfo.EndElapsedTime) is not { } total)
        {
            return null;
        }

        float remaining = scoringInfo.SessionTimeRemaining;
        return float.IsFinite(remaining) && remaining >= 0 && remaining <= total ? remaining : null;
    }

    /// <summary>
    /// Track length, reported only when the game has actually loaded a course. Zero is what
    /// the field holds on the main menu, and a zero length would look like a real
    /// cross-check value to anything comparing layouts.
    /// </summary>
    private static double? PlausibleTrackLength(double value) =>
        double.IsFinite(value) && value > 0 ? value : null;

    /// <summary>
    /// The session's lap limit, or 0 when it has none. LMU reports a session without a lap
    /// limit as int.MaxValue, which anything reading "MaxLaps > 0" would take for a
    /// lap-based race of two billion laps.
    /// </summary>
    private static int LapLimit(int value) =>
        value > 0 && value <= MaxPlausibleLaps ? value : 0;

    /// <summary>
    /// Turns the sim's cumulative sector marks into per-sector durations: mLastSector1 is
    /// the S1 time, mLastSector2 is S1+S2, and the final sector is the remainder of the lap.
    /// Returns empty unless all three marks increase in order, so an out lap or a partially
    /// filled record yields nothing rather than negative sectors.
    /// </summary>
    private static IReadOnlyList<double> SectorDurations(LmuVehicleScoring scoring)
    {
        double firstMark = ToF64(scoring.LastSector1);
        double secondMark = ToF64(scoring.LastSector2);
        double lapTime = ToF64(scoring.LastLapTime);

        if (firstMark <= 0 || secondMark <= firstMark || lapTime <= secondMark)
        {
            return [];
        }

        return [firstMark, secondMark - firstMark, lapTime - secondMark];
    }

    private static double ClampNonNegative(double value) => value < 0 ? 0 : value;

    private static double ToF64(double value) => double.IsFinite(value) ? value : 0;

    private static float ToF32(double value)
    {
        if (!double.IsFinite(value))
        {
            return 0;
        }

        float converted = (float)value;
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
