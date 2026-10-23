using Sprint.Contracts;

namespace Sprint.Api.Live;

/// <summary>
/// Spots completed laps in a live sample stream: a lap completed when <c>lastLapTime</c> changes
/// to a new positive value. The lap it reports is the one before the sample's lap (the game may
/// bump the lap number a frame before the time), and its validity is what the previous sample
/// said about the lap in progress. The first sample only primes it: a lap time already showing
/// when streaming starts belongs to a lap nobody streamed.
/// </summary>
public sealed class LapDetector
{
    private bool _primed;
    private double _lastLapTime;
    private bool _lapValid = true;

    /// <summary>Feeds one sample, oldest first. Returns the lap it completed, if any.</summary>
    public LiveLap? Next(LiveSample sample)
    {
        LiveLap? completed = null;
        if (this._primed && sample.LastLapTime > 0 && sample.LastLapTime != this._lastLapTime)
        {
            completed = new LiveLap
            {
                Lap = Math.Max(sample.Lap - 1, 0),
                LapTime = sample.LastLapTime,
                Valid = this._lapValid,
                CompletedAt = sample.Timestamp,
            };
        }

        this._primed = true;
        this._lastLapTime = sample.LastLapTime;
        this._lapValid = sample.LapValid;
        return completed;
    }
}
