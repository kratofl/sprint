using System.Text.Json.Serialization;
using Sprint.Contracts;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>What the live uplink is doing, for Settings. Crosses the wire by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<LiveUplinkStatus>))]
public enum LiveUplinkStatus
{
    /// <summary>Signed out, or data is kept on this PC only: nothing is streamed.</summary>
    Off,

    /// <summary>Ready to stream as soon as a game delivers frames for a session.</summary>
    WaitingForGame,

    /// <summary>Opening the first connection for the session being driven.</summary>
    Connecting,

    Streaming,

    /// <summary>The connection failed or dropped; samples are dropped until it is back.</summary>
    Reconnecting,
}

/// <summary>The session the uplink streams: its desktop id (the session key) and what it is.</summary>
public sealed record LiveTarget(string SessionKey, string Game, string Track, string Car, string SessionType);

/// <summary>The uplink's rules, apart from any socket or clock.</summary>
public static class LiveUplinkRules
{
    /// <summary>How long a session counts as being driven after its last frame. A paused or closed game ends it after this.</summary>
    public static readonly TimeSpan Idle = TimeSpan.FromSeconds(10);

    /// <summary>Live telemetry goes where synced data goes: only when signed in and data is kept on the server.</summary>
    public static bool Enabled(bool signedIn, CloudStorageMode storage) =>
        signedIn && storage is CloudStorageMode.Both or CloudStorageMode.Remote;

    /// <summary>
    /// The recorder's open session as a live target. The session type is the kind's name, as the
    /// sync sends it, so the live and the synced copy of a session describe it the same way.
    /// </summary>
    public static LiveTarget TargetOf(LapHistorySession session) =>
        new(session.Id, session.Context.Game, session.Context.TrackCourse, session.Context.CarModel, session.Kind.ToString());

    /// <summary>The server's live ingest endpoint: its own address with a ws/wss scheme.</summary>
    public static Uri IngestUri(string serverUrl)
    {
        UriBuilder builder = new(serverUrl.Trim().TrimEnd('/') + "/api/live/ingest");
        builder.Scheme = builder.Scheme == Uri.UriSchemeHttps ? "wss" : "ws";
        return builder.Uri;
    }

    /// <summary>Wait before reconnect attempt <paramref name="failures"/>: 1, 2, 4, 8, 16, then 30 seconds.</summary>
    public static TimeSpan Backoff(int failures) =>
        TimeSpan.FromSeconds(Math.Min(30, Math.Pow(2, Math.Clamp(failures - 1, 0, 5))));
}

/// <summary>
/// Caps samples at 20 a second (one per 50 ms on average) by the frames' own timestamps, so the
/// rate holds whatever the game delivers. Not thread-safe: used from the telemetry loop only.
/// </summary>
public sealed class LiveSampleGate
{
    private static readonly TimeSpan Spacing = TimeSpan.FromMilliseconds(50);
    private DateTimeOffset? _next;

    public bool Admit(DateTimeOffset timestamp)
    {
        if (this._next is { } next && timestamp < next && next - timestamp <= Spacing)
            return false;

        // Due slots advance by the spacing so a 30 Hz game still yields 20 a second; after a gap
        // (or a clock jump back) the schedule restarts from this frame.
        this._next = this._next is { } due && timestamp >= due && timestamp - due < Spacing ? due + Spacing : timestamp + Spacing;
        return true;
    }

    public void Reset() => this._next = null;
}

/// <summary>A connection that cannot carry on; <see cref="Exception.Message"/> is fit to show the driver.</summary>
public sealed class LiveConnectionException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>One open ingest connection. The seam between the uplink and its WebSocket.</summary>
public interface ILiveConnection : IAsyncDisposable
{
    /// <summary>Sends one message; throws <see cref="LiveConnectionException"/> once the connection is gone.</summary>
    Task SendAsync(LiveIngestMessage message, CancellationToken ct);
}

/// <summary>Opens an ingest connection to <c>ingest</c> with the bearer <c>token</c>.</summary>
public delegate Task<ILiveConnection> LiveConnect(Uri ingest, string token, CancellationToken ct);

