using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>Hardware-agnostic screen configuration shared by all drivers (ported from Go <c>hardware.ScreenConfig</c>).</summary>
public sealed record ScreenConfig
{
    public ushort Vid { get; init; }

    public ushort Pid { get; init; }

    public int Width { get; init; } = 800;

    public int Height { get; init; } = 480;

    /// <summary>0/90/180/270 — applied when converting to the native buffer.</summary>
    public int Rotation { get; init; }

    public int TargetFps { get; init; } = 30;

    /// <summary>Pixels of black at the left/top screen edges (screen space, applied after rotation).</summary>
    public int OffsetX { get; init; }

    public int OffsetY { get; init; }

    /// <summary>Uniform inset in pixels on all sides.</summary>
    public int Margin { get; init; }

    /// <summary>Driver kind: "vocore", "usbd480", or "fake".</summary>
    public string Driver { get; init; } = "fake";
}

/// <summary>
/// Explicit screen link state (matrix 4.6 "failures as UI status, never crash").
/// Mirrors the telemetry health vocabulary so the Devices UI can reuse the same
/// status-pill treatment.
/// </summary>
public enum ScreenConnectionState
{
    Disconnected,
    Connecting,
    Connected,
    ConfigurationRequired,
    PermissionDenied,
    DeviceBusy,
    DeviceConflict,
    Unsupported,
    Faulted,
}

public sealed record ScreenStatus
{
    public ScreenConnectionState State { get; init; } = ScreenConnectionState.Disconnected;

    public string? Detail { get; init; }

    public bool IsConnected => State == ScreenConnectionState.Connected;

    public static ScreenStatus Disconnected(string? detail = null) => new() { State = ScreenConnectionState.Disconnected, Detail = detail };
}

public readonly record struct ScreenNativeSize(int Width, int Height)
{
    public bool IsValid => Width > 0 && Height > 0;
}

internal static class ScreenTransferFailure
{
    public static string DescribeControlTimeout(
        string operation,
        string devicePath,
        uint timeoutMs) =>
        $"{operation} timed out after {timeoutMs} ms. " +
        "WinUsb_Initialize succeeded, so a compatible driver is present. Sprint opened " +
        "this interface path exclusively, but the screen did not acknowledge request 0xB0. " +
        "Possible causes include the wrong USB interface, a firmware/protocol variant, or " +
        $"another application using a different interface of the same device. path={devicePath}";
}

public enum ScreenStatusTone
{
    Neutral,
    Info,
    Success,
    Warning,
    Error,
}

public sealed record ScreenStatusView(
    string Label,
    string Detail,
    ScreenStatusTone Tone = ScreenStatusTone.Neutral);

/// <summary>
/// Effective USB search identity. Generic catalog entries use zeroes; known
/// screen families translate those into a vendor wildcard or their fixed
/// VID/PID so the catalog's auto-detection promise is actually honoured.
/// </summary>
public sealed record ScreenUsbIdentity(ushort Vid, ushort Pid)
{
    public static ScreenUsbIdentity ForDriver(string driver, ushort configuredVid, ushort configuredPid)
    {
        if (string.Equals(driver, "vocore", StringComparison.OrdinalIgnoreCase))
        {
            return new ScreenUsbIdentity(
                configuredVid == 0 ? (ushort)0xC872 : configuredVid,
                configuredPid);
        }

        if (string.Equals(driver, "usbd480", StringComparison.OrdinalIgnoreCase))
        {
            return new ScreenUsbIdentity(
                configuredVid == 0 ? (ushort)0x16C0 : configuredVid,
                configuredPid == 0 ? (ushort)0x08A7 : configuredPid);
        }

        return new ScreenUsbIdentity(configuredVid, configuredPid);
    }

