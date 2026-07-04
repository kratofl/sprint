namespace Sprint.Desktop.Features.Live;

/// <summary>
/// Measures the real update rate (Hz) of a telemetry stream from the timestamps
/// of successful reads, smoothed with an exponential moving average. Pure and
/// clock-injected (the caller supplies <c>now</c>), so it is deterministic and
/// unit-testable. MainWindow's timer feeds it in WS3; the WS4 background-reader
/// engine reuses the same math — replacing the faked "60Hz" titlebar label with
/// the cadence actually observed.
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

        _smoothing = smoothing;
    }

    /// <summary>The current smoothed rate in Hz; 0 until at least two samples have been seen.</summary>
    public double Hz => _hz;

    /// <summary>
    /// Record a sample at <paramref name="now"/> and return the updated rate.
    /// Non-monotonic or duplicate timestamps are ignored (the rate is held).
    /// </summary>
    public double Sample(DateTimeOffset now)
    {
        if (_last is { } last)
        {
            var seconds = (now - last).TotalSeconds;
            if (seconds > 0)
            {
                var instant = 1.0 / seconds;
                _hz = _hz <= 0 ? instant : _hz + _smoothing * (instant - _hz);
                _last = now;
            }
        }
        else
        {
            _last = now;
        }

        return _hz;
    }

    /// <summary>Forget all history (e.g. after a disconnect), so the next sample restarts measurement.</summary>
    public void Reset()
    {
        _last = null;
        _hz = 0;
    }
}
