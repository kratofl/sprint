using System.Text;

namespace Sprint.Games.LeMansUltimate;

internal static class LmuBinary
{
    public const int GenericSize = 332;
    public const int PathDataSize = 5 * 260;
    public const int ScoringInfoSize = 548;
    public const int VehicleScoringSize = 584;
    public const int VehicleTelemetrySize = 1888;
    public const int MaxVehicles = LeMansUltimateGameData.MaxVehicles;
    public const int ScoringStreamSize = 65536;
    public const int ScoringStreamSizeHeader = 12;
    public const int TelemetryHeaderSize = 4;

    public const int ScoringStart = GenericSize + PathDataSize;
    public const int VehicleScoringBase = ScoringStart + ScoringInfoSize + ScoringStreamSizeHeader;
    public const int TelemetryStart = VehicleScoringBase + MaxVehicles * VehicleScoringSize + ScoringStreamSize;
    public const int PlayerIndexOffset = TelemetryStart + 1;
    public const int PlayerHasVehicleOffset = TelemetryStart + 2;
    public const int TelemetryInfoBase = TelemetryStart + TelemetryHeaderSize;
    public const int TotalBufferSize = TelemetryInfoBase + MaxVehicles * VehicleTelemetrySize;

    public static string ReadNullTerminatedString(ReadOnlySpan<byte> bytes)
    {
        var zero = bytes.IndexOf((byte)0);
        var slice = zero >= 0 ? bytes[..zero] : bytes;
        return Encoding.UTF8.GetString(slice);
    }

    public static ReadOnlySpan<byte> Slice(ReadOnlySpan<byte> buffer, int offset, int length)
    {
        if (offset < 0 || length < 0 || offset > buffer.Length || length > buffer.Length - offset)
        {
            throw new LmuDecodeException($"LMU buffer too small for slice offset={offset} length={length} buffer={buffer.Length}");
        }

        return buffer.Slice(offset, length);
    }
}

internal sealed class LmuDecodeException : Exception
{
    public LmuDecodeException(string message) : base(message)
    {
    }
}
