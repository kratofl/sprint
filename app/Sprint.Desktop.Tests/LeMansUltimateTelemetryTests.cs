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
}
