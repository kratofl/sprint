namespace Sprint.Desktop.Api.Telemetry;

/// <summary>
/// The link/health state of a telemetry source, as the UI must render it. Each
/// value maps to one of the shared failure-state visuals the design contract
/// requires (US14/US17/US33). This describes the <em>connection</em>, not the
/// validity of an individual frame — frame validity lives on
/// <see cref="TelemetryStatus.LastFrameValid"/> so the UI can show a live link
/// whose latest frame is bad.
/// </summary>
/// <remarks>
/// <para><b>device-busy</b> is deliberately absent: it is a hardware/display
/// state (WS7), not a telemetry-link state.</para>
/// <para><see cref="Stale"/> is a <em>derived</em> value produced only by
/// <see cref="TelemetryFreshness.Evaluate"/>; a source never self-reports it.</para>
/// <para><see cref="Connecting"/> covers both first-time connect and
/// reconnect-after-drop. Callers distinguish them from
/// <see cref="TelemetryStatus.LastFrameAt"/>: <c>null</c> ⇒ loading,
/// non-null ⇒ retrying.</para>
/// </remarks>
public enum TelemetryConnectionState
{
    /// <summary>No active link: not started, idle, or the source was closed.</summary>
    Disconnected,

    /// <summary>Attempting to connect, or retrying after a drop (idle on no game yet → see <see cref="WaitingForGame"/>).</summary>
    Connecting,

    /// <summary>The adapter is active but its game/sim is not running (analogue of the old <c>ErrNotRunning</c>).</summary>
    WaitingForGame,

    /// <summary>Receiving fresh frames.</summary>
    Connected,

    /// <summary>Was connected, but no fresh frame has arrived within the freshness window. Derived only via <see cref="TelemetryFreshness.Evaluate"/>.</summary>
    Stale,

    /// <summary>This game/platform is not supported by the selected adapter.</summary>
    Unsupported,

    /// <summary>The adapter cannot access its data source (e.g. shared memory / device access denied).</summary>
    PermissionDenied,

    /// <summary>An unexpected, non-fatal adapter error. The truthful landing for the "never crash" guarantee.</summary>
    Faulted
}

/// <summary>
/// An immutable snapshot of a telemetry source's health. Always non-null on a
/// source. Implementations publish it via an atomic reference swap (see
/// <see cref="ITelemetrySource"/>) so a UI thread reading it concurrently with a
/// background acquisition thread always observes a consistent snapshot.
/// </summary>
public sealed record TelemetryStatus
{
    /// <summary>The current link state.</summary>
    public TelemetryConnectionState State { get; init; } = TelemetryConnectionState.Disconnected;

    /// <summary>The source's display name (e.g. "Sprint Demo", "Le Mans Ultimate").</summary>
    public string SourceName { get; init; } = "";

    /// <summary>Optional human-readable reason for the current state ("game not running", "retry 3", "shared memory denied"). Free text — never parsed.</summary>
    public string? Detail { get; init; }

    /// <summary>When the most recent frame was read, or <c>null</c> if none yet. Drives freshness/stale derivation.</summary>
    public DateTimeOffset? LastFrameAt { get; init; }

    /// <summary>
    /// Whether the most recent frame passed the adapter's validation (NaN/Inf/
    /// impossible-value sanitisation). A source can be <see cref="TelemetryConnectionState.Connected"/>
    /// with <c>LastFrameValid == false</c> — the UI then shows a live link plus an
    /// invalid-frame indicator and keeps rendering the last good frame.
    /// </summary>
    public bool LastFrameValid { get; init; } = true;

    /// <summary>Optional reason the latest frame was rejected, when <see cref="LastFrameValid"/> is false.</summary>
    public string? InvalidReason { get; init; }

    /// <summary>Convenience: true only when the link is <see cref="TelemetryConnectionState.Connected"/>.</summary>
    public bool IsLive => State == TelemetryConnectionState.Connected;

    /// <summary>An idle, never-connected status for a named source.</summary>
    public static TelemetryStatus Disconnected(string sourceName, string? detail = null) =>
        new() { State = TelemetryConnectionState.Disconnected, SourceName = sourceName, Detail = detail };
}
