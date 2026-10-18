using Sprint.Api.Services;
using Sprint.Api.Telemetry;
using Sprint.Contracts;

namespace Sprint.Api.Live;

/// <summary>
/// One desktop's ingest socket, minus the socket: what each message does. At most one live
/// session per connection; a <c>start</c> for another key ends the current one first. Samples
/// are rate-limited per connection, so one account cannot flood memory or InfluxDB.
/// </summary>
public sealed class LiveIngestConnection(AccountSummary driver, LiveHub hub, CatalogService catalog, ITelemetryStore store, TimeProvider time)
{
    /// <summary>More than a second of samples at the desktop's 20/s in one message is not a live stream.</summary>
    public const int MaxSamplesPerMessage = 100;

    /// <summary>Samples a second a connection may average: the desktop's 20, twice over.</summary>
    public const int MaxSamplesPerSecond = 40;

    /// <summary>How far ahead of the average a connection may get: the desktop flushes up to 500 buffered samples at once.</summary>
    public const int MaxSampleBurst = 600;

    private const int MaxLabelLength = 200;

    private string? _sessionKey;
    private double _sampleAllowance = MaxSampleBurst;
    private DateTimeOffset _allowanceAt = time.GetUtcNow();

    /// <summary>The live session this connection is streaming, if any.</summary>
    public string? SessionKey => this._sessionKey;

    /// <summary>Applies one message. Returns why the connection must close, or null to carry on.</summary>
    public async Task<string?> HandleAsync(LiveIngestMessage message, CancellationToken ct)
    {
        switch (message)
        {
            case LiveStartMessage start:
                return await this.StartAsync(start, ct);
            case LiveSamplesMessage batch:
                if (batch.Samples.Count > MaxSamplesPerMessage)
                    return $"At most {MaxSamplesPerMessage} samples per message.";
                if (!this.TakeSamples(batch.Samples.Count))
                    return $"At most {MaxSamplesPerSecond} samples a second.";
                if (this._sessionKey is null)
                    return null;
                IReadOnlyList<LiveLap> laps = hub.Publish(this, driver.Id, this._sessionKey, batch.Samples);
                store.WriteSamples(driver.Id, this._sessionKey, batch.Samples);
                if (laps.Count > 0)
                    store.WriteLaps(driver.Id, this._sessionKey, laps);
                return null;
            case LiveEndMessage:
                if (this._sessionKey is not null)
                    hub.End(this, driver.Id, this._sessionKey);
                this._sessionKey = null;
                return null;
            default:
                return "Unknown message.";
        }
    }

    /// <summary>The socket closed or broke without <c>end</c>: the session waits a while for the desktop to come back.</summary>
    public void Disconnected()
    {
        if (this._sessionKey is not null)
            hub.Detach(this, driver.Id, this._sessionKey);
        this._sessionKey = null;
    }

    private async Task<string?> StartAsync(LiveStartMessage start, CancellationToken ct)
    {
        string? key = SessionKeys.Clean(start.SessionKey);
        if (key is null)
            return "A live session needs a sessionKey.";
        LiveStartMessage clean = start with
        {
            SessionKey = key,
            Game = Clip(start.Game),
            Track = Clip(start.Track),
            Car = Clip(start.Car),
            SessionType = string.IsNullOrWhiteSpace(start.SessionType) ? "unknown" : Clip(start.SessionType),
        };

        if (this._sessionKey is not null && this._sessionKey != key)
            hub.End(this, driver.Id, this._sessionKey);

        SessionSummary session = await catalog.EnsureLiveSessionAsync(driver.Id, clean, time.GetUtcNow(), ct);
        hub.Start(this, driver, session.Id, clean);
        this._sessionKey = key;
        return null;
    }

    /// <summary>Token bucket: spends <paramref name="count"/> samples of the allowance, which refills at <see cref="MaxSamplesPerSecond"/>. False when it is spent.</summary>
    private bool TakeSamples(int count)
    {
        DateTimeOffset now = time.GetUtcNow();
        double refill = Math.Max((now - this._allowanceAt).TotalSeconds, 0) * MaxSamplesPerSecond;
        this._sampleAllowance = Math.Min(MaxSampleBurst, this._sampleAllowance + refill);
        this._allowanceAt = now;
        if (count > this._sampleAllowance)
            return false;
        this._sampleAllowance -= count;
        return true;
    }

    private static string Clip(string? value)
    {
        string trimmed = (value ?? "").Trim();
        return trimmed.Length <= MaxLabelLength ? trimmed : trimmed[..MaxLabelLength];
    }
}