    public bool MatchesDevicePath(string path)
    {
        if (Vid != 0 && !path.Contains($"vid_{Vid:x4}", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return Pid == 0 || path.Contains($"pid_{Pid:x4}", StringComparison.OrdinalIgnoreCase);
    }
}

/// <summary>
/// Converts low-level screen states into honest, actionable product language.
/// Raw transport detail is appended for diagnostics instead of being hidden
/// behind a generic "driver needed" message.
/// </summary>
public static class ScreenStatusPresentation
{
    public static ScreenStatusView Describe(ScreenStatus status)
    {
        var presentation = status.State switch
        {
            ScreenConnectionState.Connected =>
                new ScreenStatusView("Connected", "Sprint owns the screen and can send frames.", ScreenStatusTone.Success),
            ScreenConnectionState.Connecting =>
                new ScreenStatusView("Connecting", "Sprint is opening the configured USB screen.", ScreenStatusTone.Info),
            ScreenConnectionState.ConfigurationRequired =>
                new ScreenStatusView("Setup needed", "This saved screen has no VID/PID. Select or detect the physical USB device.", ScreenStatusTone.Warning),
            ScreenConnectionState.DeviceBusy =>
                new ScreenStatusView("In use", "Another application, commonly SimHub, is using the screen. Disable its VoCore output or close it, then retry.", ScreenStatusTone.Warning),
            ScreenConnectionState.DeviceConflict =>
                new ScreenStatusView(
                    "Duplicate target",
                    "Another saved Sprint device already owns the same physical USB screen. Disable or remove one of the duplicate entries.",
                    ScreenStatusTone.Warning),
            ScreenConnectionState.PermissionDenied =>
                new ScreenStatusView(
                    "USB access failed",
                    "Sprint found the screen but could not use its current Windows USB binding. " +
                    "Sprint does not ask you to install a separate driver here; it reuses a compatible existing binding. " +
                    "Close other screen-output software, reconnect the screen, and retry.",
                    ScreenStatusTone.Warning),
            ScreenConnectionState.Unsupported =>
                new ScreenStatusView("Unsupported", "This screen transport is not supported on the current operating system."),
            ScreenConnectionState.Faulted =>
                new ScreenStatusView("Connection failed", "The USB operation failed. Open the diagnostics log for the native error and attempted step.", ScreenStatusTone.Error),
            _ =>
                new ScreenStatusView("Not found", "No matching screen was found. Check the USB connection and configured VID/PID."),
        };

        return string.IsNullOrWhiteSpace(status.Detail)
            ? presentation
            : presentation with { Detail = $"{presentation.Detail} Technical detail: {status.Detail}" };
    }
}

public enum ScreenOpenFailureStage
{
    None,
    CreateFile,
    WinUsbInitialize,
}

/// <summary>Pure mapping from native open failures to the user-visible link state.</summary>
public static class ScreenOpenFailureStatus
{
    public static ScreenStatus Describe(
        ScreenOpenFailureStage stage,
        int nativeError,
        ushort vid,
        ushort pid)
    {
        var identity = $"VID=0x{vid:X4} PID={(pid == 0 ? "any" : $"0x{pid:X4}")}";
        if (stage == ScreenOpenFailureStage.CreateFile && nativeError is 5 or 32)
        {
            return new ScreenStatus
            {
                State = ScreenConnectionState.DeviceBusy,
                Detail =
                    $"CreateFile failed for {identity} with Win32 error {nativeError}. " +
                    "Another application may own the screen.",
            };
        }

        if (stage == ScreenOpenFailureStage.WinUsbInitialize)
        {
            return new ScreenStatus
            {
                State = ScreenConnectionState.PermissionDenied,
                Detail =
                    $"WinUsb_Initialize failed for {identity} " +
                    $"with Win32 error {nativeError}. Windows did not expose this binding through the WinUSB API.",
            };
        }

        return new ScreenStatus
        {
            State = ScreenConnectionState.Faulted,
            Detail =
                $"USB open failed for {identity} " +
                $"at {stage} with Win32 error {nativeError}.",
        };
    }
}

/// <summary>
/// A display-device transport (matrix 4.6 ScreenDriver). Real drivers talk WinUSB
/// to VoCore/USBD480; the fake adapter records frames for tests. Never throws for
/// recoverable failures — it reflects them in <see cref="Status"/> so the render
/// loop can retry and the UI can show an honest state.
/// </summary>
public interface IScreenDriver : IDisposable
{
    string Name { get; }

    ScreenStatus Status { get; }

    /// <summary>
    /// Native dimensions reported by the device after connect. Null means the
    /// transport cannot query them and the saved configuration remains active.
    /// </summary>
    ScreenNativeSize? NativeSize => null;

    void Configure(ScreenConfig config);

    /// <summary>Attempts to open the USB link. Returns true on success; failures are reflected in <see cref="Status"/>.</summary>
    bool Connect();

    /// <summary>Sends one native RGB565 frame. Returns false (and updates <see cref="Status"/>) on a transport error rather than throwing.</summary>
    bool TrySendFrame(byte[] rgb565);

    void Disconnect();
}

/// <summary>Produces native-format RGB565 frames for a telemetry frame (the WS7 bridge onto the WS6 painter).</summary>
public interface IDashFrameSource : IDisposable
{
    /// <summary>Native screen width in pixels (post-rotation).</summary>
    int Width { get; }

    /// <summary>Native screen height in pixels (post-rotation).</summary>
    int Height { get; }

    /// <summary>Renders <paramref name="frame"/> into <paramref name="rgb565"/> (must be Width*Height*2 bytes).</summary>
    void Render(TelemetryFrame frame, Span<byte> rgb565);
}
