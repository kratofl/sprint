using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Api.Telemetry;

/// <summary>
/// Time-series persistence for telemetry frames. Backed by InfluxDB in production
/// (<see cref="InfluxTelemetryStore"/>); a no-op (<see cref="NullTelemetryStore"/>)
/// is used when InfluxDB is not configured and in tests.
/// </summary>
public interface ITelemetryStore
{
    /// <summary>Persists one frame under a relay channel key (the invite code / session id).</summary>
    Task WriteFrameAsync(string channelKey, string driverId, TelemetryFrame frame, CancellationToken ct = default);

    /// <summary>Returns the most recent samples for a channel, newest first.</summary>
    Task<IReadOnlyList<TelemetrySample>> GetRecentSamplesAsync(string channelKey, int limit, CancellationToken ct = default);
}

/// <summary>A lightweight, flattened view of a stored telemetry point for history queries.</summary>
public sealed record TelemetrySample
{
    public DateTimeOffset Timestamp { get; init; }
    public double Speed { get; init; }
    public double Rpm { get; init; }
    public int Gear { get; init; }
    public int Lap { get; init; }
    public double LapTime { get; init; }
    public double Throttle { get; init; }
    public double Brake { get; init; }
}
