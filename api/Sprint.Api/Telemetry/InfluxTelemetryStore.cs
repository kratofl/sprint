using InfluxDB.Client;
using InfluxDB.Client.Api.Domain;
using InfluxDB.Client.Writes;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Api.Telemetry;

/// <summary>InfluxDB 2.x-backed telemetry store. One measurement (<c>telemetry</c>), tagged by relay channel + driver.</summary>
public sealed class InfluxTelemetryStore : ITelemetryStore, IDisposable
{
    private const string Measurement = "telemetry";

    private readonly InfluxDBClient _client;
    private readonly string _bucket;
    private readonly string _org;

    public InfluxTelemetryStore(InfluxOptions options)
    {
        _client = new InfluxDBClient(options.Url, options.Token);
        _bucket = options.Bucket;
        _org = options.Org;
    }

    public async Task WriteFrameAsync(string channelKey, string driverId, TelemetryFrame frame, CancellationToken ct = default)
    {
        var point = PointData.Measurement(Measurement)
            .Tag("session", channelKey)
            .Tag("driver", driverId)
            .Field("speed", (double)frame.Car.SpeedMetersPerSecond)
            .Field("rpm", (double)frame.Car.Rpm)
            .Field("gear", (long)frame.Car.Gear)
            .Field("throttle", (double)frame.Car.Throttle)
            .Field("brake", (double)frame.Car.Brake)
            .Field("lap", (long)frame.Lap.CurrentLap)
            .Field("lapTime", frame.Lap.CurrentLapTime)
            .Timestamp(frame.Timestamp.UtcDateTime, WritePrecision.Ns);

        await _client.GetWriteApiAsync().WritePointAsync(point, _bucket, _org, ct);
    }

    public async Task<IReadOnlyList<TelemetrySample>> GetRecentSamplesAsync(string channelKey, int limit, CancellationToken ct = default)
    {
        var flux =
            $"from(bucket: \"{_bucket}\")\n" +
            "  |> range(start: -6h)\n" +
            $"  |> filter(fn: (r) => r._measurement == \"{Measurement}\" and r.session == \"{channelKey}\")\n" +
            "  |> pivot(rowKey:[\"_time\"], columnKey: [\"_field\"], valueColumn: \"_value\")\n" +
            "  |> sort(columns:[\"_time\"], desc:true)\n" +
            $"  |> limit(n: {limit})";

        var tables = await _client.GetQueryApi().QueryAsync(flux, _org, ct);
        var samples = new List<TelemetrySample>();
        foreach (var record in tables.SelectMany(t => t.Records))
        {
            var time = record.GetTime();
            samples.Add(new TelemetrySample
            {
                Timestamp = time.HasValue
                    ? new DateTimeOffset(time.Value.ToDateTimeUtc(), TimeSpan.Zero)
                    : default,
                Speed = ReadDouble(record, "speed"),
                Rpm = ReadDouble(record, "rpm"),
                Gear = (int)ReadDouble(record, "gear"),
                Lap = (int)ReadDouble(record, "lap"),
                LapTime = ReadDouble(record, "lapTime"),
                Throttle = ReadDouble(record, "throttle"),
                Brake = ReadDouble(record, "brake")
            });
        }

        return samples;
    }

    private static double ReadDouble(InfluxDB.Client.Core.Flux.Domain.FluxRecord record, string key) =>
        record.GetValueByKey(key) is { } value ? Convert.ToDouble(value) : 0d;

    public void Dispose() => _client.Dispose();
}

/// <summary>InfluxDB connection settings, bound from <c>INFLUXDB_*</c> environment variables.</summary>
public sealed record InfluxOptions
{
    public required string Url { get; init; }
    public required string Token { get; init; }
    public required string Org { get; init; }
    public required string Bucket { get; init; }
}
