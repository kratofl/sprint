using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;

namespace Sprint.Desktop.Shell;

/// <summary>The shared user-visible surface states (matrix 4.1, US14/US17/US33). Modeled once, composed everywhere.</summary>
public enum SurfaceState
{
    Empty,
    Loading,
    Disconnected,
    Stale,
    Unsupported,
    PermissionDenied,
    DeviceBusy,
    InvalidFrame,
    Retrying,
}

/// <summary>Display text + tone for a shared state, rendered by the reusable state panel.</summary>
public sealed record SurfaceStateView(string Title, string Detail, StatusTone Tone);

/// <summary>
/// Maps the shared failure/empty states to consistent copy + tone so every
/// surface (Live, Devices, dash preview, hardware) presents them identically
/// rather than re-inventing per slice (WS11 US14/US17/US33). Pure + testable.
/// </summary>
public static class SurfaceStatePresenter
{
    public static SurfaceStateView Describe(SurfaceState state) => state switch
    {
        SurfaceState.Empty => new("Nothing here yet", "Add an item to get started.", StatusTone.Idle),
        SurfaceState.Loading => new("Loading…", "Fetching data.", StatusTone.Idle),
        SurfaceState.Disconnected => new("Not connected", "No telemetry link. Start the game to begin streaming.", StatusTone.Idle),
        SurfaceState.Stale => new("Signal stale", "The link is up but frames stopped arriving.", StatusTone.Warn),
        SurfaceState.Unsupported => new("Unsupported", "This game or device isn't supported yet.", StatusTone.Idle),
        SurfaceState.PermissionDenied => new("Permission needed", "Access was denied. Install the driver or grant permission, then retry.", StatusTone.Warn),
        SurfaceState.DeviceBusy => new("Device busy", "Another application is using this device.", StatusTone.Warn),
        SurfaceState.InvalidFrame => new("Invalid data", "The link is up but the last frame couldn't be read.", StatusTone.Warn),
        SurfaceState.Retrying => new("Reconnecting…", "Lost the link — retrying automatically.", StatusTone.Warn),
        _ => new("Unavailable", "", StatusTone.Idle),
    };

    /// <summary>Maps a telemetry link state to a shared surface state, or null when the link is live and healthy.</summary>
    public static SurfaceState? FromTelemetry(TelemetryConnectionState state, bool lastFrameValid) => state switch
    {
        TelemetryConnectionState.Connected when !lastFrameValid => SurfaceState.InvalidFrame,
        TelemetryConnectionState.Connected => null,
        TelemetryConnectionState.Connecting => SurfaceState.Loading,
        TelemetryConnectionState.WaitingForGame => SurfaceState.Disconnected,
        TelemetryConnectionState.Disconnected => SurfaceState.Disconnected,
        TelemetryConnectionState.Stale => SurfaceState.Stale,
        TelemetryConnectionState.Unsupported => SurfaceState.Unsupported,
        TelemetryConnectionState.PermissionDenied => SurfaceState.PermissionDenied,
        TelemetryConnectionState.Faulted => SurfaceState.Retrying,
        _ => SurfaceState.Disconnected,
    };
}
