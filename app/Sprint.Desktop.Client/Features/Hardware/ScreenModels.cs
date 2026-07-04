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
    PermissionDenied,
    DeviceBusy,
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

    void Configure(ScreenConfig config);

    /// <summary>Attempts to open the USB link. Returns true on success; failures are reflected in <see cref="Status"/>.</summary>
    bool Connect();

    /// <summary>Sends one native RGB565 frame. Returns false (and updates <see cref="Status"/>) on a transport error rather than throwing.</summary>
    bool TrySendFrame(ReadOnlySpan<byte> rgb565);

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