/// <summary>
/// Streams the session being driven to the signed-in Sprint server while a game delivers frames
/// (#live telemetry). The telemetry loop feeds it (<see cref="Update"/> every tick, <see cref="Observe"/>
/// per new frame) and never waits on it: both only set fields or append to a small buffer. A
/// worker calls <see cref="StepAsync"/> about every 100 ms; that is where the connection is opened,
/// the session started or ended, and the buffered samples sent as one batch.
/// <para>
/// Samples are dropped, not queued, while there is no connection: an engineer wants now, and a
/// backlog after an outage would only delay it. The connection is retried with a backoff.
/// </para>
/// </summary>
public sealed class LiveUplink(LiveConnect connect, ILog? log = null)
{
    private const int MaxBatch = 100;
    private static readonly TimeSpan EndTimeout = TimeSpan.FromSeconds(2);

    private readonly ILog _log = log ?? NullLog.Instance;
    private readonly Lock _bufferGate = new();
    private readonly List<LiveSample> _buffer = [];
    private readonly LiveSampleGate _gate = new();

    // Written by the telemetry loop, read by the worker.
    private volatile Goal _goal = new(null, null);
    private long _lastFrameTicks;

    // Written by the worker, read by the telemetry loop: the key a start was sent for.
    private volatile string? _streamingKey;

    // Worker only.
    private ILiveConnection? _connection;
    private CloudCredentials? _connectedAs;
    private LiveTarget? _started;
    private int _failures;
    private DateTimeOffset _retryAt;

    public LiveUplinkStatus Status { get; private set; } = LiveUplinkStatus.Off;

    /// <summary>Why the last attempt failed, while <see cref="Status"/> is <see cref="LiveUplinkStatus.Reconnecting"/>.</summary>
    public string? Detail { get; private set; }

    /// <summary>
    /// The account, where data is kept and the recorder's open session, every telemetry tick.
    /// <paramref name="credentials"/> is null when signed out.
    /// </summary>
    public void Update(CloudCredentials? credentials, CloudStorageMode storage, LapHistorySession? openSession)
    {
        CloudCredentials? allowed = LiveUplinkRules.Enabled(credentials is not null, storage) ? credentials : null;
        LiveTarget? target = allowed is not null && openSession is not null ? LiveUplinkRules.TargetOf(openSession) : null;
        Goal current = this._goal;
        if (current.Credentials == allowed && current.Target == target)
            return;

        if (current.Target?.SessionKey != target?.SessionKey)
        {
            // Samples of the session that just ended must not be sent as the next one's.
            lock (this._bufferGate)
                this._buffer.Clear();
            this._gate.Reset();
        }

        this._goal = new Goal(allowed, target);
    }

    /// <summary>A new telemetry frame. Cheap: notes the time and, while streaming, keeps a sample at up to 20 Hz.</summary>
    public void Observe(TelemetryFrame frame)
    {
        Interlocked.Exchange(ref this._lastFrameTicks, frame.Timestamp.UtcTicks);
        string? streaming = this._streamingKey;
        if (streaming is null || streaming != this._goal.Target?.SessionKey || !this._gate.Admit(frame.Timestamp))
            return;

        LiveSample sample = LiveSample.FromFrame(frame);
        lock (this._bufferGate)
        {
            // Bounded in case the worker stalls; the oldest go first.
            if (this._buffer.Count >= MaxBatch * 5)
                this._buffer.RemoveAt(0);
            this._buffer.Add(sample);
        }
    }

