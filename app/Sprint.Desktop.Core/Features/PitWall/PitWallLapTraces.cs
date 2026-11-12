using Sprint.Contracts;

namespace Sprint.Desktop.Features.PitWall;

/// <summary>
/// The engineer's lap traces, built from the driver's 20 Hz <see cref="LiveSample"/>s: the lap
/// being driven, the last completed one and the best valid one. Each lap is kept as
/// <see cref="Points"/> slots by track position, the newest sample in a slot winning, so memory
/// stays fixed however long the lap. Not thread-safe; <see cref="PitWallAccumulator"/> guards it.
/// </summary>
public sealed class PitWallLapTraces
{
    /// <summary>Slots per lap, and so the most points a trace has.</summary>
    public const int Points = 600;

    /// <summary>A completed lap is kept only when samples filled at least this share of its slots (lost packets, a reset mid-lap).</summary>
    private const double MinCoverage = 0.5;

    private Point?[] _current = new Point?[Points];
    private int _lap;
    private bool _valid = true;
    private double _lastLapTime;

    // The previous lap's time as the samples of this lap still report it.
    private double _staleLastLap;

    public PitWallTrace? Last { get; private set; }

    public PitWallTrace? Best { get; private set; }

    public void Add(LiveSample sample)
    {
        ArgumentNullException.ThrowIfNull(sample);
        if (sample.Lap != this._lap)
        {
            // LMU counts laps from 0: the first racing lap is lap 0, so it completes like any other.
            if (sample.Lap == this._lap + 1)
                this.Complete(sample);
            this._current = new Point?[Points];
            this._lap = sample.Lap;
            this._valid = true;
        }

        this._valid &= sample.LapValid;
        this._lastLapTime = sample.CurrentLapTime;
        this._staleLastLap = sample.LastLapTime;
        int slot = Math.Clamp((int)(sample.TrackPosition * Points), 0, Points - 1);
        this._current[slot] = new Point(sample.TrackPosition, sample.SpeedKph, sample.Throttle, sample.Brake, sample.Steering);
    }

    /// <summary>The lap being driven so far; empty before the first sample.</summary>
    public PitWallTrace Current() => this._current.Any(point => point is not null) ? Trace(this._current, this._lap, null) : PitWallTrace.Empty;

    public void Reset()
    {
        this._current = new Point?[Points];
        this._lap = 0;
        this._valid = true;
        this.Last = null;
        this.Best = null;
    }

    private void Complete(LiveSample first)
    {
        double stale = this._staleLastLap;
        if (this._current.Count(point => point is not null) < Points * MinCoverage)
            return;

        // The game may report the finished lap's time a moment after the lap number moves on, and
        // until then the sample still carries the lap before's. Only a changed value is this lap's;
        // otherwise the last running time stands in for it.
        double lapTime = first.LastLapTime > 0 && first.LastLapTime != stale ? first.LastLapTime : this._lastLapTime;
        PitWallTrace completed = Trace(this._current, this._lap, Math.Round(lapTime, 3));
        this.Last = completed;
        if (this._valid && lapTime > 0 && (this.Best?.LapTime is not { } best || lapTime < best))
            this.Best = completed;
    }

    private static PitWallTrace Trace(Point?[] slots, int lap, double? lapTime)
    {
        List<Point> points = [.. slots.OfType<Point>()];
        return new PitWallTrace(
            lap,
            lapTime,
            [.. points.Select(point => Math.Round(point.Distance, 4))],
            [.. points.Select(point => Math.Round(point.Speed, 1))],
            [.. points.Select(point => Math.Round(point.Throttle, 3))],
            [.. points.Select(point => Math.Round(point.Brake, 3))],
            [.. points.Select(point => Math.Round(point.Steering, 3))]);
    }

    private sealed record Point(double Distance, double Speed, double Throttle, double Brake, double Steering);
}
