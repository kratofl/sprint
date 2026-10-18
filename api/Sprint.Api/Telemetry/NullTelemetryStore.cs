using Sprint.Contracts;

namespace Sprint.Api.Telemetry;

/// <summary>No-op store used when InfluxDB is not configured (local dev without the time-series DB, and tests). Live viewing still works; history is empty.</summary>
public sealed class NullTelemetryStore : ITelemetryStore
{
    public void WriteSamples(string driverId, string sessionKey, IReadOnlyList<LiveSample> samples)
    {
    }

    public void WriteLaps(string driverId, string sessionKey, IReadOnlyList<LiveLap> laps)
    {
    }

    public Task<IReadOnlyList<LiveSample>> ReadSamplesAsync(string driverId, string sessionKey, DateTimeOffset from, int maxPoints, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<LiveSample>>([]);

    public Task<IReadOnlyList<LiveLap>> ReadLapsAsync(string driverId, string sessionKey, DateTimeOffset from, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<LiveLap>>([]);
}
