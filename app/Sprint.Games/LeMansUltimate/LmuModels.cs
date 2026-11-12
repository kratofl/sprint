namespace Sprint.Games.LeMansUltimate;

internal readonly record struct LmuVector3(double X, double Y, double Z);

internal sealed record LmuWheel
{
    public double PressureKPa { get; init; }
    public double TempInnerKelvin { get; init; }
    public double TempMiddleKelvin { get; init; }
    public double TempOuterKelvin { get; init; }
    public double WearFraction { get; init; }
    public double CarcassTempKelvin { get; init; }
    public double BrakeTempCelsius { get; init; }
}

internal sealed record LmuVehicleTelemetry
{
    public int LapNumber { get; init; }
    public double ElapsedTime { get; init; }
    public double LapStartElapsedTime { get; init; }
    public string VehicleName { get; init; } = "";
    public LmuVector3 Position { get; init; }
    public LmuVector3 LocalVelocity { get; init; }

    /// <summary>mOri: the orientation matrix's rows, world = rows · local, in LMU's left-handed axes.</summary>
    public LmuVector3 OrientationRowX { get; init; }
    public LmuVector3 OrientationRowY { get; init; }
    public LmuVector3 OrientationRowZ { get; init; }

    /// <summary>mLocalRot: angular velocity in the car's frame, rad/s.</summary>
    public LmuVector3 LocalRotation { get; init; }
    public int Gear { get; init; }
    public double EngineRpm { get; init; }
    public double EngineMaxRpm { get; init; }
    public double UnfilteredThrottle { get; init; }
    public double UnfilteredBrake { get; init; }
    public double UnfilteredSteering { get; init; }
    public double UnfilteredClutch { get; init; }
    public double FilteredThrottle { get; init; }
    public double FilteredBrake { get; init; }
    public double FilteredSteering { get; init; }
    public double FilteredClutch { get; init; }
    public double FuelLiters { get; init; }

    /// <summary>mFuelCapacity: the tank's size, litres.</summary>
    public double FuelCapacityLiters { get; init; }

    /// <summary>mOverheating: whether the overheating warning shows.</summary>
    public bool Overheating { get; init; }

    /// <summary>mDetached: whether any part other than a wheel has come off.</summary>
    public bool DetachedParts { get; init; }

    /// <summary>mDentSeverity[8]: 0 none, 1 some, 2 more, at eight places around the car.</summary>
    public IReadOnlyList<byte> DentSeverity { get; init; } = new byte[8];

    /// <summary>mLastImpactET: session time of the last impact; 0 before the first.</summary>
    public double LastImpactElapsedTime { get; init; }

    /// <summary>mLastImpactMagnitude.</summary>
    public double LastImpactMagnitude { get; init; }
    public int CurrentSectorRaw { get; init; }
    public string FrontCompoundName { get; init; } = "";
    public string RearCompoundName { get; init; } = "";
    public double RearBrakeBias { get; init; }
    public bool AbsActive { get; init; }
    public bool TractionControlActive { get; init; }
    public byte TractionControl { get; init; }
    public byte TractionControlMax { get; init; }
    public byte TractionControlSlip { get; init; }
    public byte TractionControlSlipMax { get; init; }
    public byte TractionControlCut { get; init; }
    public byte TractionControlCutMax { get; init; }
    public byte Abs { get; init; }
    public byte AbsMax { get; init; }
    public byte MotorMap { get; init; }
    public byte MotorMapMax { get; init; }
    public byte Migration { get; init; }
    public byte MigrationMax { get; init; }
    public byte FrontAntiSway { get; init; }
    public byte FrontAntiSwayMax { get; init; }
    public byte RearAntiSway { get; init; }
    public byte RearAntiSwayMax { get; init; }

    /// <summary>mSpeedLimiter: whether the pit limiter is switched on.</summary>
    public bool SpeedLimiter { get; init; }
    public byte TrackLimitSteps { get; init; }
    public float RegenPower { get; init; }
    public float StateOfCharge { get; init; }
    public float VirtualEnergy { get; init; }
    public float GapAhead { get; init; }
    public float GapBehind { get; init; }

    /// <summary>mVehicleModel: the car itself (e.g. "Oreca 07"), where <see cref="VehicleName"/> is the livery.</summary>
    public string VehicleModel { get; init; } = "";

    /// <summary>mVehicleClass.</summary>
    public LmuVehicleClass VehicleClass { get; init; } = LmuVehicleClass.Unknown;

    /// <summary>mVehicleChampionship.</summary>
    public LmuVehicleChampionship VehicleChampionship { get; init; } = LmuVehicleChampionship.Unknown;
    public IReadOnlyList<LmuWheel> Wheels { get; init; } = Array.Empty<LmuWheel>();
}

/// <summary>IP_VehicleClass, as the shared-memory header numbers it (one byte).</summary>
internal enum LmuVehicleClass : byte
{
    Hypercar = 0x00,
    Lmp2Elms = 0x02,
    Lmp2 = 0x03,
    Lmp3 = 0x04,
    Gte = 0x05,
    Gt3 = 0x06,
    PaceCar = 0x08,
    Unknown = 0xFF,
}

