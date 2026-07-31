namespace Sprint.Games.LeMansUltimate;

internal static class LmuParser
{
    public static LmuParsedFrame Parse(ReadOnlySpan<byte> buffer)
    {
        _ = LmuBinary.Slice(buffer, 0, LmuBinary.TotalBufferSize);

        var scoringInfo = ParseScoringInfo(LmuBinary.Slice(buffer, LmuBinary.ScoringStart, LmuBinary.ScoringInfoSize));
        var playerIndex = LmuBinary.ReadByte(buffer, LmuBinary.PlayerIndexOffset);
        var playerHasVehicle = LmuBinary.ReadBool(buffer, LmuBinary.PlayerHasVehicleOffset);

        if (playerIndex >= LmuBinary.MaxVehicles)
        {
            throw new LmuDecodeException($"LMU player index {playerIndex} is outside max vehicle count {LmuBinary.MaxVehicles}");
        }

        if (!PlayerInCar(playerHasVehicle, scoringInfo))
        {
            return new LmuParsedFrame
            {
                ScoringInfo = scoringInfo,
                PlayerHasVehicle = playerHasVehicle,
                PlayerIndex = playerIndex
            };
        }

        var telemetryOffset = LmuBinary.TelemetryInfoBase + playerIndex * LmuBinary.VehicleTelemetrySize;
        var scoringOffset = LmuBinary.VehicleScoringBase + playerIndex * LmuBinary.VehicleScoringSize;

        return new LmuParsedFrame
        {
            ScoringInfo = scoringInfo,
            PlayerHasVehicle = playerHasVehicle,
            PlayerIndex = playerIndex,
            Telemetry = ParseVehicleTelemetry(LmuBinary.Slice(buffer, telemetryOffset, LmuBinary.VehicleTelemetrySize)),
            Scoring = ParseVehicleScoring(LmuBinary.Slice(buffer, scoringOffset, LmuBinary.VehicleScoringSize))
        };
    }

    public static bool PlayerInCar(bool playerHasVehicle, LmuScoringInfo scoringInfo) =>
        playerHasVehicle && scoringInfo.InRealtime;

    private static LmuVector3 ParseVector3(ReadOnlySpan<byte> bytes, int offset) =>
        new(
            LmuBinary.ReadDouble(bytes, offset),
            LmuBinary.ReadDouble(bytes, offset + 8),
            LmuBinary.ReadDouble(bytes, offset + 16));

