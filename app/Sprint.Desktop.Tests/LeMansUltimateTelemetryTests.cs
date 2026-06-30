using Sprint.Desktop.Api.Telemetry;
using Sprint.Games.LeMansUltimate;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class LeMansUltimateTelemetryTests
{
    private static byte[] EmptyLmuBuffer()
    {
        return new byte[LmuBinary.TotalBufferSize];
    }

    private static void WriteInt32(byte[] buffer, int offset, int value) =>
        BitConverter.TryWriteBytes(buffer.AsSpan(offset, sizeof(int)), value);

    private static void WriteDouble(byte[] buffer, int offset, double value) =>
        BitConverter.TryWriteBytes(buffer.AsSpan(offset, sizeof(double)), value);

    private static void WriteBool(byte[] buffer, int offset, bool value) =>
        buffer[offset] = value ? (byte)1 : (byte)0;

    private static void WriteString(byte[] buffer, int offset, int length, string value)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(value);
        bytes.AsSpan(0, Math.Min(bytes.Length, length)).CopyTo(buffer.AsSpan(offset, length));
    }

    [Fact]
    public void Lmu_offsets_match_shared_memory_interface_layout()
    {
        Assert.Equal(332, LmuBinary.GenericSize);
        Assert.Equal(548, LmuBinary.ScoringInfoSize);
        Assert.Equal(584, LmuBinary.VehicleScoringSize);
        Assert.Equal(1888, LmuBinary.VehicleTelemetrySize);
        Assert.Equal(1632, LmuBinary.ScoringStart);
        Assert.Equal(2192, LmuBinary.VehicleScoringBase);
        Assert.Equal(128464, LmuBinary.TelemetryStart);
        Assert.Equal(128465, LmuBinary.PlayerIndexOffset);
        Assert.Equal(128466, LmuBinary.PlayerHasVehicleOffset);
        Assert.Equal(128468, LmuBinary.TelemetryInfoBase);
        Assert.Equal(324820, LmuBinary.TotalBufferSize);
    }

    [Fact]
    public void Lmu_null_string_stops_at_first_zero_byte()
    {
        Span<byte> bytes = stackalloc byte[] { (byte)'L', (byte)'M', (byte)'U', 0, (byte)'X' };

        Assert.Equal("LMU", LmuBinary.ReadNullTerminatedString(bytes));
    }

    [Fact]
    public void Lmu_binary_reads_little_endian_primitives()
    {
        Span<byte> bytes = stackalloc byte[16];
        BitConverter.TryWriteBytes(bytes[0..8], 123.25d);
        BitConverter.TryWriteBytes(bytes[8..12], 42);
        BitConverter.TryWriteBytes(bytes[12..16], 12.5f);

        Assert.Equal(123.25d, LmuBinary.ReadDouble(bytes, 0));
        Assert.Equal(42, LmuBinary.ReadInt32(bytes, 8));
        Assert.Equal(12.5f, LmuBinary.ReadSingle(bytes, 12));
    }

    [Fact]
    public void Lmu_parser_returns_session_only_when_player_is_not_realtime()
    {
        var buffer = EmptyLmuBuffer();
        WriteString(buffer, LmuBinary.ScoringStart, 64, "Fuji");
        WriteInt32(buffer, LmuBinary.ScoringStart + 64, 10);
        WriteDouble(buffer, LmuBinary.ScoringStart + 68, 123.5);
        WriteInt32(buffer, LmuBinary.ScoringStart + 84, 31);
        WriteDouble(buffer, LmuBinary.ScoringStart + 88, 4563.2);
        WriteInt32(buffer, LmuBinary.ScoringStart + 104, 42);
        WriteBool(buffer, LmuBinary.ScoringStart + 114, false);
        buffer[LmuBinary.PlayerIndexOffset] = 3;
        WriteBool(buffer, LmuBinary.PlayerHasVehicleOffset, true);

        var parsed = LmuParser.Parse(buffer);

        Assert.Equal("Fuji", parsed.ScoringInfo.TrackName);
        Assert.Equal(10, parsed.ScoringInfo.Session);
        Assert.Equal(123.5, parsed.ScoringInfo.CurrentElapsedTime);
        Assert.Equal(31, parsed.ScoringInfo.MaxLaps);
        Assert.Equal(4563.2, parsed.ScoringInfo.LapDistance);
        Assert.Equal(42, parsed.ScoringInfo.NumVehicles);
        Assert.Equal(3, parsed.PlayerIndex);
        Assert.True(parsed.PlayerHasVehicle);
        Assert.False(parsed.PlayerInCar);
        Assert.Null(parsed.Telemetry);
        Assert.Null(parsed.Scoring);
    }

    [Fact]
    public void Lmu_parser_decodes_player_telemetry_and_scoring_when_realtime()
    {
        var buffer = EmptyLmuBuffer();
        var scoringInfo = LmuBinary.ScoringStart;
        WriteString(buffer, scoringInfo, 64, "Spa");
        WriteInt32(buffer, scoringInfo + 64, 10);
        WriteDouble(buffer, scoringInfo + 68, 200.0);
        WriteDouble(buffer, scoringInfo + 88, 7004.0);
        WriteInt32(buffer, scoringInfo + 104, 30);
        WriteBool(buffer, scoringInfo + 114, true);

        buffer[LmuBinary.PlayerIndexOffset] = 2;
        WriteBool(buffer, LmuBinary.PlayerHasVehicleOffset, true);

        var telemetry = LmuBinary.TelemetryInfoBase + 2 * LmuBinary.VehicleTelemetrySize;
        WriteDouble(buffer, telemetry + 12, 200.5);
        WriteInt32(buffer, telemetry + 20, 7);
        WriteDouble(buffer, telemetry + 24, 188.0);
        WriteString(buffer, telemetry + 32, 64, "Peugeot 9X8");
        WriteDouble(buffer, telemetry + 160, 1.0);
        WriteDouble(buffer, telemetry + 168, 2.0);
        WriteDouble(buffer, telemetry + 176, 3.0);
        WriteDouble(buffer, telemetry + 184, 4.0);
        WriteDouble(buffer, telemetry + 192, 5.0);
        WriteDouble(buffer, telemetry + 200, 6.0);
        WriteInt32(buffer, telemetry + 352, 5);
        WriteDouble(buffer, telemetry + 356, 6500.0);
        WriteDouble(buffer, telemetry + 524, 42.5);
        WriteDouble(buffer, telemetry + 532, 8000.0);
        WriteInt32(buffer, telemetry + 600, 1);
        WriteString(buffer, telemetry + 620, 18, "Medium");
        WriteString(buffer, telemetry + 638, 18, "Soft");
        WriteDouble(buffer, telemetry + 664, 0.58);
        WriteBool(buffer, telemetry + 746, true);
        WriteBool(buffer, telemetry + 747, true);
        buffer[telemetry + 750] = 4;
        buffer[telemetry + 751] = 12;
        buffer[telemetry + 756] = 7;
        buffer[telemetry + 757] = 12;
        buffer[telemetry + 758] = 3;
        buffer[telemetry + 759] = 8;
        buffer[telemetry + 767] = 2;
        BitConverter.TryWriteBytes(buffer.AsSpan(768, sizeof(float)), 25.0f);
        BitConverter.TryWriteBytes(buffer.AsSpan(772, sizeof(float)), 72.5f);
        BitConverter.TryWriteBytes(buffer.AsSpan(776, sizeof(float)), 62.0f);
        BitConverter.TryWriteBytes(buffer.AsSpan(780, sizeof(float)), 1.2f);
        BitConverter.TryWriteBytes(buffer.AsSpan(784, sizeof(float)), 0.9f);

        var wheel = telemetry + 848;
        WriteDouble(buffer, wheel + 120, 190.0);
        WriteDouble(buffer, wheel + 128, 363.15);
        WriteDouble(buffer, wheel + 136, 365.15);
        WriteDouble(buffer, wheel + 144, 367.15);
        WriteDouble(buffer, wheel + 152, 0.12);
        WriteDouble(buffer, wheel + 204, 360.15);

        var wheel4 = telemetry + 848 + 3 * 260;
        WriteDouble(buffer, wheel4 + 120, 193.0);

        var vehicleScoring = LmuBinary.VehicleScoringBase + 2 * LmuBinary.VehicleScoringSize;
        buffer[vehicleScoring + 103] = unchecked((byte)1);
        WriteDouble(buffer, vehicleScoring + 104, 7004.0);
        WriteDouble(buffer, vehicleScoring + 144, 91.234);
        WriteDouble(buffer, vehicleScoring + 152, 30.100);
        WriteDouble(buffer, vehicleScoring + 160, 61.500);
        WriteDouble(buffer, vehicleScoring + 168, 92.345);
        buffer[vehicleScoring + 199] = 4;
        buffer[vehicleScoring + 457] = 3;
        WriteDouble(buffer, vehicleScoring + 464, 12.25);
        WriteBool(buffer, vehicleScoring + 505, true);
        buffer[vehicleScoring + 506] = 2;
        WriteBool(buffer, vehicleScoring + 507, true);
        WriteBool(buffer, vehicleScoring + 579, true);

        var parsed = LmuParser.Parse(buffer);

        Assert.True(parsed.PlayerInCar);
        Assert.Equal("Peugeot 9X8", parsed.Telemetry!.VehicleName);
        Assert.Equal(7, parsed.Telemetry.LapNumber);
        Assert.Equal(1.0, parsed.Telemetry.Position.X);
        Assert.Equal(4.0, parsed.Telemetry.LocalVelocity.X);
        Assert.Equal(5, parsed.Telemetry.Gear);
        Assert.Equal(6500.0, parsed.Telemetry.EngineRpm);
        Assert.Equal(42.5, parsed.Telemetry.FuelLiters);
        Assert.Equal(4, parsed.Scoring!.Place);
        Assert.Equal(7004.0, parsed.Scoring.LapDistance);
        Assert.Equal(12.25, parsed.Scoring.TimeIntoLap);
        Assert.Equal(2, parsed.Scoring.CountLapFlag);
        Assert.Equal(4, parsed.Telemetry.Wheels.Count);
        Assert.Equal(190.0, parsed.Telemetry.Wheels[0].PressureKPa);
        Assert.Equal(193.0, parsed.Telemetry.Wheels[3].PressureKPa);
        Assert.True(parsed.Scoring.DrsState);
    }

    [Fact]
    public void Lmu_mapper_emits_session_only_frame_when_not_in_car()
    {
        var mapper = new LmuTelemetryMapper(() => new DateTimeOffset(2026, 6, 30, 12, 0, 0, TimeSpan.Zero));
        var parsed = new LmuParsedFrame
        {
            ScoringInfo = new LmuScoringInfo
            {
                TrackName = "Fuji",
                Session = 10,
                CurrentElapsedTime = 123.5,
                MaxLaps = 31,
                InRealtime = false
            },
            PlayerHasVehicle = true,
            PlayerIndex = 3
        };

        var frame = mapper.Map(parsed);

        Assert.Equal(new DateTimeOffset(2026, 6, 30, 12, 0, 0, TimeSpan.Zero), frame.Timestamp);
        Assert.Equal("LeMansUltimate", frame.Session.Game);
        Assert.Equal("Fuji", frame.Session.Track);
        Assert.Equal(SessionType.Race, frame.Session.SessionType);
        Assert.Equal(123.5, frame.Session.SessionTime);
        Assert.Equal(31, frame.Session.MaxLaps);
        Assert.False(frame.Session.InCar);
    }

    [Fact]
    public void Lmu_mapper_maps_core_car_lap_tyre_race_and_energy_fields()
    {
        var mapper = new LmuTelemetryMapper(() => new DateTimeOffset(2026, 6, 30, 12, 0, 0, TimeSpan.Zero));
        var parsed = new LmuParsedFrame
        {
            ScoringInfo = new LmuScoringInfo
            {
                TrackName = "Spa",
                Session = 10,
                CurrentElapsedTime = 200.0,
                MaxLaps = 44,
                LapDistance = 7004.0,
                NumVehicles = 30,
                GamePhase = 6,
                InRealtime = true
            },
            PlayerHasVehicle = true,
            PlayerIndex = 2,
            Telemetry = new LmuVehicleTelemetry
            {
                VehicleName = "Peugeot 9X8",
                LapNumber = 7,
                ElapsedTime = 200.5,
                LapStartElapsedTime = 188.0,
                LocalVelocity = new LmuVector3(3, 4, 0),
                Gear = 5,
                EngineRpm = 6500,
                EngineMaxRpm = 8000,
                FilteredThrottle = 0.75,
                FilteredBrake = 0.25,
                FilteredClutch = 0.1,
                FilteredSteering = -0.2,
                FuelLiters = 42.5,
                Position = new LmuVector3(1, 2, 3),
                CurrentSectorRaw = 1,
                FrontCompoundName = "Medium",
                RearCompoundName = "Soft",
                RearBrakeBias = 0.58,
                TractionControlActive = true,
                TractionControl = 4,
                TractionControlMax = 12,
                Abs = 7,
                AbsMax = 12,
                MotorMap = 3,
                MotorMapMax = 8,
                TrackLimitSteps = 2,
                VirtualEnergy = 62,
                StateOfCharge = 72.5f,
                RegenPower = 25,
                GapAhead = 1.2f,
                GapBehind = 0.9f,
                Wheels =
                [
                    new LmuWheel { TempInnerKelvin = 363.15, TempMiddleKelvin = 365.15, TempOuterKelvin = 367.15, CarcassTempKelvin = 360.15, PressureKPa = 190, WearFraction = .12 },
                    new LmuWheel { TempInnerKelvin = 363.15, TempMiddleKelvin = 365.15, TempOuterKelvin = 367.15, CarcassTempKelvin = 360.15, PressureKPa = 191, WearFraction = .13 },
                    new LmuWheel { TempInnerKelvin = 363.15, TempMiddleKelvin = 365.15, TempOuterKelvin = 367.15, CarcassTempKelvin = 360.15, PressureKPa = 192, WearFraction = .14 },
                    new LmuWheel { TempInnerKelvin = 363.15, TempMiddleKelvin = 365.15, TempOuterKelvin = 367.15, CarcassTempKelvin = 360.15, PressureKPa = 193, WearFraction = .15 }
                ]
            },
            Scoring = new LmuVehicleScoring
            {
                BestLapTime = 91.234,
                LastLapTime = 92.345,
                Place = 4,
                LapDistance = 3502.0,
                TimeIntoLap = 12.25,
                CountLapFlag = 2,
                UnderYellow = true,
                DrsState = true,
                PitStops = 1,
                Penalties = 2
            }
        };

        var frame = mapper.Map(parsed);

        Assert.True(frame.Session.InCar);
        Assert.Equal("Spa", frame.Session.Track);
        Assert.Equal("Peugeot 9X8", frame.Session.Car);
        Assert.Equal(5.0f, frame.Car.SpeedMetersPerSecond);
        Assert.Equal(5, frame.Car.Gear);
        Assert.Equal(6500, frame.Car.Rpm);
        Assert.Equal(42.5f, frame.Car.FuelLiters);
        Assert.Equal(7, frame.Lap.CurrentLap);
        Assert.Equal(12.5, frame.Lap.CurrentLapTime);
        Assert.Equal(.5f, frame.Lap.TrackPosition);
        Assert.True(frame.Flags.Yellow);
        Assert.True(frame.Flags.SafetyCar);
        Assert.Equal(4, frame.Race.Position);
        Assert.Equal(30, frame.Race.TotalPositions);
        Assert.Equal(62, frame.Energy.VirtualEnergy);
        Assert.Equal(2, frame.Penalties.Incidents);
        Assert.Equal(90, frame.Tires[0].TempInnerCelsius, precision: 1);
        Assert.Equal(12, frame.Tires[0].WearPercent, precision: 1);
        Assert.Equal("Medium", frame.Tires[0].Compound);
        Assert.Equal("Soft", frame.Tires[2].Compound);
    }

    [Fact]
    public void Lmu_mapper_requires_decoded_payload_when_player_is_realtime()
    {
        var mapper = new LmuTelemetryMapper(() => new DateTimeOffset(2026, 6, 30, 12, 0, 0, TimeSpan.Zero));
        var missingTelemetry = new LmuParsedFrame
        {
            ScoringInfo = new LmuScoringInfo { InRealtime = true },
            PlayerHasVehicle = true,
            PlayerIndex = 2,
            Scoring = new LmuVehicleScoring()
        };
        var missingScoring = new LmuParsedFrame
        {
            ScoringInfo = new LmuScoringInfo { InRealtime = true },
            PlayerHasVehicle = true,
            PlayerIndex = 2,
            Telemetry = new LmuVehicleTelemetry()
        };

        Assert.Throws<LmuDecodeException>(() => mapper.Map(missingTelemetry));
        Assert.Throws<LmuDecodeException>(() => mapper.Map(missingScoring));
    }

    [Fact]
    public void Lmu_mapper_uses_lower_lap_time_source_when_new_lap_starts()
    {
        var mapper = new LmuTelemetryMapper(() => new DateTimeOffset(2026, 6, 30, 12, 0, 0, TimeSpan.Zero));

        var previousLap = mapper.Map(CreateInCarParsedFrame(
            lapNumber: 3,
            elapsedTime: 150.0,
            lapStartElapsedTime: 60.0,
            sessionTime: 150.0,
            scoringLapTime: 90.0));
        var newLap = mapper.Map(CreateInCarParsedFrame(
            lapNumber: 4,
            elapsedTime: 151.5,
            lapStartElapsedTime: 150.0,
            sessionTime: 151.5,
            scoringLapTime: 1.25));

        Assert.Equal(90.0, previousLap.Lap.CurrentLapTime);
        Assert.Equal(1.25, newLap.Lap.CurrentLapTime);
    }

    [Fact]
    public void Lmu_mapper_tracks_rolling_fuel_per_lap_from_completed_laps()
    {
        var mapper = new LmuTelemetryMapper(() => new DateTimeOffset(2026, 6, 30, 12, 0, 0, TimeSpan.Zero));

        var firstLap = mapper.Map(CreateInCarParsedFrame(lapNumber: 1, fuelLiters: 50.0));
        var secondLap = mapper.Map(CreateInCarParsedFrame(lapNumber: 2, fuelLiters: 47.5));
        var thirdLap = mapper.Map(CreateInCarParsedFrame(lapNumber: 3, fuelLiters: 44.0));

        Assert.Equal(0, firstLap.Car.FuelPerLapLiters);
        Assert.Equal(2.5f, secondLap.Car.FuelPerLapLiters);
        Assert.Equal(3.0f, thirdLap.Car.FuelPerLapLiters);
    }

    private static LmuParsedFrame CreateInCarParsedFrame(
        int lapNumber,
        double elapsedTime = 200.5,
        double lapStartElapsedTime = 188.0,
        double sessionTime = 200.0,
        double scoringLapTime = 12.25,
        double fuelLiters = 42.5)
    {
        return new LmuParsedFrame
        {
            ScoringInfo = new LmuScoringInfo
            {
                TrackName = "Spa",
                Session = 10,
                CurrentElapsedTime = sessionTime,
                LapDistance = 7004.0,
                NumVehicles = 30,
                InRealtime = true
            },
            PlayerHasVehicle = true,
            PlayerIndex = 2,
            Telemetry = new LmuVehicleTelemetry
            {
                VehicleName = "Peugeot 9X8",
                LapNumber = lapNumber,
                ElapsedTime = elapsedTime,
                LapStartElapsedTime = lapStartElapsedTime,
                FuelLiters = fuelLiters
            },
            Scoring = new LmuVehicleScoring
            {
                LapDistance = 3502.0,
                TimeIntoLap = scoringLapTime,
                CountLapFlag = 2
            }
        };
    }
}
