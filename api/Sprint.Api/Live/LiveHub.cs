using System.Threading.Channels;
using Sprint.Contracts;

namespace Sprint.Api.Live;

/// <summary>One event on a viewer's live stream; the SSE endpoint writes each as the named event.</summary>
public abstract record LiveStreamEvent;

public sealed record StreamSnapshot(LiveSnapshotEvent Payload) : LiveStreamEvent;

public sealed record StreamSamples(LiveSamplesEvent Payload) : LiveStreamEvent;

public sealed record StreamLap(LiveLapEvent Payload) : LiveStreamEvent;

/// <summary>Terminal: the session ended. The stream closes after it.</summary>
public sealed record StreamEnded(LiveClosedEvent Payload) : LiveStreamEvent;

/// <summary>Terminal: the viewer lost access. The stream closes after it.</summary>
public sealed record StreamRevoked(LiveClosedEvent Payload) : LiveStreamEvent;

/// <summary>A live session as the hub holds it.</summary>
public sealed record LiveSessionView(string DriverId, LiveSessionDto Session);

/// <summary>A viewer's place on a live session. Dispose to leave.</summary>
public sealed class LiveSubscription(LiveHub hub, string driverId, string sessionKey, string viewerId, Channel<LiveStreamEvent> channel) : IDisposable
{
    public string DriverId { get; } = driverId;
    public string SessionKey { get; } = sessionKey;
    public string ViewerId { get; } = viewerId;
    public ChannelReader<LiveStreamEvent> Events => channel.Reader;

    internal bool TryWrite(LiveStreamEvent item) => channel.Writer.TryWrite(item);

    /// <summary>Writes a terminal event and closes the stream.</summary>
    internal void Close(LiveStreamEvent last)
    {
        channel.Writer.TryWrite(last);
        channel.Writer.TryComplete();
    }

    public void Dispose() => hub.Leave(this);
}

/// <summary>
/// Sessions being streamed right now, in memory: per driver and session key the last 30 s of samples,
/// the laps so far and the viewers to fan out to. Keys come from clients, so only the pair is unique —
/// keyed by the key alone, anybody who knew a driver's key could take it while the driver was away. Never blocks a sender: a viewer that falls behind loses its
/// oldest unread events, not the driver's stream.
/// <para>
/// A dropped desktop connection does not end the session at once: it stays, marked disconnected,
/// for <c>reconnectGrace</c>, so a reconnecting desktop that sends the same <c>start</c> resumes
/// it and its viewers stay on. Who may watch is decided outside (see <see cref="Services.ViewerGrants"/>);
/// the hub only carries out <see cref="Revoke"/>.
/// </para>
/// </summary>
public sealed class LiveHub(TimeProvider time, TimeSpan reconnectGrace)
{
    public static readonly TimeSpan DefaultReconnectGrace = TimeSpan.FromSeconds(30);
    private const int ViewerBuffer = 256;

    /// <summary>Laps a live session keeps for new viewers' snapshots; a 24-hour race has fewer than 400.</summary>
    public const int MaxLaps = 1000;

    /// <summary>How far back, by sample timestamp, a new viewer's snapshot reaches: the web's rolling trace.</summary>
    public static readonly TimeSpan RecentWindow = TimeSpan.FromSeconds(30);

    /// <summary>Samples a live session keeps for that window however fast they come: 30 s at the desktop's 20/s.</summary>
    public const int MaxRecentSamples = 600;

    private readonly Lock _gate = new();
    private readonly Dictionary<(string DriverId, string SessionKey), Live> _sessions = [];

