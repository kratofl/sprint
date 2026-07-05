using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Api.Telemetry;

/// <summary>No-op store used when InfluxDB is not configured (local dev without the time-series DB, and tests).</summary>
public sealed class NullTelemetryStore : ITelemetryStore
{
    public Task WriteFrameAsync(string channelKey, string driverId, TelemetryFrame frame, CancellationToken ct = default) =>
        Task.CompletedTask;

    public Task<IReadOnlyList<TelemetrySample>> GetRecentSamplesAsync(string channelKey, int limit, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<TelemetrySample>>([]);
}
