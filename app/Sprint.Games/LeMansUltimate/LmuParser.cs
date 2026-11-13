namespace Sprint.Games.LeMansUltimate;

internal static class LmuParser
{
    public static LmuParsedFrame Parse(ReadOnlySpan<byte> buffer)
    {
        _ = LmuBinary.Slice(buffer, 0, LmuBinary.TotalBufferSize);

        LmuScoringInfo scoringInfo = ParseScoringInfo(LmuBinary.Slice(buffer, LmuBinary.ScoringStart, LmuBinary.ScoringInfoSize));
        byte playerIndex = LmuBinary.ReadByte(buffer, LmuBinary.PlayerIndexOffset);
        bool playerHasVehicle = LmuBinary.ReadBool(buffer, LmuBinary.PlayerHasVehicleOffset);

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
                PlayerIndex = playerIndex,
                PlayerVehicle = FindPlayerVehicle(buffer, scoringInfo.NumVehicles),
                Vehicles = ParseVehicles(buffer, scoringInfo.NumVehicles),
                FrontCompounds = ParseFrontCompounds(buffer)
            };
        }

        int telemetryOffset = LmuBinary.TelemetryInfoBase + playerIndex * LmuBinary.VehicleTelemetrySize;
        int scoringOffset = LmuBinary.VehicleScoringBase + playerIndex * LmuBinary.VehicleScoringSize;

        return new LmuParsedFrame
        {
            ScoringInfo = scoringInfo,
            PlayerHasVehicle = playerHasVehicle,
            PlayerIndex = playerIndex,
            Telemetry = ParseVehicleTelemetry(LmuBinary.Slice(buffer, telemetryOffset, LmuBinary.VehicleTelemetrySize)),
            Scoring = ParseVehicleScoring(LmuBinary.Slice(buffer, scoringOffset, LmuBinary.VehicleScoringSize)),
            Vehicles = ParseVehicles(buffer, scoringInfo.NumVehicles),
            FrontCompounds = ParseFrontCompounds(buffer)
        };
    }

    /// <summary>The first <paramref name="numVehicles"/> entries of the vehicle scoring array, the field the sim scored.</summary>
    private static IReadOnlyList<LmuVehicleScoring> ParseVehicles(ReadOnlySpan<byte> buffer, int numVehicles)
    {
        int count = Math.Clamp(numVehicles, 0, LmuBinary.MaxVehicles);
        LmuVehicleScoring[] vehicles = new LmuVehicleScoring[count];
        for (int i = 0; i < count; i++)
        {
            int offset = LmuBinary.VehicleScoringBase + i * LmuBinary.VehicleScoringSize;
            vehicles[i] = ParseVehicleScoring(LmuBinary.Slice(buffer, offset, LmuBinary.VehicleScoringSize));
        }

        return vehicles;
    }

    /// <summary>
    /// Each active car's front compound by mID. SharedMemoryTelemetryData opens with
    /// activeVehicles (one byte) before the player index; the telemetry entries are not in scoring
    /// order, so they are matched by slot id. Only mID and the 18-byte name are read per car.
    /// </summary>
    private static IReadOnlyDictionary<int, string> ParseFrontCompounds(ReadOnlySpan<byte> buffer)
    {
        int count = Math.Min((int)LmuBinary.ReadByte(buffer, LmuBinary.TelemetryStart), LmuBinary.MaxVehicles);
        Dictionary<int, string> compounds = new(count);
        for (int i = 0; i < count; i++)
        {
            int offset = LmuBinary.TelemetryInfoBase + i * LmuBinary.VehicleTelemetrySize;
            string name = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(buffer, offset + FrontCompoundNameOffset, 18)).Trim();
            if (name.Length > 0)
            {
                compounds[LmuBinary.ReadInt32(buffer, offset)] = name;
            }
        }

        return compounds;
    }

    /// <summary>mFrontTireCompoundName, relative to a TelemInfoV01 entry.</summary>
    private const int FrontCompoundNameOffset = 620;

    public static bool PlayerInCar(bool playerHasVehicle, LmuScoringInfo scoringInfo) =>
        playerHasVehicle && scoringInfo.InRealtime;

    /// <summary>
    /// Finds the player's entry in the vehicle scoring array by the sim's own mIsPlayer
    /// flag. The telemetry block's player index cannot be trusted here: it belongs to a
    /// block that is only populated once the driver has a car. Only the flag byte is read
    /// per candidate, so the scan stays cheap on a full grid.
    /// </summary>
    private static LmuVehicleScoring? FindPlayerVehicle(ReadOnlySpan<byte> buffer, int numVehicles)
    {
        int count = Math.Clamp(numVehicles, 0, LmuBinary.MaxVehicles);
        for (int i = 0; i < count; i++)
        {
            int offset = LmuBinary.VehicleScoringBase + i * LmuBinary.VehicleScoringSize;
            if (LmuBinary.ReadBool(buffer, offset + PlayerVehicleFlagOffset))
            {
                return ParseVehicleScoring(LmuBinary.Slice(buffer, offset, LmuBinary.VehicleScoringSize));
            }
        }

        return null;
    }

    /// <summary>mIsPlayer, relative to a VehicleScoringInfoV01 entry.</summary>
    private const int PlayerVehicleFlagOffset = 196;

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
            EndElapsedTime = LmuBinary.ReadDouble(bytes, 76),
            MaxLaps = LmuBinary.ReadInt32(bytes, 84),
            LapDistance = LmuBinary.ReadDouble(bytes, 88),
            NumVehicles = LmuBinary.ReadInt32(bytes, 104),
            GamePhase = LmuBinary.ReadByte(bytes, 108),
            SessionTimeRemaining = LmuBinary.ReadSingle(bytes, 340),
            AveragePathWetness = LmuBinary.ReadDouble(bytes, 332),
            // Weather, after mPlrFileName ends at 212: mDarkCloud@212, then these three.
            Raining = LmuBinary.ReadDouble(bytes, 220),
            AmbientTemperature = LmuBinary.ReadDouble(bytes, 228),
            TrackTemperature = LmuBinary.ReadDouble(bytes, 236),
            IsFixedSetup = LmuBinary.ReadBool(bytes, 348),
            TrackGripLevel = LmuBinary.ReadByte(bytes, 349),
            // mInRealtime sits at 115, after mStartLight@113 and mNumRedLights@114.
            InRealtime = LmuBinary.ReadBool(bytes, 115)
        };
    }

    private static LmuVehicleTelemetry ParseVehicleTelemetry(ReadOnlySpan<byte> bytes)
    {
        List<LmuWheel> wheels = new(capacity: 4);
        const int wheelsBase = 848;
        const int wheelSize = 260;
        for (int i = 0; i < 4; i++)
        {
            // TelemWheelV01 (InternalsPlugin.hpp, #pragma pack 4): the walk ends at 260 bytes.
            ReadOnlySpan<byte> wheel = LmuBinary.Slice(bytes, wheelsBase + i * wheelSize, wheelSize);
            wheels.Add(new LmuWheel
            {
                SuspensionDeflectionMeters = LmuBinary.ReadDouble(wheel, 0),
                RideHeightMeters = LmuBinary.ReadDouble(wheel, 8),
                BrakeTempCelsius = LmuBinary.ReadDouble(wheel, 24),
                RotationRadiansPerSecond = LmuBinary.ReadDouble(wheel, 40),
                LateralPatchVelocity = LmuBinary.ReadDouble(wheel, 48),
                LongitudinalPatchVelocity = LmuBinary.ReadDouble(wheel, 56),
                LateralGroundVelocity = LmuBinary.ReadDouble(wheel, 64),
                LongitudinalGroundVelocity = LmuBinary.ReadDouble(wheel, 72),
                CamberRadians = LmuBinary.ReadDouble(wheel, 80),
                LateralForceNewtons = LmuBinary.ReadDouble(wheel, 88),
                LongitudinalForceNewtons = LmuBinary.ReadDouble(wheel, 96),
                LoadNewtons = LmuBinary.ReadDouble(wheel, 104),
                GripFraction = LmuBinary.ReadDouble(wheel, 112),
                SurfaceType = LmuBinary.ReadByte(wheel, 176),
                Flat = LmuBinary.ReadBool(wheel, 177),
                Detached = LmuBinary.ReadBool(wheel, 178),
                RadiusCentimeters = LmuBinary.ReadByte(wheel, 179),
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
            // mLocalAccel@208 sits between; mOri is three rows of 24 bytes, then mLocalRot.
            OrientationRowX = ParseVector3(bytes, 232),
            OrientationRowY = ParseVector3(bytes, 256),
            OrientationRowZ = ParseVector3(bytes, 280),
            LocalRotation = ParseVector3(bytes, 304),
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
            // State/damage: mScheduledStops@540, then these; mLastImpactPos@568 runs to mEngineTorque@592.
            Overheating = LmuBinary.ReadBool(bytes, 541),
            DetachedParts = LmuBinary.ReadBool(bytes, 542),
            DentSeverity = LmuBinary.Slice(bytes, 544, 8).ToArray(),
            LastImpactElapsedTime = LmuBinary.ReadDouble(bytes, 552),
            LastImpactMagnitude = LmuBinary.ReadDouble(bytes, 560),
            // After the four bytes mSpeedLimiter@604 .. mRearTireCompoundIndex@607.
            FuelCapacityLiters = LmuBinary.ReadDouble(bytes, 608),
            CurrentSectorRaw = LmuBinary.ReadInt32(bytes, 600),
            SpeedLimiter = LmuBinary.ReadBool(bytes, 604),
            FrontCompoundName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 620, 18)),
            RearCompoundName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 638, 18)),
            RearBrakeBias = LmuBinary.ReadDouble(bytes, 664),
            AbsActive = LmuBinary.ReadBool(bytes, 746),
            TractionControlActive = LmuBinary.ReadBool(bytes, 747),
            TractionControl = LmuBinary.ReadByte(bytes, 750),
            TractionControlMax = LmuBinary.ReadByte(bytes, 751),
            TractionControlSlip = LmuBinary.ReadByte(bytes, 752),
            TractionControlSlipMax = LmuBinary.ReadByte(bytes, 753),
            TractionControlCut = LmuBinary.ReadByte(bytes, 754),
            TractionControlCutMax = LmuBinary.ReadByte(bytes, 755),
            Abs = LmuBinary.ReadByte(bytes, 756),
            AbsMax = LmuBinary.ReadByte(bytes, 757),
            MotorMap = LmuBinary.ReadByte(bytes, 758),
            MotorMapMax = LmuBinary.ReadByte(bytes, 759),
            Migration = LmuBinary.ReadByte(bytes, 760),
            MigrationMax = LmuBinary.ReadByte(bytes, 761),
            FrontAntiSway = LmuBinary.ReadByte(bytes, 762),
            FrontAntiSwayMax = LmuBinary.ReadByte(bytes, 763),
            RearAntiSway = LmuBinary.ReadByte(bytes, 764),
            RearAntiSwayMax = LmuBinary.ReadByte(bytes, 765),
            TrackLimitSteps = LmuBinary.ReadByte(bytes, 767),
            RegenPower = LmuBinary.ReadSingle(bytes, 768),
            StateOfCharge = LmuBinary.ReadSingle(bytes, 772),
            VirtualEnergy = LmuBinary.ReadSingle(bytes, 776),
            GapAhead = LmuBinary.ReadSingle(bytes, 780),
            GapBehind = LmuBinary.ReadSingle(bytes, 784),
            // After mTimeGapPlaceAhead@788 and mTimeGapPlaceBehind@792; mExpansion[20]@828
            // then runs up to the wheels at 848.
            VehicleModel = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 796, 30)),
            VehicleClass = (LmuVehicleClass)LmuBinary.ReadByte(bytes, 826),
            VehicleChampionship = (LmuVehicleChampionship)LmuBinary.ReadByte(bytes, 827),
            Wheels = wheels
        };
    }

    private static LmuVehicleScoring ParseVehicleScoring(ReadOnlySpan<byte> bytes)
    {
        return new LmuVehicleScoring
        {
            Id = LmuBinary.ReadInt32(bytes, 0),
            DriverName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 4, 32)),
            TotalLaps = LmuBinary.ReadInt16(bytes, 100),
            Sector = unchecked((sbyte)LmuBinary.ReadByte(bytes, 102)),
            CurrentSector1 = LmuBinary.ReadDouble(bytes, 176),
            CurrentSector2 = LmuBinary.ReadDouble(bytes, 184),
            InPits = LmuBinary.ReadBool(bytes, 198),
            TimeBehindNext = LmuBinary.ReadDouble(bytes, 232),
            LapsBehindNext = LmuBinary.ReadInt32(bytes, 240),
            TimeBehindLeader = LmuBinary.ReadDouble(bytes, 244),
            LapsBehindLeader = LmuBinary.ReadInt32(bytes, 252),
            Position = ParseVector3(bytes, 264),
            VehicleName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 36, 64)),
            VehicleClass = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 200, 32)),
            IsPlayer = LmuBinary.ReadBool(bytes, 196),
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