    /// <summary>
    /// Starts <paramref name="start"/>'s session for <paramref name="connection"/>, or resumes it
    /// when the driver already has it (a reconnect, or a second PC taking over).
    /// </summary>
    public void Start(object connection, AccountSummary driver, string sessionId, LiveStartMessage start)
    {
        lock (this._gate)
        {
            if (this._sessions.TryGetValue((driver.Id, start.SessionKey), out Live? live))
            {
                live.Owner = connection;
                live.Session = live.Session with
                {
                    Game = start.Game,
                    Track = start.Track,
                    Car = start.Car,
                    SessionType = start.SessionType,
                    Connected = true,
                };
                live.Generation++;
                return;
            }

            this._sessions[(driver.Id, start.SessionKey)] = new Live(connection, new LiveSessionDto
            {
                SessionId = sessionId,
                SessionKey = start.SessionKey,
                Driver = driver,
                Game = start.Game,
                Track = start.Track,
                Car = start.Car,
                SessionType = start.SessionType,
                StartedAt = time.GetUtcNow(),
                Connected = true,
            });
        }
    }

    /// <summary>Fans a batch out to the viewers and returns the laps it completed. Ignored unless <paramref name="connection"/> owns the session.</summary>
    public IReadOnlyList<LiveLap> Publish(object connection, string driverId, string sessionKey, IReadOnlyList<LiveSample> samples)
    {
        if (samples.Count == 0)
            return [];
        lock (this._gate)
        {
            if (!this._sessions.TryGetValue((driverId, sessionKey), out Live? live) || live.Owner != connection)
                return [];

            List<LiveLap> laps = [];
            foreach (LiveSample sample in samples)
            {
                if (live.Detector.Next(sample) is { } lap)
                    laps.Add(lap);
            }

            live.Latest = samples[^1];
            foreach (LiveSample sample in samples)
                live.Recent.Enqueue(sample);
            long cutoff = live.Latest.Timestamp - (long)RecentWindow.TotalMilliseconds;
            while (live.Recent.Count > MaxRecentSamples || live.Recent.Peek().Timestamp < cutoff)
                live.Recent.Dequeue();
            live.Laps.AddRange(laps);
            if (live.Laps.Count > MaxLaps)
                live.Laps.RemoveRange(0, live.Laps.Count - MaxLaps);
            StreamSamples batch = new(new LiveSamplesEvent { Samples = samples });
            foreach (LiveSubscription viewer in live.Viewers)
            {
                viewer.TryWrite(batch);
                foreach (LiveLap lap in laps)
                    viewer.TryWrite(new StreamLap(new LiveLapEvent { Lap = lap }));
            }

            return laps;
        }
    }

    /// <summary>Ends the session now: viewers get <c>ended</c> and their streams close. Ignored unless <paramref name="connection"/> owns it.</summary>
    public void End(object connection, string driverId, string sessionKey)
    {
        lock (this._gate)
        {
            if (this._sessions.TryGetValue((driverId, sessionKey), out Live? live) && live.Owner == connection)
                this.Remove((driverId, sessionKey), live);
        }
    }

    /// <summary>The owning connection dropped: the session waits for a reconnect, then ends.</summary>
    public void Detach(object connection, string driverId, string sessionKey)
    {
        int generation;
        lock (this._gate)
        {
            if (!this._sessions.TryGetValue((driverId, sessionKey), out Live? live) || live.Owner != connection)
                return;
            live.Session = live.Session with { Connected = false };
            generation = ++live.Generation;
        }

        _ = this.EndUnlessResumedAsync((driverId, sessionKey), generation);
    }

    /// <summary>
    /// Joins a live session. The first event is always the snapshot. Null when the driver has
    /// nothing live under that key. Access is the caller's to check — after joining, so that a
    /// revoke racing the join still reaches this subscription.
    /// </summary>
    public LiveSubscription? Subscribe(string driverId, string sessionKey, string viewerId)
    {
        lock (this._gate)
        {
            if (!this._sessions.TryGetValue((driverId, sessionKey), out Live? live))
                return null;

            Channel<LiveStreamEvent> channel = Channel.CreateBounded<LiveStreamEvent>(new BoundedChannelOptions(ViewerBuffer)
            {
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true,
            });
            LiveSubscription subscription = new(this, driverId, sessionKey, viewerId, channel);
            subscription.TryWrite(new StreamSnapshot(new LiveSnapshotEvent { Session = live.Session, Latest = live.Latest, Recent = [.. live.Recent], Laps = [.. live.Laps] }));
            live.Viewers.Add(subscription);
            return subscription;
        }
    }

