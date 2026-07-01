using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

/// <summary>Semantic colour band for a status indicator — mapped to a concrete brush by the view layer.</summary>
public enum StatusTone
{
    /// <summary>Healthy, live link.</summary>
    Live,

    /// <summary>Degraded but recoverable (connecting/retrying/stale/waiting/invalid-frame).</summary>
    Warn,

    /// <summary>Broken in a way that needs attention (unsupported/permission-denied/fault).</summary>
    Fault,

    /// <summary>Idle / no link.</summary>
    Idle
}

/// <summary>What the shell shows for the telemetry link: a short label, a measured-rate string, and a tone.</summary>
public sealed record TelemetryStatusView
{
    /// <summary>Pill text: the source name when live, otherwise the problem state.</summary>
    public string Label { get; init; } = "";

    /// <summary>Measured update rate, e.g. "2 Hz", or "—" when not live.</summary>
    public string RateText { get; init; } = "—";

    public StatusTone Tone { get; init; } = StatusTone.Idle;

    /// <summary>Optional secondary detail for a tooltip (the source's <see cref="TelemetryStatus.Detail"/>).</summary>
    public string? Detail { get; init; }
}

/// <summary>
/// Pure mapper from a <see cref="TelemetryStatus"/> (+ a measured Hz) to the
/// honest titlebar/Live-page view — the replacement for the hardcoded
/// "SIM DEMO / 60Hz / green dot". Applies <see cref="TelemetryFreshness.Evaluate"/>
/// itself (the one place a live link is downgraded to stale) so callers pass the
/// raw status and a clock, keeping the whole state→view decision testable in one
/// pure function.
/// </summary>
public static class TelemetryStatusPresenter
{
    public static TelemetryStatusView ToView(TelemetryStatus status, double measuredHz, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(status);

        var state = TelemetryFreshness.Evaluate(status, now);
        var source = string.IsNullOrWhiteSpace(status.SourceName) ? "TELEMETRY" : status.SourceName.ToUpperInvariant();

        // A connected link whose latest frame failed validation: live, but flag it.
        if (state == TelemetryConnectionState.Connected && !status.LastFrameValid)
        {
            return new TelemetryStatusView
            {
                Label = "INVALID FRAME",
                RateText = FormatRate(measuredHz),
                Tone = StatusTone.Warn,
                Detail = status.InvalidReason ?? status.Detail
            };
        }

        return state switch
        {
            TelemetryConnectionState.Connected => new TelemetryStatusView
            {
                Label = source,
                RateText = FormatRate(measuredHz),
                Tone = StatusTone.Live,
                Detail = status.Detail
            },
            TelemetryConnectionState.Connecting => new TelemetryStatusView
            {
                // null LastFrameAt ⇒ first connect (loading); non-null ⇒ reconnect (retrying).
                Label = status.LastFrameAt is null ? "CONNECTING" : "RETRYING",
                Tone = StatusTone.Warn,
                Detail = status.Detail
            },
            TelemetryConnectionState.WaitingForGame => new TelemetryStatusView
            {
                Label = "WAITING FOR GAME",
                Tone = StatusTone.Warn,
                Detail = status.Detail
            },
            TelemetryConnectionState.Stale => new TelemetryStatusView
            {
                Label = "STALE",
                Tone = StatusTone.Warn,
                Detail = status.Detail
            },
            TelemetryConnectionState.Unsupported => new TelemetryStatusView
            {
                Label = "UNSUPPORTED",
                Tone = StatusTone.Fault,
                Detail = status.Detail
            },
            TelemetryConnectionState.PermissionDenied => new TelemetryStatusView
            {
                Label = "NO ACCESS",
                Tone = StatusTone.Fault,
                Detail = status.Detail
            },
            TelemetryConnectionState.Faulted => new TelemetryStatusView
            {
                Label = "FAULT",
                Tone = StatusTone.Fault,
                Detail = status.Detail
            },
            _ => new TelemetryStatusView
            {
                Label = "OFFLINE",
                Tone = StatusTone.Idle,
                Detail = status.Detail
            }
        };
    }

    private static string FormatRate(double hz)
    {
        if (hz <= 0 || double.IsNaN(hz) || double.IsInfinity(hz))
        {
            return "—";
        }

        return $"{Math.Max(1, (int)Math.Round(hz))} Hz";
    }
}
