namespace Sprint.Desktop.Features.Live;

/// <summary>
/// Measures the real update rate (Hz) of a telemetry stream from the timestamps
/// of successful reads, smoothed with an exponential moving average. Pure and
/// clock-injected (the caller supplies <c>now</c>), so it is deterministic and
/// unit-testable. <see cref="TelemetryEngine"/> feeds it from the background reader,
/// reporting the cadence actually observed rather than a faked rate.
/// </summary>
public sealed class RateMeter
{
    private readonly double _smoothing;
    private DateTimeOffset? _last;
    private double _hz;

    /// <param name="smoothing">EMA factor in (0, 1]; higher reacts faster, lower is steadier.</param>
    public RateMeter(double smoothing = 0.3)
    {
        if (smoothing is <= 0 or > 1)
        {
            throw new ArgumentOutOfRangeException(nameof(smoothing), smoothing, "Smoothing must be in (0, 1].");
        }

        this._smoothing = smoothing;
    }

    /// <summary>The current smoothed rate in Hz; 0 until at least two samples have been seen.</summary>
    public double Hz => this._hz;

    /// <summary>
    /// Record a sample at <paramref name="now"/> and return the updated rate.
    /// Non-monotonic or duplicate timestamps are ignored (the rate is held).
    /// </summary>
    public double Sample(DateTimeOffset now)
    {
        if (this._last is { } last)
        {
            double seconds = (now - last).TotalSeconds;
            if (seconds > 0)
            {
                double instant = 1.0 / seconds;
                this._hz = this._hz <= 0 ? instant : this._hz + this._smoothing * (instant - this._hz);
                this._last = now;
            }
        }
        else
        {
            this._last = now;
        }

        return this._hz;
    }

    /// <summary>Forget all history (e.g. after a disconnect), so the next sample restarts measurement.</summary>
    public void Reset()
    {
        this._last = null;
        this._hz = 0;
    }
}