/// <summary>IP_VehicleChampionship, as the shared-memory header numbers it (one byte).</summary>
internal enum LmuVehicleChampionship : byte
{
    Wec2023 = 0x00,
    Wec2024 = 0x01,
    Wec2025 = 0x02,
    Wec2026 = 0x03,
    Elms2025 = 0x10,
    Elms2026 = 0x11,
    Unknown = 0xFF,
}

internal sealed record LmuVehicleScoring
{
    /// <summary>mID: the slot id.</summary>
    public int Id { get; init; }
    public string DriverName { get; init; } = "";

    /// <summary>mVehicleName: available from scoring, so it exists before the cockpit does.</summary>
    public string VehicleName { get; init; } = "";

    /// <summary>mVehicleClass, e.g. "Hypercar".</summary>
    public string VehicleClass { get; init; } = "";

    /// <summary>mIsPlayer: the sim stating which entry belongs to the player.</summary>
    public bool IsPlayer { get; init; }

    public double BestLapTime { get; init; }
    public double LastLapTime { get; init; }
    public short PitStops { get; init; }
    public short Penalties { get; init; }
    public byte Place { get; init; }
    public double LapDistance { get; init; }
    public double LastSector1 { get; init; }
    public double LastSector2 { get; init; }
    public byte PitState { get; init; }
    public double TimeIntoLap { get; init; }
    public bool UnderYellow { get; init; }
    public byte CountLapFlag { get; init; }
    public bool InGarageStall { get; init; }
    public bool DrsState { get; init; }
    public sbyte FinishStatus { get; init; }

    /// <summary>mTotalLaps: laps completed.</summary>
    public short TotalLaps { get; init; }

    /// <summary>mSector: 0 is sector 3, 1 sector 1, 2 sector 2.</summary>
    public sbyte Sector { get; init; }

    /// <summary>mCurSector1/mCurSector2: the lap being driven's cumulative marks, when valid.</summary>
    public double CurrentSector1 { get; init; }
    public double CurrentSector2 { get; init; }

    /// <summary>mInPits: between pit entrance and pit exit.</summary>
    public bool InPits { get; init; }
    public double TimeBehindNext { get; init; }
    public int LapsBehindNext { get; init; }
    public double TimeBehindLeader { get; init; }
    public int LapsBehindLeader { get; init; }

    /// <summary>mPos: world position in LMU's left-handed axes.</summary>
    public LmuVector3 Position { get; init; }
}

internal sealed record LmuScoringInfo
{
    public string TrackName { get; init; } = "";
    public int Session { get; init; }
    public double CurrentElapsedTime { get; init; }

    /// <summary>mEndET: the session's ending time, i.e. its total length for a timed session.</summary>
    public double EndElapsedTime { get; init; }

    /// <summary>mSessionTimeRemaining: seconds left in a timed session.</summary>
    public float SessionTimeRemaining { get; init; }
    public int MaxLaps { get; init; }
    public double LapDistance { get; init; }
    public int NumVehicles { get; init; }
    public byte GamePhase { get; init; }
    public bool InRealtime { get; init; }

    /// <summary>mAvgPathWetness: average wetness on the main path, 0–1.</summary>
    public double AveragePathWetness { get; init; }

    /// <summary>mIsFixedSetup: whether the session forces a fixed setup.</summary>
    public bool IsFixedSetup { get; init; }

    /// <summary>mTrackGripLevel: the sim's own grip grade.</summary>
    public byte TrackGripLevel { get; init; }

    /// <summary>mRaining: how hard it rains, 0–1.</summary>
    public double Raining { get; init; }

    /// <summary>mAmbientTemp, °C.</summary>
    public double AmbientTemperature { get; init; }

    /// <summary>mTrackTemp, °C.</summary>
    public double TrackTemperature { get; init; }
}

internal sealed record LmuParsedFrame
{
    public required LmuScoringInfo ScoringInfo { get; init; }
    public required bool PlayerHasVehicle { get; init; }
    public required int PlayerIndex { get; init; }
    public LmuVehicleTelemetry? Telemetry { get; init; }
    public LmuVehicleScoring? Scoring { get; init; }

    /// <summary>
    /// The player's scoring entry as found in the vehicle array, resolved from mIsPlayer
    /// rather than from the telemetry block's player index. Present before the driver is in
    /// the cockpit — which is the only place the lobby car can come from.
    /// </summary>
    public LmuVehicleScoring? PlayerVehicle { get; init; }

    /// <summary>Every entry of the vehicle scoring array, in array order (not by place).</summary>
    public IReadOnlyList<LmuVehicleScoring> Vehicles { get; init; } = [];

    /// <summary>
    /// Each car's front tyre compound by slot id (mID), from the telemetry array, which holds
    /// every active car, not just the player's. Cars whose telemetry names no compound are absent.
    /// </summary>
    public IReadOnlyDictionary<int, string> FrontCompounds { get; init; } = new Dictionary<int, string>();
    public bool PlayerInCar => this.PlayerHasVehicle && this.ScoringInfo.InRealtime && this.Telemetry is not null && this.Scoring is not null;
}
