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
        var config = layout.AlertConfig ?? new DashAlertConfig();
        if (_prev is not null)
        {
            // Last configured alert that fired this frame wins (matches the Go painter loop).
            foreach (var alert in layout.Alerts)
            {
                if (!alert.Enabled)
                {
                    continue;
                }

                var candidate = alert.Type switch
                {
                    "tc_change" when frame.Electronics.TractionControl != _prev.Electronics.TractionControl
                        => CreateBanner("TRACTION CONTROL", frame.Electronics.TractionControl.ToString(), alert, palette.Accent, config, layout, palette),
                    "abs_change" when frame.Electronics.Abs != _prev.Electronics.Abs
                        => CreateBanner("ABS", frame.Electronics.Abs.ToString(), alert, palette.Warning, config, layout, palette),
                    "enginemap_change" when frame.Electronics.MotorMap != _prev.Electronics.MotorMap
                        => CreateBanner("ENGINE MAP", frame.Electronics.MotorMap.ToString(), alert, palette.Primary, config, layout, palette),
                    _ => (DashAlertBanner?)null,
                };

                if (candidate is not null)
                {
                    _active = candidate;
                    var duration = Math.Clamp(alert.DurationSeconds ?? (config.DurationSeconds <= 0 ? _durationSeconds : config.DurationSeconds), 0.5, 5.0);
                    _expiresAt = now.AddSeconds(duration);
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

    private static DashAlertBanner CreateBanner(
        string title,
        string value,
        DashAlert alert,
        SkiaSharp.SKColor fallback,
        DashAlertConfig config,
        DashLayout layout,
        DashPalette palette) =>
        new(
            title,
            value,
            ResolveColor(alert.ColorToken ?? config.ColorToken, fallback, palette),
            alert.Col,
            alert.Row,
            alert.ColSpan,
            alert.RowSpan,
            layout.GridCols,
            layout.GridRows,
            alert.InvertColors ?? config.InvertColors);

    private static SkiaSharp.SKColor ResolveColor(string? token, SkiaSharp.SKColor fallback, DashPalette palette) =>
        token?.Trim().ToLowerInvariant() switch
        {
            "blue" => palette.Accent,
            "ember" or "primary" => palette.Primary,
            "green" => palette.Success,
            "yellow" => palette.Warning,
            "red" => palette.Danger,
            "white" => palette.Foreground,
            _ => fallback,
        };
}
