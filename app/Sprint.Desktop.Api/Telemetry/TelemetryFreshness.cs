namespace Sprint.Desktop.Api.Telemetry;

/// <summary>
/// Pure, clock-injected freshness logic: the single place that decides when a
/// <see cref="TelemetryConnectionState.Connected"/> link has gone
/// <see cref="TelemetryConnectionState.Stale"/>. A source never self-reports
/// <c>Stale</c>; the consumer (the WS4 telemetry engine today, MainWindow's timer
/// in WS3) calls <see cref="Evaluate"/> against a caller-supplied <c>now</c> so the
/// rule is deterministic and unit-testable without a real clock.
/// </summary>
public static class TelemetryFreshness
{
    /// <summary>
    /// Default age past which a connected link is considered stale. Conservative
    /// for the WS3 demo's ~2 Hz tick; WS4's real adapter loop tunes it to the
    /// game's update rate.
    /// </summary>
    public static readonly TimeSpan DefaultWindow = TimeSpan.FromMilliseconds(750);

    /// <summary>
    /// Returns the effective link state, downgrading
    /// <see cref="TelemetryConnectionState.Connected"/> to
    /// <see cref="TelemetryConnectionState.Stale"/> when the last frame is older
    /// than <paramref name="window"/>. Every other state is returned unchanged
    /// (only a live link can go stale), as is a connected link whose
    /// <see cref="TelemetryStatus.LastFrameAt"/> is null (it has not yet produced a
    /// frame to age out).
    /// </summary>
    public static TelemetryConnectionState Evaluate(TelemetryStatus status, DateTimeOffset now, TimeSpan? window = null)
    {
        ArgumentNullException.ThrowIfNull(status);

        if (status.State != TelemetryConnectionState.Connected || status.LastFrameAt is not { } lastFrameAt)
        {
            return status.State;
        }

        var maxAge = window ?? DefaultWindow;
        return now - lastFrameAt > maxAge
            ? TelemetryConnectionState.Stale
            : TelemetryConnectionState.Connected;
    }
}
