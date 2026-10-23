using Sprint.Contracts;

namespace Sprint.Api.Telemetry;

/// <summary>
/// Where live samples are kept for afterwards. InfluxDB in production
/// (<see cref="InfluxTelemetryStore"/>); a no-op (<see cref="NullTelemetryStore"/>) when InfluxDB is
/// not configured. Sessions are addressed by driver and session key, never by key alone: keys
/// come from clients, so only the pair is guaranteed unique.
/// </summary>
public interface ITelemetryStore
{
    /// <summary>Queues samples for writing and returns at once; the live path never waits on storage.</summary>
    void WriteSamples(string driverId, string sessionKey, IReadOnlyList<LiveSample> samples);

    /// <summary>Queues a completed lap for writing and returns at once.</summary>
    void WriteLaps(string driverId, string sessionKey, IReadOnlyList<LiveLap> laps);

    /// <summary>The session's samples since <paramref name="from"/>, downsampled to at most <paramref name="maxPoints"/>, oldest first.</summary>
    Task<IReadOnlyList<LiveSample>> ReadSamplesAsync(string driverId, string sessionKey, DateTimeOffset from, int maxPoints, CancellationToken ct);

    /// <summary>The session's completed laps since <paramref name="from"/>, in order.</summary>
    Task<IReadOnlyList<LiveLap>> ReadLapsAsync(string driverId, string sessionKey, DateTimeOffset from, CancellationToken ct);
}
