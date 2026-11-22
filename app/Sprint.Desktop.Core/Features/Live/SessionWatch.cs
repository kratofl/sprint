using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// Tells the frame enrichers when the session they follow starts over: the track or the session
/// type changes, or the session clock runs back (a restart).
/// </summary>
/// <remarks>Not thread-safe: each tracker owns one and calls it from the telemetry reader thread.</remarks>
internal sealed class SessionWatch
{
    // A session clock that steps back by more than this is a restart, not jitter.
    private const double RestartSeconds = 1;

    private string _track = "";
    private SessionType _sessionType = SessionType.Unknown;
    private double _sessionTime;

    /// <summary>Whether <paramref name="session"/> belongs to another session than the last frame's; remembers it either way.</summary>
    public bool StartedOver(SessionInfo session)
    {
        bool startedOver = session.SessionTime + RestartSeconds < this._sessionTime
            || !string.Equals(session.Track, this._track, StringComparison.Ordinal)
            || session.SessionType != this._sessionType;
        this._track = session.Track;
        this._sessionType = session.SessionType;
        this._sessionTime = session.SessionTime;
        return startedOver;
    }
}
