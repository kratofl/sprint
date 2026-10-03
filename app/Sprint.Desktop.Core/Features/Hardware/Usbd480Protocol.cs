namespace Sprint.Desktop.Features.Hardware;

/// <summary>A USBD480 panel's identity as reported by GET_DEVICE_DETAILS.</summary>
/// <param name="Name">Device name string from the details block.</param>
/// <param name="Width">Native panel width in pixels.</param>
/// <param name="Height">Native panel height in pixels.</param>
public sealed record Usbd480Details(string Name, int Width, int Height);

/// <summary>
/// USBD480 NX wire-protocol constants and the pure decoding of its
/// <c>GET_DEVICE_DETAILS</c> block (see docs/SCREEN_PROTOCOLS.md). Split out of the
/// WinUSB driver so the parts that do not touch hardware — request numbers, the
/// details layout, the known-model sizes — are unit-testable; the driver keeps only
/// the native transfers.
/// </summary>
public static class Usbd480Protocol
{
    /// <summary>Bulk OUT pipe carrying pixel data.</summary>
    public const byte BulkEndpoint = 0x02;

    /// <summary>Vendor request type for OUT transfers (device recipient).</summary>
    public const byte RequestTypeOut = 0x40;

    /// <summary>Vendor request type for IN transfers (device recipient).</summary>
    public const byte RequestTypeIn = 0xC0;

    /// <summary>IN: 64-byte device info block.</summary>
    public const byte RequestGetDetails = 0x80;

    /// <summary>OUT: set the framebuffer write address.</summary>
    public const byte RequestSetAddress = 0xC0;

    /// <summary>OUT: flip the visible frame start address.</summary>
    public const byte RequestSetFrameStartAddress = 0xC4;

    /// <summary>OUT: backlight level in wValue (0..255).</summary>
    public const byte RequestSetBrightness = 0x81;

    public const byte FullBrightness = 255;

    /// <summary>Size of the details block the device returns.</summary>
    public const int DetailsBlockSize = 64;

    /// <summary>Bytes of the details block that must be present to read the size fields.</summary>
    public const int DetailsMinimumLength = 24;

    /// <summary>Length of the null-terminated ASCII name at the start of the block.</summary>
    public const int NameLength = 20;

    /// <summary>
    /// Fallback panel size when the device does not answer the details query, matching
    /// the documented native size for <c>0x16C0:0x08A7</c>.
    /// </summary>
    public static ScreenNativeSize DefaultNativeSize { get; } = new(800, 480);

    /// <summary>
    /// Native sizes for the USBD480 NX panels Sprint ships a generic entry for. Used
    /// only when the device names itself but its size fields are unusable.
    /// </summary>
    public static IReadOnlyDictionary<string, ScreenNativeSize> KnownModels { get; } =
        new Dictionary<string, ScreenNativeSize>(StringComparer.OrdinalIgnoreCase)
        {
            ["NX43"] = new(480, 272),
            ["NX50"] = new(800, 480),
        };

    /// <summary>
    /// Decodes a details block: bytes 0..19 are the null-terminated ASCII name,
    /// 20..21 the width and 22..23 the height as little-endian uint16. Returns
    /// <c>false</c> for a short block or a size Sprint cannot render, so a garbled
    /// answer degrades to the configured/known size instead of driving a bogus
    /// framebuffer.
    /// </summary>
    public static bool TryParseDetails(ReadOnlySpan<byte> details, out Usbd480Details parsed)
    {
        parsed = new Usbd480Details("", 0, 0);
        if (details.Length < DetailsMinimumLength)
        {
            return false;
        }

        var nameBytes = details[..NameLength];
        var terminator = nameBytes.IndexOf((byte)0);
        var name = System.Text.Encoding.ASCII
            .GetString(terminator >= 0 ? nameBytes[..terminator] : nameBytes)
            .Trim();

        var width = details[20] | details[21] << 8;
        var height = details[22] | details[23] << 8;
        if (!IsRenderableSize(width, height))
        {
            // Keep the name: it can still identify a known model whose size we know.
            parsed = new Usbd480Details(name, 0, 0);
            return false;
        }

        parsed = new Usbd480Details(name, width, height);
        return true;
    }

    /// <summary>
    /// The panel size to render at, in order of trust: the size the device reported,
    /// then a known model matched by name, then the configured size, then the
    /// documented default.
    /// </summary>
    public static ScreenNativeSize ResolveNativeSize(Usbd480Details? details, int configuredWidth, int configuredHeight)
    {
        if (details is not null && IsRenderableSize(details.Width, details.Height))
        {
            return new ScreenNativeSize(details.Width, details.Height);
        }

        if (details is not null && ModelSize(details.Name) is { } model)
        {
            return model;
        }

        return IsRenderableSize(configuredWidth, configuredHeight)
            ? new ScreenNativeSize(configuredWidth, configuredHeight)
            : DefaultNativeSize;
    }

    /// <summary>The known native size for a reported device name, matched on the model suffix.</summary>
    public static ScreenNativeSize? ModelSize(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        foreach (var (model, size) in KnownModels)
        {
            if (name.Contains(model, StringComparison.OrdinalIgnoreCase))
            {
                return size;
            }
        }

        return null;
    }

    /// <summary>
    /// Whether a size is one Sprint can drive: positive, within panel dimensions, and
    /// small enough that an RGB565 frame fits the device's 24-bit address space.
    /// </summary>
    public static bool IsRenderableSize(int width, int height) =>
        width > 0
        && height > 0
        && width <= 4096
        && height <= 4096
        && (long)width * height * 2 <= 0xFFFFFF;
}
