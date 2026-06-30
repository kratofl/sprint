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
}
