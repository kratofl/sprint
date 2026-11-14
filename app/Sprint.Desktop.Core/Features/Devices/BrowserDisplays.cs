namespace Sprint.Desktop.Features.Devices;

/// <summary>
/// A Browser / VR display: a dash device with no USB link that any browser on this PC shows at
/// <see cref="Address"/> (a VR overlay tool loads it as a web source). The host serves it only while
/// one is added and turned on (Sprint.Desktop.Host/BrowserDisplayServer.cs).
/// <para>
/// Its resolution is the device's own <see cref="SavedDevice.Width"/> x <see cref="SavedDevice.Height"/>,
/// with the orientation kept to match (<see cref="OrientationFor"/>), so everything that sizes a
/// screen (scenes, dash fitting) reads it exactly like a panel's. It has no offset or margin, and the
/// user never sets its orientation.
/// </para>
/// </summary>
public static class BrowserDisplays
{
    /// <summary>The driver id its catalog entry and saved devices carry. No USB driver answers to it.</summary>
    public const string Driver = "browser";

    /// <summary>
    /// The loopback port the displays are served on. Fixed, never picked at random: the address is
    /// pasted into another program's saved settings and has to stay the same.
    /// </summary>
    public const int Port = 28780;

    // A new one starts at 1024 x 576, its catalog entry's size (presets/devices/browser-display.json).
    public const int MinSize = 100;

    /// <summary>The largest picture a VR overlay tool takes from a web source.</summary>
    public const int MaxWidth = 1920;

    public const int MaxHeight = 1080;

    public static bool Is(SavedDevice device) =>
        string.Equals(device.Driver, Driver, StringComparison.OrdinalIgnoreCase);

    /// <summary>Where a browser shows <paramref name="deviceId"/>'s dash.</summary>
    public static string Address(string deviceId) =>
        $"http://127.0.0.1:{Port}/dash/{Uri.EscapeDataString(deviceId)}";

    /// <summary>Why a resolution cannot be used, or null when it can.</summary>
    public static string? SizeError(int width, int height) =>
        width < MinSize || width > MaxWidth || height < MinSize || height > MaxHeight
            ? $"a browser display is {MinSize} to {MaxWidth} pixels wide and {MinSize} to {MaxHeight} high"
            : null;

    /// <summary>The orientation that keeps <paramref name="width"/> x <paramref name="height"/> as the logical size.</summary>
    public static DeviceOrientation OrientationFor(int width, int height) =>
        width >= height ? DeviceOrientation.Landscape : DeviceOrientation.Portrait;
}