    /// <summary>
    /// Takes <paramref name="viewerId"/> off <paramref name="driverId"/>'s live sessions — one, or
    /// all when <paramref name="sessionKey"/> is null. Their streams get <c>revoked</c> and close.
    /// </summary>
    public void Revoke(string driverId, string viewerId, string? sessionKey, string reason)
    {
        lock (this._gate)
        {
            foreach (((string driver, string key), Live live) in this._sessions)
            {
                if (driver != driverId || (sessionKey is not null && key != sessionKey))
                    continue;
                foreach (LiveSubscription viewer in live.Viewers.Where(v => v.ViewerId == viewerId).ToList())
                {
                    viewer.Close(new StreamRevoked(new LiveClosedEvent { SessionKey = key, Reason = reason }));
                    live.Viewers.Remove(viewer);
                }
            }
        }
    }

    /// <summary>Every live session.</summary>
    public IReadOnlyList<LiveSessionView> All()
    {
        lock (this._gate)
            return [.. this._sessions.Values.Select(live => new LiveSessionView(live.Session.Driver.Id, live.Session))];
    }

    public LiveSessionView? Find(string driverId, string sessionKey)
    {
        lock (this._gate)
            return this._sessions.TryGetValue((driverId, sessionKey), out Live? live) ? new LiveSessionView(driverId, live.Session) : null;
    }

    /// <summary>Every driver's live session under <paramref name="sessionKey"/>: one, unless clients collided or somebody copied a key.</summary>
    public IReadOnlyList<LiveSessionView> WithKey(string sessionKey)
    {
        lock (this._gate)
        {
            return [.. this._sessions
                .Where(entry => entry.Key.SessionKey == sessionKey)
                .Select(entry => new LiveSessionView(entry.Key.DriverId, entry.Value.Session))];
        }
    }

    public bool IsLive(string driverId, string sessionKey)
    {
        lock (this._gate)
            return this._sessions.ContainsKey((driverId, sessionKey));
    }

    internal void Leave(LiveSubscription subscription)
    {
        lock (this._gate)
        {
            if (this._sessions.TryGetValue((subscription.DriverId, subscription.SessionKey), out Live? live))
                live.Viewers.Remove(subscription);
        }
    }

    private async Task EndUnlessResumedAsync((string DriverId, string SessionKey) key, int generation)
    {
        await Task.Delay(reconnectGrace, time).ConfigureAwait(false);
        lock (this._gate)
        {
            if (this._sessions.TryGetValue(key, out Live? live) && live.Generation == generation)
                this.Remove(key, live);
        }
    }

    private void Remove((string DriverId, string SessionKey) key, Live live)
    {
        this._sessions.Remove(key);
        foreach (LiveSubscription viewer in live.Viewers)
            viewer.Close(new StreamEnded(new LiveClosedEvent { SessionKey = key.SessionKey, Reason = "The session ended." }));
        live.Viewers.Clear();
    }

    private sealed class Live(object owner, LiveSessionDto session)
    {
        public object Owner { get; set; } = owner;
        public LiveSessionDto Session { get; set; } = session;

        /// <summary>Bumped on every resume and detach, so a stale grace timer knows it is stale.</summary>
        public int Generation { get; set; }
        public LiveSample? Latest { get; set; }

        /// <summary>The last <see cref="RecentWindow"/> of samples, oldest first, at most <see cref="MaxRecentSamples"/>.</summary>
        public Queue<LiveSample> Recent { get; } = new();
        public List<LiveLap> Laps { get; } = [];
        public LapDetector Detector { get; } = new();
        public List<LiveSubscription> Viewers { get; } = [];
    }
}
