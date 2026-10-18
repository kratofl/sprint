using System.Globalization;
using InfluxDB.Client;
using InfluxDB.Client.Api.Domain;
using InfluxDB.Client.Core.Flux.Domain;
using InfluxDB.Client.Writes;
using Sprint.Contracts;

namespace Sprint.Api.Telemetry;

/// <summary>
/// InfluxDB 2.x store. Measurement <c>live_sample</c> (one point per <see cref="LiveSample"/>, its
/// JSON names as field names) and <c>live_lap</c> (fields <c>lap</c>, <c>lapTime</c>, <c>valid</c>),
/// both tagged <c>driver_id</c> and <c>session_key</c>, millisecond precision.
/// <para>
/// Writes go through the client's batching write API, which buffers and flushes on its own
/// thread, so the ingest socket never waits on Influx. A failed batch is logged and dropped.
/// </para>
/// </summary>
public sealed class InfluxTelemetryStore : ITelemetryStore, IDisposable
{
    private const string SampleMeasurement = "live_sample";
    private const string LapMeasurement = "live_lap";

    private readonly InfluxDBClient _client;
    private readonly WriteApi _writes;
    private readonly string _bucket;
    private readonly string _org;

    public InfluxTelemetryStore(InfluxOptions options, ILogger<InfluxTelemetryStore> logger)
    {
        this._client = new InfluxDBClient(options.Url, options.Token);
        this._writes = this._client.GetWriteApi(new WriteOptions { BatchSize = 2000, FlushInterval = 1000 });
        this._writes.EventHandler += (_, args) =>
        {
            if (args is WriteErrorEvent error)
                logger.LogWarning(error.Exception, "Dropped a telemetry batch InfluxDB refused");
        };
        this._bucket = options.Bucket;
        this._org = options.Org;
    }

    public void WriteSamples(string driverId, string sessionKey, IReadOnlyList<LiveSample> samples)
    {
        List<PointData> points = [.. samples.Select(sample => PointData.Measurement(SampleMeasurement)
            .Tag("driver_id", driverId)
            .Tag("session_key", sessionKey)
            .Field("lap", (long)sample.Lap)
            .Field("sector", (long)sample.Sector)
            .Field("currentLapTime", sample.CurrentLapTime)
            .Field("lastLapTime", sample.LastLapTime)
            .Field("bestLapTime", sample.BestLapTime)
            .Field("delta", sample.Delta)
            .Field("lapValid", sample.LapValid)
            .Field("position", (long)sample.Position)
            .Field("speedKph", sample.SpeedKph)
            .Field("rpm", sample.Rpm)
            .Field("maxRpm", sample.MaxRpm)
            .Field("gear", (long)sample.Gear)
            .Field("throttle", sample.Throttle)
            .Field("brake", sample.Brake)
            .Field("steering", sample.Steering)
            .Field("fuel", sample.Fuel)
            .Field("trackPosition", sample.TrackPosition)
            .Field("tyreTempFl", sample.TyreTempFl)
            .Field("tyreTempFr", sample.TyreTempFr)
            .Field("tyreTempRl", sample.TyreTempRl)
            .Field("tyreTempRr", sample.TyreTempRr)
            .Field("tyreWearFl", sample.TyreWearFl)
            .Field("tyreWearFr", sample.TyreWearFr)
            .Field("tyreWearRl", sample.TyreWearRl)
            .Field("tyreWearRr", sample.TyreWearRr)
            .Timestamp(sample.Timestamp, WritePrecision.Ms))];
        if (points.Count > 0)
            this._writes.WritePoints(points, this._bucket, this._org);
    }

    public void WriteLaps(string driverId, string sessionKey, IReadOnlyList<LiveLap> laps)
    {
        List<PointData> points = [.. laps.Select(lap => PointData.Measurement(LapMeasurement)
            .Tag("driver_id", driverId)
            .Tag("session_key", sessionKey)
            .Field("lap", (long)lap.Lap)
            .Field("lapTime", lap.LapTime)
            .Field("valid", lap.Valid)
            .Timestamp(lap.CompletedAt, WritePrecision.Ms))];
        if (points.Count > 0)
            this._writes.WritePoints(points, this._bucket, this._org);
    }

