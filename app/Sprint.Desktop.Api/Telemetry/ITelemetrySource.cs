namespace Sprint.Desktop.Api.Telemetry;

/// <summary>
/// A telemetry adapter: a synchronous, pull-based reader of a single game/sim's
/// data, mapped to the shared <see cref="TelemetryFrame"/> contract, that also
/// reports its own connection <see cref="Status"/>. This is intentionally a thin
/// reader — the background acquisition loop, reconnect/backoff, freshness/stale
/// derivation, update-rate measurement, and delta augmentation live in the
/// consumer (the WS4 telemetry engine), never in the adapter. (This mirrors the
/// old Go split: the adapter owned Connect/Disconnect/Read; the core owned the
/// loop.)
/// </summary>
/// <remarks>
/// <para><b>Never crash (US17).</b> <see cref="Connect"/> and <see cref="TryRead"/>
/// must not throw for recoverable conditions (game not running, access denied,
/// transport hiccup). Reflect those in <see cref="Status"/>
/// (<see cref="TelemetryConnectionState.WaitingForGame"/>,
/// <see cref="TelemetryConnectionState.PermissionDenied"/>,
/// <see cref="TelemetryConnectionState.Faulted"/>, …) instead.</para>
///
/// <para><b>Thread-safety.</b> <see cref="Status"/> and <see cref="Current"/> may be
/// read from a thread other than the one that calls <see cref="TryRead"/>. An
/// implementation whose <see cref="TryRead"/> runs on a background thread (the WS4
/// real-adapter case) must publish both via an atomic reference swap (e.g.
/// <c>Volatile.Write</c> / <c>Interlocked.Exchange</c> of the immutable record
/// reference) so a reader always observes a consistent snapshot and never a torn
/// value. A fully single-threaded source (all access on one thread, e.g. the demo
/// simulator driven by a UI-thread timer) needs no extra publication — a plain
/// reference assignment of an immutable record is already atomic.</para>
///
/// <para><b>Lifecycle.</b> <see cref="Connect"/> and <see cref="Disconnect"/> are
/// idempotent and reusable across cycles (a reconnect loop calls
/// Disconnect→Connect repeatedly). <see cref="IDisposable.Dispose"/> is terminal:
/// it performs a final disconnect and releases unmanaged handles. After dispose,
/// <see cref="Connect"/> and <see cref="TryRead"/> throw
/// <see cref="ObjectDisposedException"/>, while <see cref="Status"/> reads
/// <see cref="TelemetryConnectionState.Disconnected"/>. The owner (the shell
/// window in WS3) disposes the source on shutdown.</para>
/// </remarks>
public interface ITelemetrySource : IDisposable
{
    /// <summary>Stable display name for the source (e.g. "Sprint Demo").</summary>
    string Name { get; }

    /// <summary>The current health snapshot. Never null. See thread-safety remarks.</summary>
    TelemetryStatus Status { get; }

    /// <summary>
    /// The last-known frame. Never null — before the first successful read it is a
    /// neutral default. May be stale; the link state in <see cref="Status"/> tells
    /// the caller whether it is current.
    /// </summary>
    TelemetryFrame Current { get; }

    /// <summary>
    /// Begin acquiring (open the shared memory / device / simulation). Idempotent;
    /// safe to call after a previous <see cref="Disconnect"/>. Must not throw for
    /// recoverable failures — see the "never crash" remark.
    /// </summary>
    void Connect();

    /// <summary>Stop acquiring and release the data source. Idempotent.</summary>
    void Disconnect();

    /// <summary>
    /// Pull the newest frame. The <em>single</em> mutation point: a successful read
    /// updates <see cref="Current"/> and <see cref="TelemetryStatus.LastFrameAt"/>.
    /// Returns <c>true</c> and the new frame when a fresh frame is available;
    /// returns <c>false</c> when no new frame has arrived since the last read (e.g.
    /// the shared-memory sequence counter is unchanged) — this is <em>not</em> an
    /// error (errors surface through <see cref="Status"/>). On <c>false</c>,
    /// <paramref name="frame"/> is set to <see cref="Current"/> and is always
    /// non-null, so callers can render the last good frame without a null check.
    /// </summary>
    bool TryRead(out TelemetryFrame frame);
}
