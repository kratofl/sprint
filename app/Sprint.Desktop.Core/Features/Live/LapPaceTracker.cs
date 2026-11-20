using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// The fastest valid lap Sprint's lap history holds for one track and car, as handed to
/// <see cref="LapPaceTracker"/> from outside the telemetry loop. <see cref="Car"/> is the car's
/// name as history files it (<see cref="CarNames.Of"/>), so a best only applies to the context it
/// was looked up for.
/// </summary>
public sealed record StoredBestLap(string Game, string Track, string Car, double Seconds);

/// <summary>
/// The player's pace from their own laps: the average of the last five and the last ten valid
/// laps of the session, and the all-time best at this track in this car (the stored best from
/// Sprint's lap history, or a faster lap driven since). A lap is taken when the game has timed it:
/// the lap number goes up, then the last lap time changes (LMU's scoring can lag the lap number by
/// a frame or lead it), with the validity the lap had at the line. The averages start over on a
/// new session; the laps driven count towards the all-time best until the game, track or car
/// changes, because the stored best is looked up only then (<see cref="StoredBestLapDelivery"/>).
/// </summary>
/// <remarks>Not thread-safe: <see cref="TelemetryEngine"/> calls it from its reader thread only.</remarks>
public sealed class LapPaceTracker
{
    private const int MaxLaps = 10;

    private readonly Queue<double> _validLaps = new();
    private readonly SessionWatch _session = new();
    private StoredBestLap? _storedBest;

    // The fastest valid lap driven in this game, track and car (the context), across sessions.
    private (string Game, string Track, string Car)? _context;
    private double? _drivenBest;

    private int? _lap;

    // The last lap time already taken (or there when the tracker started), and whether a lap was
    // completed whose time has not arrived yet, with the validity it had at the line.
    private double? _takenLapTime;
    private bool? _awaitingValid;

    /// <summary>The stored best for the context being driven, or null when history has none (applied only while that context is driven).</summary>
    public void SetStoredBest(StoredBestLap? best) => this._storedBest = best;

    /// <summary>Returns <paramref name="frame"/> with the averages and the all-time best filled in. Never mutates the input.</summary>
    public TelemetryFrame Augment(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        this.StartOverOnNewSession(frame.Session);
        this.FollowContext(frame.Session);
        if (frame.Session.InCar)
        {
            this.Observe(frame.Lap);
        }

        double? stored = this._storedBest is { } best
            && string.Equals(best.Game, frame.Session.Game, StringComparison.Ordinal)
            && string.Equals(best.Track, frame.Session.Track, StringComparison.Ordinal)
            && string.Equals(best.Car, CarNames.Of(frame.Session), StringComparison.Ordinal)
            ? best.Seconds
            : null;
        double? gameBest = frame.Lap.BestLapTime > 0 ? frame.Lap.BestLapTime : null;
        return frame with
        {
            Lap = frame.Lap with
            {
                LastFiveLapsAverage = this.Average(5),
                LastTenLapsAverage = this.Average(10),
                AllTimeBestLapTime = Fastest(Fastest(stored, this._drivenBest), gameBest),
            },
        };
    }

    private void Observe(LapState lap)
    {
        if (this._lap is int current && lap.CurrentLap == current + 1)
        {
            this._awaitingValid = lap.LastLapValid;
        }
        else if (this._lap is int seen && lap.CurrentLap != seen)
        {
            this._awaitingValid = null; // laps missed or a lap going back: no lap to take
        }

        this._lap = lap.CurrentLap;
        double? lapTime = lap.LastLapTime > 0 ? lap.LastLapTime : null;
        if (this._takenLapTime is null && this._awaitingValid is null)
        {
            this._takenLapTime = lapTime ?? 0; // what was there before any lap was seen
            return;
        }

        if (this._awaitingValid is bool valid && lapTime is double time && time != this._takenLapTime)
        {
            this._takenLapTime = time;
            this._awaitingValid = null;
            if (valid)
            {
                this._validLaps.Enqueue(time);
                while (this._validLaps.Count > MaxLaps)
                {
                    this._validLaps.Dequeue();
                }

                this._drivenBest = Fastest(this._drivenBest, time);
            }
        }
    }

    private double? Average(int laps) =>
        this._validLaps.Count >= laps ? this._validLaps.Skip(this._validLaps.Count - laps).Average() : null;

    private void StartOverOnNewSession(SessionInfo session)
    {
        if (this._session.StartedOver(session))
        {
            this._validLaps.Clear();
            this._lap = null;
            this._takenLapTime = null;
            this._awaitingValid = null;
        }
    }

    // A frame that cannot name its context (the game still loading) keeps the one before, as
    // StoredBestLapDelivery does.
    private void FollowContext(SessionInfo session)
    {
        if (string.IsNullOrWhiteSpace(session.Game) || string.IsNullOrWhiteSpace(session.Track) || string.IsNullOrWhiteSpace(session.Car))
        {
            return;
        }

        (string Game, string Track, string Car) context = (session.Game, session.Track, CarNames.Of(session));
        if (context != this._context)
        {
            this._context = context;
            this._drivenBest = null;
        }
    }

    private static double? Fastest(double? a, double? b) =>
        a is double x && b is double y ? Math.Min(x, y) : a ?? b;
}
