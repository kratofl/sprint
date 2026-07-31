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
}

internal sealed record LmuVehicleTelemetry
{
    public int LapNumber { get; init; }
    public double ElapsedTime { get; init; }
    public double LapStartElapsedTime { get; init; }
    public string VehicleName { get; init; } = "";
    public LmuVector3 Position { get; init; }
    public LmuVector3 LocalVelocity { get; init; }
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
    public int CurrentSectorRaw { get; init; }
    public string FrontCompoundName { get; init; } = "";
    public string RearCompoundName { get; init; } = "";
    public double RearBrakeBias { get; init; }
    public bool AbsActive { get; init; }
    public bool TractionControlActive { get; init; }
    public byte TractionControl { get; init; }
    public byte TractionControlMax { get; init; }
    public byte Abs { get; init; }
    public byte AbsMax { get; init; }
    public byte MotorMap { get; init; }
    public byte MotorMapMax { get; init; }
    public byte TrackLimitSteps { get; init; }
    public float RegenPower { get; init; }
    public float StateOfCharge { get; init; }
    public float VirtualEnergy { get; init; }
    public float GapAhead { get; init; }
    public float GapBehind { get; init; }
    public IReadOnlyList<LmuWheel> Wheels { get; init; } = Array.Empty<LmuWheel>();
}

internal sealed record LmuVehicleScoring
{
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
}

internal sealed record LmuScoringInfo
{
    public string TrackName { get; init; } = "";
    public int Session { get; init; }
    public double CurrentElapsedTime { get; init; }
    public int MaxLaps { get; init; }
    public double LapDistance { get; init; }
    public int NumVehicles { get; init; }
    public byte GamePhase { get; init; }
    public bool InRealtime { get; init; }
}

internal sealed record LmuParsedFrame
{
    public required LmuScoringInfo ScoringInfo { get; init; }
    public required bool PlayerHasVehicle { get; init; }
    public required int PlayerIndex { get; init; }
    public LmuVehicleTelemetry? Telemetry { get; init; }
    public LmuVehicleScoring? Scoring { get; init; }
    public bool PlayerInCar => PlayerHasVehicle && ScoringInfo.InRealtime && Telemetry is not null && Scoring is not null;
}
