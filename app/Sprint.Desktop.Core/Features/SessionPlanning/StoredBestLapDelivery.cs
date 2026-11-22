using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Looks up the fastest valid lap Sprint's lap history holds for the track and car being driven
/// and hands it to the telemetry engine (<see cref="TelemetryEngine.RequestStoredBest"/>), for the
/// dash's all-time best. Reads the corpus only when the context changes: laps driven since are
/// seen by the engine itself (<see cref="LapPaceTracker"/>), so the stored figure need not follow
/// them. Runs on the host's ingestion loop, never the telemetry loop; not thread-safe.
/// </summary>
public sealed class StoredBestLapDelivery
{
    private readonly ILapHistoryStore _store;
    private readonly Action<StoredBestLap?> _deliver;
    private (string Game, string Track, string Car)? _context;

    public StoredBestLapDelivery(ILapHistoryStore store, Action<StoredBestLap?> deliver)
    {
        this._store = store ?? throw new ArgumentNullException(nameof(store));
        this._deliver = deliver ?? throw new ArgumentNullException(nameof(deliver));
    }

    /// <summary>Delivers the stored best when <paramref name="frame"/> is in another context than the last one; otherwise does nothing.</summary>
    public void Observe(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        SessionInfo session = frame.Session;
        if (string.IsNullOrWhiteSpace(session.Game) || string.IsNullOrWhiteSpace(session.Track) || string.IsNullOrWhiteSpace(session.Car))
        {
            return; // not enough to name a context (the game still loading): keep what was delivered
        }

        (string Game, string Track, string Car) context = (session.Game, session.Track, CarNames.Of(session));
        if (context == this._context)
        {
            return;
        }

        this._context = context;
        List<double> times = this._store.LoadAll()
            .Where(stored => stored.Context.Game == context.Game && stored.Context.TrackCourse == context.Track && stored.Context.CarModel == context.Car)
            .SelectMany(stored => stored.Laps)
            // The corpus rule: invalid laps and laps with no recorded time never count.
            .Where(lap => lap.IsValid && lap.LapTimeSeconds > 0)
            .Select(lap => lap.LapTimeSeconds)
            .ToList();
        this._deliver(times.Count > 0 ? new StoredBestLap(context.Game, context.Track, context.Car, times.Min()) : null);
    }
}
