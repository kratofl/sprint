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
}