    /// <summary>One worker step at <paramref name="now"/>: connects, starts or ends the session, and sends what was buffered.</summary>
    public async Task StepAsync(DateTimeOffset now, CancellationToken ct = default)
    {
        Goal goal = this._goal;
        bool driving = now - new DateTimeOffset(Interlocked.Read(ref this._lastFrameTicks), TimeSpan.Zero) <= LiveUplinkRules.Idle;
        LiveTarget? target = driving ? goal.Target : null;

        if (this._connection is not null && (target is null || this._connectedAs != goal.Credentials))
            await this.CloseAsync().ConfigureAwait(false);

        if (goal.Credentials is not { } credentials || target is null)
        {
            this._failures = 0;
            this.Detail = null;
            this.Status = goal.Credentials is null ? LiveUplinkStatus.Off : LiveUplinkStatus.WaitingForGame;
            return;
        }

        if (this._connection is null)
        {
            if (this._failures > 0 && now < this._retryAt)
                return;
            this.Status = this._failures == 0 ? LiveUplinkStatus.Connecting : LiveUplinkStatus.Reconnecting;
            try
            {
                this._connection = await connect(LiveUplinkRules.IngestUri(credentials.ServerUrl), credentials.Token, ct).ConfigureAwait(false);
                this._connectedAs = credentials;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                this.Fail(now, ex);
                return;
            }
        }

        try
        {
            if (this._started != target)
            {
                await this._connection.SendAsync(new LiveStartMessage
                {
                    SessionKey = target.SessionKey,
                    Game = target.Game,
                    Track = target.Track,
                    Car = target.Car,
                    SessionType = target.SessionType,
                }, ct).ConfigureAwait(false);
                this._started = target;
                this._streamingKey = target.SessionKey;
            }

            List<LiveSample> batch;
            lock (this._bufferGate)
            {
                batch = [.. this._buffer];
                this._buffer.Clear();
            }

            foreach (LiveSample[] chunk in batch.Chunk(MaxBatch))
                await this._connection.SendAsync(new LiveSamplesMessage { Samples = chunk }, ct).ConfigureAwait(false);

            if (this._failures > 0)
                this._log.Info($"Live telemetry reconnected after {this._failures} failed attempt(s)");
            this._failures = 0;
            this.Detail = null;
            this.Status = LiveUplinkStatus.Streaming;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await this.DropAsync().ConfigureAwait(false);
            this.Fail(now, ex);
        }
    }

    /// <summary>Steps every 100 ms until <paramref name="stop"/>, then ends the live session if one is open.</summary>
    public async Task RunAsync(CancellationToken stop)
    {
        using PeriodicTimer timer = new(TimeSpan.FromMilliseconds(100));
        try
        {
            while (await timer.WaitForNextTickAsync(stop).ConfigureAwait(false))
            {
                try
                {
                    await this.StepAsync(DateTimeOffset.UtcNow, stop).ConfigureAwait(false);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    this._log.Warn("Live telemetry step failed", ex);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown.
        }

        await this.CloseAsync().ConfigureAwait(false);
    }

    /// <summary>Ends the started session (best effort, briefly) and closes the connection.</summary>
    private async Task CloseAsync()
    {
        if (this._connection is { } connection && this._started is not null)
        {
            using CancellationTokenSource timeout = new(EndTimeout);
            try
            {
                await connection.SendAsync(new LiveEndMessage(), timeout.Token).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is LiveConnectionException or OperationCanceledException)
            {
                // The server ends a dropped session itself after its grace period.
            }
        }

        await this.DropAsync().ConfigureAwait(false);
    }

    private async Task DropAsync()
    {
        this._streamingKey = null;
        this._started = null;
        lock (this._bufferGate)
            this._buffer.Clear();
        if (this._connection is { } connection)
        {
            this._connection = null;
            this._connectedAs = null;
            await connection.DisposeAsync().ConfigureAwait(false);
        }
    }

    private void Fail(DateTimeOffset now, Exception ex)
    {
        if (this._failures == 0)
            this._log.Warn("Live telemetry connection failed; retrying with a backoff", ex);
        this._failures++;
        this._retryAt = now + LiveUplinkRules.Backoff(this._failures);
        this.Detail = ex is LiveConnectionException ? ex.Message : "Could not reach Sprint web.";
        this.Status = LiveUplinkStatus.Reconnecting;
    }

    /// <summary>Who to stream as (null: off) and what (null: no session open).</summary>
    private sealed record Goal(CloudCredentials? Credentials, LiveTarget? Target);
}
