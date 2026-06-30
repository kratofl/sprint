using Sprint.Games.LeMansUltimate;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class LeMansUltimateTelemetryTests
{
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
}
