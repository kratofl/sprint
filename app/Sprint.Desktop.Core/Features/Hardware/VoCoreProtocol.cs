namespace Sprint.Desktop.Features.Hardware;

/// <summary>Pure VoCore M-PRO packet encoding and model decoding.</summary>
internal static class VoCoreProtocol
{
    public const byte BulkEndpoint = 0x02;
    public const byte RequestTypeOut = 0x40;
    public const byte RequestTypeIn = 0xC0;
    public const byte VendorRequest = 0xB0;
    public const byte ModelCommandRequest = 0xB5;
    public const byte ModelStatusRequest = 0xB6;
    public const byte ModelDataRequest = 0xB7;

    public static readonly byte[] ModelCommand = [0x51, 0x02, 0x04, 0x1F, 0xFC];
    public static readonly byte[] WakeCommand = [0x00, 0x29, 0x00, 0x00, 0x00, 0x00];
    public static readonly byte[] BrightnessFullCommand = [0x00, 0x51, 0x02, 0x00, 0x00, 0x00, 0xFF, 0x00];
    public static readonly byte[] BrightnessOffCommand = [0x00, 0x51, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00];

    public static byte[] BuildDrawCommand(int frameBytes)
    {
        if (frameBytes <= 0 || frameBytes > 0xFFFFFF)
        {
            throw new ArgumentOutOfRangeException(nameof(frameBytes));
        }

        return
        [
            0x00,
            0x2C,
            (byte)frameBytes,
            (byte)(frameBytes >> 8),
            (byte)(frameBytes >> 16),
            0x00,
        ];
    }

    public static uint ParseModelResponse(ReadOnlySpan<byte> response)
    {
        if (response.Length < 5)
        {
            throw new ArgumentException("VoCore model response must contain five bytes.", nameof(response));
        }

        return (uint)(response[1]
            | response[2] << 8
            | response[3] << 16
            | response[4] << 24);
    }

    public static (int Width, int Height) NativeDimensions(uint model) =>
        model switch
        {
            0x00000005 => (480, 854),
            0x00001005 => (720, 1280),
            0x00000007 => (800, 480),
            0x00000403 => (800, 800),
            0x0000000A => (1024, 600),
            _ => (480, 800),
        };

    public static ScreenNativeSize NativeDimensionsForPid(
        ushort pid,
        int configuredWidth,
        int configuredHeight) =>
        pid switch
        {
            0x1001 or 0x1002 or 0x1003 => new ScreenNativeSize(480, 800),
            // PID 1004 is used by both portrait and 6.8" landscape units.
            // Preserve the catalog/config orientation for that ambiguous family.
            0x1004 => new ScreenNativeSize(configuredWidth, configuredHeight),
            0x1005 => new ScreenNativeSize(480, 854),
            0x1006 => new ScreenNativeSize(800, 800),
            0x100A => new ScreenNativeSize(1024, 600),
            _ => new ScreenNativeSize(configuredWidth, configuredHeight),
        };
}