    private static LmuScoringInfo ParseScoringInfo(ReadOnlySpan<byte> bytes)
    {
        return new LmuScoringInfo
        {
            TrackName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 0, 64)),
            Session = LmuBinary.ReadInt32(bytes, 64),
            CurrentElapsedTime = LmuBinary.ReadDouble(bytes, 68),
            MaxLaps = LmuBinary.ReadInt32(bytes, 84),
            LapDistance = LmuBinary.ReadDouble(bytes, 88),
            NumVehicles = LmuBinary.ReadInt32(bytes, 104),
            GamePhase = LmuBinary.ReadByte(bytes, 108),
            InRealtime = LmuBinary.ReadBool(bytes, 114)
        };
    }

    private static LmuVehicleTelemetry ParseVehicleTelemetry(ReadOnlySpan<byte> bytes)
    {
        var wheels = new List<LmuWheel>(capacity: 4);
        const int wheelsBase = 848;
        const int wheelSize = 260;
        for (var i = 0; i < 4; i++)
        {
            var wheel = LmuBinary.Slice(bytes, wheelsBase + i * wheelSize, wheelSize);
            wheels.Add(new LmuWheel
            {
                PressureKPa = LmuBinary.ReadDouble(wheel, 120),
                TempInnerKelvin = LmuBinary.ReadDouble(wheel, 128),
                TempMiddleKelvin = LmuBinary.ReadDouble(wheel, 136),
                TempOuterKelvin = LmuBinary.ReadDouble(wheel, 144),
                WearFraction = LmuBinary.ReadDouble(wheel, 152),
                CarcassTempKelvin = LmuBinary.ReadDouble(wheel, 204)
            });
        }

        return new LmuVehicleTelemetry
        {
            LapNumber = LmuBinary.ReadInt32(bytes, 20),
            ElapsedTime = LmuBinary.ReadDouble(bytes, 12),
            LapStartElapsedTime = LmuBinary.ReadDouble(bytes, 24),
            VehicleName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 32, 64)),
            Position = ParseVector3(bytes, 160),
            LocalVelocity = ParseVector3(bytes, 184),
            Gear = LmuBinary.ReadInt32(bytes, 352),
            EngineRpm = LmuBinary.ReadDouble(bytes, 356),
            UnfilteredThrottle = LmuBinary.ReadDouble(bytes, 388),
            UnfilteredBrake = LmuBinary.ReadDouble(bytes, 396),
            UnfilteredSteering = LmuBinary.ReadDouble(bytes, 404),
            UnfilteredClutch = LmuBinary.ReadDouble(bytes, 412),
            FilteredThrottle = LmuBinary.ReadDouble(bytes, 420),
            FilteredBrake = LmuBinary.ReadDouble(bytes, 428),
            FilteredSteering = LmuBinary.ReadDouble(bytes, 436),
            FilteredClutch = LmuBinary.ReadDouble(bytes, 444),
            FuelLiters = LmuBinary.ReadDouble(bytes, 524),
            EngineMaxRpm = LmuBinary.ReadDouble(bytes, 532),
            CurrentSectorRaw = LmuBinary.ReadInt32(bytes, 600),
            FrontCompoundName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 620, 18)),
            RearCompoundName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 638, 18)),
            RearBrakeBias = LmuBinary.ReadDouble(bytes, 664),
            AbsActive = LmuBinary.ReadBool(bytes, 746),
            TractionControlActive = LmuBinary.ReadBool(bytes, 747),
            TractionControl = LmuBinary.ReadByte(bytes, 750),
            TractionControlMax = LmuBinary.ReadByte(bytes, 751),
            Abs = LmuBinary.ReadByte(bytes, 756),
            AbsMax = LmuBinary.ReadByte(bytes, 757),
            MotorMap = LmuBinary.ReadByte(bytes, 758),
            MotorMapMax = LmuBinary.ReadByte(bytes, 759),
            TrackLimitSteps = LmuBinary.ReadByte(bytes, 767),
            RegenPower = LmuBinary.ReadSingle(bytes, 768),
            StateOfCharge = LmuBinary.ReadSingle(bytes, 772),
            VirtualEnergy = LmuBinary.ReadSingle(bytes, 776),
            GapAhead = LmuBinary.ReadSingle(bytes, 780),
            GapBehind = LmuBinary.ReadSingle(bytes, 784),
            Wheels = wheels
        };
    }

    private static LmuVehicleScoring ParseVehicleScoring(ReadOnlySpan<byte> bytes)
    {
        return new LmuVehicleScoring
        {
            BestLapTime = LmuBinary.ReadDouble(bytes, 144),
            LastLapTime = LmuBinary.ReadDouble(bytes, 168),
            PitStops = LmuBinary.ReadInt16(bytes, 192),
            Penalties = LmuBinary.ReadInt16(bytes, 194),
            Place = LmuBinary.ReadByte(bytes, 199),
            LapDistance = LmuBinary.ReadDouble(bytes, 104),
            LastSector1 = LmuBinary.ReadDouble(bytes, 152),
            LastSector2 = LmuBinary.ReadDouble(bytes, 160),
            PitState = LmuBinary.ReadByte(bytes, 457),
            TimeIntoLap = LmuBinary.ReadDouble(bytes, 464),
            UnderYellow = LmuBinary.ReadBool(bytes, 505),
            CountLapFlag = LmuBinary.ReadByte(bytes, 506),
            InGarageStall = LmuBinary.ReadBool(bytes, 507),
            DrsState = LmuBinary.ReadBool(bytes, 579),
            FinishStatus = unchecked((sbyte)LmuBinary.ReadByte(bytes, 103))
        };
    }
}