    /// <summary>
    /// Finds the session's first and last sample, then reads it through <c>aggregateWindow</c>
    /// with a window of span / <paramref name="maxPoints"/>. The aggregate is <c>last</c>, not
    /// <c>mean</c>: every value stays one the car really had (no gear 3.5), and it works for the
    /// boolean <c>lapValid</c>.
    /// </summary>
    public async Task<IReadOnlyList<LiveSample>> ReadSamplesAsync(string driverId, string sessionKey, DateTimeOffset from, int maxPoints, CancellationToken ct)
    {
        string filter = Filter(SampleMeasurement, driverId, sessionKey);
        DateTimeOffset? first = await this.BoundAsync(filter, from, "first", ct);
        DateTimeOffset? last = await this.BoundAsync(filter, from, "last", ct);
        if (first is null || last is null)
            return [];

        long spanMs = Math.Max((long)(last.Value - first.Value).TotalMilliseconds, 1);
        long everyMs = Math.Max((spanMs + maxPoints - 1) / maxPoints, 1);
        string flux =
            $"from(bucket: {Str(this._bucket)})\n" +
            $"  |> range(start: {Time(first.Value)}, stop: {Time(last.Value.AddMilliseconds(1))})\n" +
            $"  |> filter(fn: (r) => {filter})\n" +
            $"  |> aggregateWindow(every: {everyMs}ms, fn: last, createEmpty: false)\n" +
            "  |> pivot(rowKey: [\"_time\"], columnKey: [\"_field\"], valueColumn: \"_value\")\n" +
            "  |> group()\n" +
            "  |> sort(columns: [\"_time\"])";

        List<FluxTable> tables = await this._client.GetQueryApi().QueryAsync(flux, this._org, ct);
        return [.. tables.SelectMany(t => t.Records).Take(maxPoints).Select(record => new LiveSample
        {
            Timestamp = UnixMs(record),
            Lap = (int)Number(record, "lap"),
            Sector = (int)Number(record, "sector"),
            CurrentLapTime = Number(record, "currentLapTime"),
            LastLapTime = Number(record, "lastLapTime"),
            BestLapTime = Number(record, "bestLapTime"),
            Delta = Number(record, "delta"),
            LapValid = record.GetValueByKey("lapValid") is not false,
            Position = (int)Number(record, "position"),
            SpeedKph = Number(record, "speedKph"),
            Rpm = Number(record, "rpm"),
            MaxRpm = Number(record, "maxRpm"),
            Gear = (int)Number(record, "gear"),
            Throttle = Number(record, "throttle"),
            Brake = Number(record, "brake"),
            Steering = Number(record, "steering"),
            Fuel = Number(record, "fuel"),
            TrackPosition = Number(record, "trackPosition"),
            TyreTempFl = Number(record, "tyreTempFl"),
            TyreTempFr = Number(record, "tyreTempFr"),
            TyreTempRl = Number(record, "tyreTempRl"),
            TyreTempRr = Number(record, "tyreTempRr"),
            TyreWearFl = Number(record, "tyreWearFl"),
            TyreWearFr = Number(record, "tyreWearFr"),
            TyreWearRl = Number(record, "tyreWearRl"),
            TyreWearRr = Number(record, "tyreWearRr"),
        })];
    }

    public async Task<IReadOnlyList<LiveLap>> ReadLapsAsync(string driverId, string sessionKey, DateTimeOffset from, CancellationToken ct)
    {
        string flux =
            $"from(bucket: {Str(this._bucket)})\n" +
            $"  |> range(start: {Time(from)})\n" +
            $"  |> filter(fn: (r) => {Filter(LapMeasurement, driverId, sessionKey)})\n" +
            "  |> pivot(rowKey: [\"_time\"], columnKey: [\"_field\"], valueColumn: \"_value\")\n" +
            "  |> group()\n" +
            "  |> sort(columns: [\"_time\"])";

        List<FluxTable> tables = await this._client.GetQueryApi().QueryAsync(flux, this._org, ct);
        return [.. tables.SelectMany(t => t.Records).Select(record => new LiveLap
        {
            Lap = (int)Number(record, "lap"),
            LapTime = Number(record, "lapTime"),
            Valid = record.GetValueByKey("valid") is true,
            CompletedAt = UnixMs(record),
        })];
    }

    public void Dispose()
    {
        this._writes.Dispose();
        this._client.Dispose();
    }

    private async Task<DateTimeOffset?> BoundAsync(string filter, DateTimeOffset from, string selector, CancellationToken ct)
    {
        string flux =
            $"from(bucket: {Str(this._bucket)})\n" +
            $"  |> range(start: {Time(from)})\n" +
            $"  |> filter(fn: (r) => {filter} and r._field == \"lap\")\n" +
            "  |> group()\n" +
            $"  |> {selector}()";
        List<FluxTable> tables = await this._client.GetQueryApi().QueryAsync(flux, this._org, ct);
        FluxRecord? record = tables.SelectMany(t => t.Records).FirstOrDefault();
        return record?.GetTime() is { } instant ? new DateTimeOffset(instant.ToDateTimeUtc(), TimeSpan.Zero) : null;
    }

    private static string Filter(string measurement, string driverId, string sessionKey) =>
        $"r._measurement == {Str(measurement)} and r.driver_id == {Str(driverId)} and r.session_key == {Str(sessionKey)}";

    /// <summary>A Flux string literal. Session keys come from clients, so everything interpolated is escaped.</summary>
    private static string Str(string value) =>
        "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("${", "\\${") + "\"";

    private static string Time(DateTimeOffset value) =>
        value.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);

    private static long UnixMs(FluxRecord record) =>
        record.GetTime() is { } instant ? instant.ToUnixTimeMilliseconds() : 0;

    private static double Number(FluxRecord record, string key) =>
        record.GetValueByKey(key) is IConvertible value and not bool ? value.ToDouble(CultureInfo.InvariantCulture) : 0d;
}

/// <summary>InfluxDB connection settings, bound from <c>INFLUXDB_*</c> environment variables.</summary>
public sealed record InfluxOptions
{
    public required string Url { get; init; }
    public required string Token { get; init; }
    public required string Org { get; init; }
    public required string Bucket { get; init; }
}
