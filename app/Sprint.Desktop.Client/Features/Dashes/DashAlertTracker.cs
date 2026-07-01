using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Stateful parameter-change alert detector (matrix 4.5 alert-overlay row),
/// ported from the Go <c>alerts</c> package. Compares each frame to the previous
/// one for the alert types configured on the layout (tc/abs/engine-map) and
/// produces a transient <see cref="DashAlertBanner"/> that expires after a fixed
/// duration. The clock is injected so the expiry logic is unit-testable.
/// Kept out of <see cref="DashPainter"/> so the painter stays a pure function of
/// (layout, frame, banner).
/// </summary>
public sealed class DashAlertTracker
{
    private readonly Func<DateTimeOffset> _clock;
    private readonly double _durationSeconds;
    private TelemetryFrame? _prev;
    private DashAlertBanner? _active;
    private DateTimeOffset _expiresAt;

    public DashAlertTracker(Func<DateTimeOffset>? clock = null, double durationSeconds = 1.5)
    {
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _durationSeconds = durationSeconds;
    }

    /// <summary>Feeds a frame in and returns the banner to draw this tick, or null when none is active.</summary>
    public DashAlertBanner? Evaluate(DashLayout layout, TelemetryFrame frame, DashPalette palette)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(palette);

        var now = _clock();
        if (_prev is not null)
        {
            // Last configured alert that fired this frame wins (matches the Go painter loop).
            foreach (var alert in layout.Alerts)
            {
                var candidate = alert.Type switch
                {
                    "tc_change" when frame.Electronics.TractionControl != _prev.Electronics.TractionControl
                        => new DashAlertBanner($"TC1  {frame.Electronics.TractionControl}", palette.Accent),
                    "abs_change" when frame.Electronics.Abs != _prev.Electronics.Abs
                        => new DashAlertBanner($"ABS  {frame.Electronics.Abs}", palette.Warning),
                    "enginemap_change" when frame.Electronics.MotorMap != _prev.Electronics.MotorMap
                        => new DashAlertBanner($"MAP  {frame.Electronics.MotorMap}", palette.Primary),
                    _ => (DashAlertBanner?)null,
                };

                if (candidate is not null)
                {
                    _active = candidate;
                    _expiresAt = now.AddSeconds(_durationSeconds);
                }
            }
        }

        _prev = frame;
        if (_active is not null && now < _expiresAt)
        {
            return _active;
        }

        _active = null;
        return null;
    }

    /// <summary>Clears change-tracking state (call when the link goes offline so a stale diff doesn't fire on reconnect).</summary>
    public void Reset()
    {
        _prev = null;
        _active = null;
    }
}
