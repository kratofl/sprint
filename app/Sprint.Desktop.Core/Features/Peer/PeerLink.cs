using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using Sprint.Contracts;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Sharing;

namespace Sprint.Desktop.Features.Peer;

/// <summary>Where a live link is. Crosses the wire by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PeerLinkPhase>))]
public enum PeerLinkPhase
{
    Off,

    /// <summary>Opening the socket and asking STUN for this PC's public address.</summary>
    Preparing,

    /// <summary>Driver: the invite code is ready; waiting for the engineer's reply to be pasted.</summary>
    Inviting,

    /// <summary>Engineer: the reply code is ready; probing the driver until the driver pastes it.</summary>
    Joining,

    /// <summary>Driver: the reply was pasted; probing the engineer.</summary>
    Connecting,

    Connected,

    /// <summary>Was connected, but nothing arrived for a few seconds. Probing to get the path back.</summary>
    Interrupted,

    /// <summary>The link never came up. <see cref="PeerLinkState.Detail"/> says why.</summary>
    Failed,

    /// <summary>The link was up and is over: the peer left or the connection was lost.</summary>
    Ended,
}

/// <summary>How the connected packets travel. Crosses the wire by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PeerPath>))]
public enum PeerPath
{
    /// <summary>Both PCs are on the same network.</summary>
    LocalNetwork,

    /// <summary>Over the internet, through both routers (NAT hole punching).</summary>
    Ipv4,

    /// <summary>Over the internet by IPv6, without NAT.</summary>
    Ipv6,
}

/// <summary>What the STUN answers say about this PC's router. Crosses the wire by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PeerReachability>))]
public enum PeerReachability
{
    /// <summary>Only one STUN server answered, so the router's behaviour is unknown.</summary>
    Unknown,

    /// <summary>Two servers saw the same public port: the router keeps one port per socket, so direct links work.</summary>
    Open,

    /// <summary>Two servers saw different ports: the router picks a port per destination, so direct links mostly fail.</summary>
    Strict,

    /// <summary>No STUN server answered: only the same network or IPv6 can work.</summary>
    LocalOnly,
}

/// <summary>How a connected link is doing. Rates and loss cover the last second.</summary>
public sealed record PeerLinkHealth(PeerPath Path, int? RoundTripMs, double SampleRate, double? LossPercent);

/// <summary>
/// The live link as Settings and the Live link page show it. Which fields are set depends on
/// <see cref="Phase"/>: <see cref="Code"/> while inviting or joining, <see cref="Health"/> and
/// <see cref="Session"/> while connected or interrupted, <see cref="Latest"/> on the engineer's
/// side only, <see cref="Detail"/> once failed or ended.
/// </summary>
public sealed record PeerLinkState
{
    public static readonly PeerLinkState Off = new();

    public PeerLinkPhase Phase { get; init; } = PeerLinkPhase.Off;

    public PeerRole? Role { get; init; }

    /// <summary>The code this PC shows: the invite (driver) or the reply (engineer).</summary>
    public string? Code { get; init; }

    public PeerReachability Reachability { get; init; } = PeerReachability.Unknown;

    public string? Detail { get; init; }

    public PeerLinkHealth? Health { get; init; }

    /// <summary>The session being driven, or null while the driver is not on track.</summary>
    public LiveTarget? Session { get; init; }

    /// <summary>The newest telemetry sample from the driver.</summary>
    public LiveSample? Latest { get; init; }
}

/// <summary>The link's timings, apart from any socket or clock.</summary>
public static class PeerLinkRules
{
    /// <summary>How often the worker steps; also the most a sample waits before it is sent.</summary>
    public static readonly TimeSpan Step = TimeSpan.FromMilliseconds(50);

    /// <summary>Probes to every candidate while connecting.</summary>
    public static readonly TimeSpan Probe = TimeSpan.FromMilliseconds(250);

    /// <summary>Keepalive and round trip once connected; also how often the driver repeats the session.</summary>
    public static readonly TimeSpan Ping = TimeSpan.FromSeconds(1);

    public static readonly TimeSpan StunRetry = TimeSpan.FromMilliseconds(500);

    /// <summary>How long STUN may take before the code is made with what answered.</summary>
    public static readonly TimeSpan StunWait = TimeSpan.FromMilliseconds(1500);

    /// <summary>
    /// While a code waits to be pasted, STUN is asked again this often, so the router keeps the
    /// public port the code carries (idle UDP mappings expire in as little as 30 seconds).
    /// </summary>
    public static readonly TimeSpan StunRefresh = TimeSpan.FromSeconds(15);

    /// <summary>A code is good for this long; after it, start again.</summary>
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(10);

    /// <summary>How long the driver probes after pasting the reply before giving up.</summary>
    public static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(30);

    /// <summary>Silence that marks a connected link interrupted.</summary>
    public static readonly TimeSpan Quiet = TimeSpan.FromSeconds(5);

    /// <summary>How long an interrupted link keeps trying before it ends.</summary>
    public static readonly TimeSpan Lost = TimeSpan.FromSeconds(60);

    /// <summary>How the packets travel, judged by the address they arrive from.</summary>
    public static PeerPath PathOf(IPEndPoint remote) =>
        remote.AddressFamily == AddressFamily.InterNetworkV6 ? PeerPath.Ipv6
        : PeerAddresses.IsPrivateIpv4(remote.Address) || IPAddress.IsLoopback(remote.Address) ? PeerPath.LocalNetwork
        : PeerPath.Ipv4;

    /// <summary>What the public addresses STUN reported say about the router.</summary>
    public static PeerReachability ReachabilityOf(IReadOnlyList<IPEndPoint> mapped) => mapped.Count switch
    {
        0 => PeerReachability.LocalOnly,
        1 => PeerReachability.Unknown,
        _ => mapped.All(endpoint => endpoint.Equals(mapped[0])) ? PeerReachability.Open : PeerReachability.Strict,
    };

    /// <summary>
    /// The candidates a code carries, most likely first: the public address STUN saw, then global
    /// IPv6 and private IPv4 addresses on <paramref name="port"/>. Capped at <see cref="PeerCode.MaxCandidates"/>.
    /// </summary>
    public static IReadOnlyList<IPEndPoint> Candidates(IReadOnlyList<IPEndPoint> mapped, IReadOnlyList<IPAddress> local, int port, bool ipv6)
    {
        IEnumerable<IPEndPoint> reflexive = mapped.Distinct().Take(2);
        IEnumerable<IPEndPoint> v6 = ipv6 ? local.Where(PeerAddresses.IsGlobalIpv6).Distinct().Take(2).Select(address => new IPEndPoint(address, port)) : [];
        IEnumerable<IPEndPoint> v4 = local.Where(PeerAddresses.IsPrivateIpv4).Distinct().Take(3).Select(address => new IPEndPoint(address, port));
        return [.. reflexive.Concat(v6).Concat(v4).Take(PeerCode.MaxCandidates)];
    }
}

/// <summary>
/// A live link between two desktops over the internet, with no server in between. The driver's PC
/// sends its telemetry straight to the engineer's.
/// <para>
/// Setting it up: the driver creates an invite code, the engineer pastes it and gets a reply code,
/// the driver pastes that. Each code carries its sender's public key and addresses, so both PCs
/// can then fire packets at each other at once, which opens both routers (UDP hole punching).
/// Packets are sealed with keys only the two codes produce (<see cref="PeerChannel"/>).
/// </para>
/// <para>
/// Threads: commands call <see cref="Invite"/>, <see cref="TryJoin"/>, <see cref="TryComplete"/>
/// and <see cref="Close"/>; the telemetry loop calls <see cref="Update"/> and <see cref="Observe"/>.
/// All of them only queue or set fields. One worker calls <see cref="Step"/>, which owns the
/// socket and every per-link field, and publishes <see cref="State"/>.
/// </para>
/// </summary>
public sealed class PeerLink(OpenPeerSocket open, ResolveStunServers resolveStun, LocalAddresses localAddresses, ILog? log = null)
{
    private const int MaxBufferedSamples = 40;

    private readonly ILog _log = log ?? NullLog.Instance;
    private readonly ConcurrentQueue<Request> _requests = new();
    private readonly Lock _bufferGate = new();
    private readonly List<LiveSample> _buffer = [];
    private readonly LiveSampleGate _gate = new();

    // Written by the telemetry loop, read by the worker.
    private volatile LiveTarget? _target;
    private long _lastFrameTicks;

    // Written by the worker, read by the other threads.
    private volatile PeerLinkState _state = PeerLinkState.Off;
    private volatile bool _sharing;
    private long _inviteLinkId;

    // Worker only. A link exists while it holds a socket; once it failed or ended, only the
    // state it ended in remains, for the page to show until the next start or close.
    private Link? _link;
    private PeerLinkState? _over;

    public PeerLinkState State => this._state;

    /// <summary>Starts a new link as the driver; any current link is closed first.</summary>
    public void Invite() => this._requests.Enqueue(new InviteRequest());

    /// <summary>Starts a new link as the engineer from the driver's pasted invite.</summary>
    public bool TryJoin(string? text, out string error)
    {
        if (!PeerCode.TryParse(text, out PeerCode? code, out error) || code is null)
            return false;
        if (code.Kind != PeerCodeKind.Invite)
        {
            error = "That is a reply code. Paste the invite the driver sent you.";
            return false;
        }

        this._requests.Enqueue(new JoinRequest(code));
        return true;
    }

    /// <summary>Connects the driver's open invite with the engineer's pasted reply.</summary>
    public bool TryComplete(string? text, out string error)
    {
        if (!PeerCode.TryParse(text, out PeerCode? code, out error) || code is null)
            return false;
        if (code.Kind != PeerCodeKind.Reply)
        {
            error = "That is an invite code. Paste the reply your engineer sent back.";
            return false;
        }

        if (this._state.Phase != PeerLinkPhase.Inviting)
        {
            error = "There is no open invite. Create one first.";
            return false;
        }

        if (unchecked((ulong)Interlocked.Read(ref this._inviteLinkId)) != code.LinkId)
        {
            error = "This reply answers a different invite. Send your engineer the current invite.";
            return false;
        }

        this._requests.Enqueue(new CompleteRequest(code));
        return true;
    }

    /// <summary>Ends the link, telling the peer, or clears a failed or ended one.</summary>
    public void Close() => this._requests.Enqueue(new CloseRequest());

    /// <summary>The recorder's open session, every telemetry tick: what the driver is sharing.</summary>
    public void Update(LapHistorySession? openSession)
    {
        LiveTarget? target = openSession is null ? null : LiveUplinkRules.TargetOf(openSession);
        if (this._target?.SessionKey != target?.SessionKey)
            this._gate.Reset();
        if (this._target != target)
            this._target = target;
    }

    /// <summary>A new telemetry frame. Cheap: notes the time and, while sharing, keeps a sample at up to 20 Hz.</summary>
    public void Observe(TelemetryFrame frame)
    {
        Interlocked.Exchange(ref this._lastFrameTicks, frame.Timestamp.UtcTicks);
        if (!this._sharing || this._target is null || !this._gate.Admit(frame.Timestamp))
            return;

        LiveSample sample = LiveSample.FromFrame(frame);
        lock (this._bufferGate)
        {
            if (this._buffer.Count >= MaxBufferedSamples)
                this._buffer.RemoveAt(0);
            this._buffer.Add(sample);
        }
    }

    /// <summary>One worker step at <paramref name="now"/>: applies requests, reads the socket, sends what is due and publishes the state.</summary>
    public void Step(DateTimeOffset now)
    {
        while (this._requests.TryDequeue(out Request? request))
            this.Apply(request, now);

        if (this._link is { } link)
        {
            this.Receive(link, now);
            if (this._link == link)
                this.Advance(link, now);
        }

        this.Share();
        this.Publish();
    }

    /// <summary>Steps every <see cref="PeerLinkRules.Step"/> until <paramref name="stop"/>, then closes the link, telling the peer.</summary>
    public async Task RunAsync(CancellationToken stop)
    {
        using PeriodicTimer timer = new(PeerLinkRules.Step);
        try
        {
            while (await timer.WaitForNextTickAsync(stop).ConfigureAwait(false))
            {
                try
                {
                    this.Step(DateTimeOffset.UtcNow);
                }
                catch (Exception ex)
                {
                    this._log.Warn("Live link step failed", ex);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown.
        }

        this.Shut();
        this.Publish();
    }

    private void Apply(Request request, DateTimeOffset now)
    {
        switch (request)
        {
            case InviteRequest:
                this.Shut();
                this.Start(PeerRole.Driver, BinaryPrimitives.ReadUInt64BigEndian(RandomNumberGenerator.GetBytes(8)), invite: null, now);
                break;
            case JoinRequest join:
                this.Shut();
                this.Start(PeerRole.Engineer, join.Invite.LinkId, join.Invite, now);
                break;
            case CompleteRequest complete when this._link is { Role: PeerRole.Driver, Phase: PeerLinkPhase.Inviting } link && link.Id == complete.Reply.LinkId:
                link.Channel = link.Keys.Agree(complete.Reply.PublicKey, link.Id, PeerRole.Driver);
                link.PeerCandidates = complete.Reply.Candidates;
                link.Enter(PeerLinkPhase.Connecting, now);
                break;
            case CloseRequest:
                this.Shut();
                break;
        }
    }

    private void Start(PeerRole role, ulong id, PeerCode? invite, DateTimeOffset now)
    {
        IPeerSocket socket;
        try
        {
            socket = open();
        }
        catch (SocketException ex)
        {
            this._log.Warn("Live link could not open a UDP socket", ex);
            this._over = new PeerLinkState
            {
                Phase = PeerLinkPhase.Failed,
                Role = role,
                Detail = "Sprint could not open a network port for the link. Check your firewall and try again.",
            };
            return;
        }

        Link link = new(role, id, socket, now) { StunLookup = resolveStun(CancellationToken.None) };
        if (invite is not null)
        {
            link.Channel = link.Keys.Agree(invite.PublicKey, id, PeerRole.Engineer);
            link.PeerCandidates = invite.Candidates;
        }

        this._link = link;
    }

    /// <summary>Closes the current link: a bye to the peer if one could be reached, then the socket goes.</summary>
    private void Shut()
    {
        if (this._link is { Channel: not null } link)
        {
            // Three times: it is UDP, and a missed bye leaves the peer waiting out the silence.
            foreach (IPEndPoint to in link.Targets())
            {
                for (int attempt = 0; attempt < 3; attempt++)
                    this.Send(link, new PeerBye(), to);
            }
        }

        this._link?.Release();
        this._link = null;
        this._over = null;
    }

    /// <summary>Fails or ends the link: the socket and keys go, the state it ended in stays.</summary>
    private void End(Link link, PeerLinkPhase phase, string detail)
    {
        this._over = this.Snapshot(link) with
        {
            Phase = phase,
            Code = null,
            Health = null,
            Session = null,
            Latest = null,
            Detail = detail,
        };
        link.Release();
        this._link = null;
    }

    private void Receive(Link link, DateTimeOffset now)
    {
        while (link.Socket.TryReceive(out PeerDatagram datagram))
        {
            if (Stun.IsMessage(datagram.Data))
            {
                link.AcceptStun(datagram.Data);
                continue;
            }

            if (link.Channel is null || !link.Channel.TryOpen(datagram.Data, out byte[] plaintext, out ulong counter))
                continue;
            if (PeerMessage.Deserialize(plaintext) is not { } message)
                continue;

            this.Heard(link, datagram.From, counter, now);
            this.Handle(link, message, datagram, now);
            if (this._link != link)
                return;
        }
    }

    private void Heard(Link link, IPEndPoint from, ulong counter, DateTimeOffset now)
    {
        // The newest authenticated packet says where the peer is now, so a router that moves the
        // peer to another port mid-session is followed rather than lost.
        link.Remote = from;
        link.LastHeard = now;
        link.Received++;
        link.NewestCounter = counter;
        if (link.Phase is PeerLinkPhase.Joining or PeerLinkPhase.Connecting or PeerLinkPhase.Interrupted)
        {
            if (link.Phase != PeerLinkPhase.Interrupted)
                this._log.Info($"Live link connected as {link.Role}, path {PeerLinkRules.PathOf(from)}");
            link.Enter(PeerLinkPhase.Connected, now);
            link.StartWindow(now, counter);
            link.LastPing = DateTimeOffset.MinValue;
        }
    }

    private void Handle(Link link, PeerMessage message, PeerDatagram datagram, DateTimeOffset now)
    {
        switch (message)
        {
            case PeerPing ping:
                long held = Math.Max(0, (long)(now - datagram.ReceivedAt).TotalMilliseconds);
                this.Send(link, new PeerPong(ping.Sent, held), datagram.From);
                break;
            case PeerPong pong:
                // Network time only: from sending the ping to this pong's arrival, less the time
                // the ping waited for the peer's next step.
                long roundTrip = datagram.ReceivedAt.ToUnixTimeMilliseconds() - pong.Sent - pong.Held;
                if (roundTrip is >= 0 and < 60_000)
                    link.RoundTripMs = (int)roundTrip;
                break;
            case PeerSessionMessage session when link.Role == PeerRole.Engineer:
                link.Session = session.Session;
                break;
            case PeerSampleMessage sample when link.Role == PeerRole.Engineer:
                link.Latest = sample.Sample;
                link.Samples++;
                break;
            case PeerBye:
                this.End(
                    link,
                    PeerLinkPhase.Ended,
                    link.Role == PeerRole.Driver ? "Your engineer disconnected." : "The driver ended the link.");
                break;
        }
    }

    private void Advance(Link link, DateTimeOffset now)
    {
        switch (link.Phase)
        {
            case PeerLinkPhase.Preparing:
                this.Prepare(link, now);
                break;
            case PeerLinkPhase.Inviting or PeerLinkPhase.Joining:
                if (now - link.CodeMadeAt > PeerLinkRules.CodeLifetime)
                {
                    this.End(link, PeerLinkPhase.Failed, "The codes expired before you connected. Start again with a new invite.");
                    break;
                }

                link.RefreshStun(now);
                if (link.Phase == PeerLinkPhase.Joining)
                    this.ProbeAll(link, now, PeerLinkRules.Probe);
                break;
            case PeerLinkPhase.Connecting:
                if (now - link.PhaseSince > PeerLinkRules.ConnectTimeout)
                {
                    this._log.Info($"Live link found no direct path (reachability {link.Reachability})");
                    this.End(
                        link,
                        PeerLinkPhase.Failed,
                        "No direct path between your PCs. One of your networks blocks it, or the reply went stale. Try again with fresh codes.");
                    break;
                }

                this.ProbeAll(link, now, PeerLinkRules.Probe);
                break;
            case PeerLinkPhase.Connected:
                if (now - link.LastHeard > PeerLinkRules.Quiet)
                {
                    link.Enter(PeerLinkPhase.Interrupted, now);
                    break;
                }

                this.Stream(link, now);
                break;
            case PeerLinkPhase.Interrupted:
                if (now - link.PhaseSince > PeerLinkRules.Lost)
                {
                    this.End(link, PeerLinkPhase.Ended, "The connection was lost.");
                    break;
                }

                this.ProbeAll(link, now, PeerLinkRules.Ping);
                break;
        }
    }

    /// <summary>Samples are taken only while a driver's link is connected; otherwise any taken are dropped.</summary>
    private void Share()
    {
        this._sharing = this._link is { Role: PeerRole.Driver, Phase: PeerLinkPhase.Connected };
        if (!this._sharing)
        {
            lock (this._bufferGate)
                this._buffer.Clear();
        }
    }

    private void Prepare(Link link, DateTimeOffset now)
    {
        if (!link.StunAsked)
        {
            if (link.StunLookup.IsCompleted)
                link.AskStun(link.StunLookup.IsCompletedSuccessfully ? link.StunLookup.Result : [], now);
            else if (now - link.PhaseSince > PeerLinkRules.StunWait * 2)
                link.AskStun([], now);
            return;
        }

        if (!link.StunSettled(now))
        {
            link.RetryStun(now);
            return;
        }

        link.Reachability = PeerLinkRules.ReachabilityOf(link.Mapped);
        IReadOnlyList<IPEndPoint> candidates = PeerLinkRules.Candidates(link.Mapped, localAddresses(), link.Socket.Port, link.Socket.SupportsIpv6);
        PeerCodeKind kind = link.Role == PeerRole.Driver ? PeerCodeKind.Invite : PeerCodeKind.Reply;
        link.Code = new PeerCode(kind, link.Id, link.Keys.PublicKey, candidates).ToString();
        link.CodeMadeAt = now;
        if (link.Role == PeerRole.Driver)
            Interlocked.Exchange(ref this._inviteLinkId, unchecked((long)link.Id));
        link.Enter(link.Role == PeerRole.Driver ? PeerLinkPhase.Inviting : PeerLinkPhase.Joining, now);
    }

    /// <summary>Pings every place the peer might be, at most once per <paramref name="every"/>.</summary>
    private void ProbeAll(Link link, DateTimeOffset now, TimeSpan every)
    {
        if (now - link.LastProbe < every)
            return;
        link.LastProbe = now;
        foreach (IPEndPoint to in link.Targets())
            this.Send(link, new PeerPing(now.ToUnixTimeMilliseconds()), to);
    }

    /// <summary>Connected: keepalive and stats every second, and on the driver's side the session and the buffered samples.</summary>
    private void Stream(Link link, DateTimeOffset now)
    {
        if (link.Remote is not { } remote)
            return;

        LiveTarget? driving = link.Role == PeerRole.Driver ? this.Driving(now) : null;
        bool second = now - link.LastPing >= PeerLinkRules.Ping;
        if (second)
        {
            link.LastPing = now;
            this.Send(link, new PeerPing(now.ToUnixTimeMilliseconds()), remote);
            link.CloseWindow(now);
        }

        if (link.Role != PeerRole.Driver)
            return;

        if (second || driving != link.Session)
        {
            link.Session = driving;
            this.Send(link, new PeerSessionMessage(driving), remote);
        }

        List<LiveSample> batch;
        lock (this._bufferGate)
        {
            batch = [.. this._buffer];
            this._buffer.Clear();
        }

        foreach (LiveSample sample in batch)
        {
            this.Send(link, new PeerSampleMessage(sample), remote);
            link.Samples++;
        }
    }

    /// <summary>The session being driven: the recorder's open session while frames still arrive.</summary>
    private LiveTarget? Driving(DateTimeOffset now)
    {
        DateTimeOffset lastFrame = new(Interlocked.Read(ref this._lastFrameTicks), TimeSpan.Zero);
        return now - lastFrame <= LiveUplinkRules.Idle ? this._target : null;
    }

    private void Send(Link link, PeerMessage message, IPEndPoint to)
    {
        if (link.Channel is { } channel)
            link.Socket.Send(channel.Seal(PeerMessage.Serialize(message)), to);
    }

    private void Publish() => this._state = this._link is { } link ? this.Snapshot(link) : this._over ?? PeerLinkState.Off;

    private PeerLinkState Snapshot(Link link)
    {
        bool up = link.Phase is PeerLinkPhase.Connected or PeerLinkPhase.Interrupted;
        return new PeerLinkState
        {
            Phase = link.Phase,
            Role = link.Role,
            Code = link.Phase is PeerLinkPhase.Inviting or PeerLinkPhase.Joining ? link.Code : null,
            Reachability = link.Reachability,
            Health = up && link.Remote is { } remote
                ? new PeerLinkHealth(PeerLinkRules.PathOf(remote), link.RoundTripMs, link.SampleRate, link.LossPercent)
                : null,
            Session = up ? link.Session : null,
            Latest = up ? link.Latest : null,
        };
    }

    private abstract record Request;

    private sealed record InviteRequest : Request;

    private sealed record JoinRequest(PeerCode Invite) : Request;

    private sealed record CompleteRequest(PeerCode Reply) : Request;

    private sealed record CloseRequest : Request;

    /// <summary>One link attempt and everything it owns. Touched by the worker only.</summary>
    private sealed class Link
    {
        private readonly Dictionary<string, IPEndPoint> _stunPending = [];
        private IReadOnlyList<IPEndPoint> _stunServers = [];
        private DateTimeOffset _stunAskedAt;
        private DateTimeOffset _stunLastSent;
        private DateTimeOffset _windowStart;
        private ulong _windowCounter;
        private long _windowReceived;
        private long _windowSamples;

        public Link(PeerRole role, ulong id, IPeerSocket socket, DateTimeOffset now)
        {
            this.Role = role;
            this.Id = id;
            this.Socket = socket;
            this.PhaseSince = now;
        }

        public PeerRole Role { get; }

        public ulong Id { get; }

        public PeerKeys Keys { get; } = new();

        public IPeerSocket Socket { get; }

        public PeerLinkPhase Phase { get; private set; } = PeerLinkPhase.Preparing;

        public DateTimeOffset PhaseSince { get; private set; }

        public PeerChannel? Channel { get; set; }

        public IReadOnlyList<IPEndPoint> PeerCandidates { get; set; } = [];

        public IPEndPoint? Remote { get; set; }

        public Task<IReadOnlyList<IPEndPoint>> StunLookup { get; init; } = Task.FromResult<IReadOnlyList<IPEndPoint>>([]);

        public bool StunAsked { get; private set; }

        public List<IPEndPoint> Mapped { get; } = [];

        public PeerReachability Reachability { get; set; } = PeerReachability.Unknown;

        public string? Code { get; set; }

        public DateTimeOffset CodeMadeAt { get; set; }

        public DateTimeOffset LastProbe { get; set; } = DateTimeOffset.MinValue;

        public DateTimeOffset LastPing { get; set; } = DateTimeOffset.MinValue;

        public DateTimeOffset LastHeard { get; set; }

        public long Received { get; set; }

        public ulong NewestCounter { get; set; }

        public long Samples { get; set; }

        public int? RoundTripMs { get; set; }

        public double SampleRate { get; private set; }

        public double? LossPercent { get; private set; }

        public LiveTarget? Session { get; set; }

        public LiveSample? Latest { get; set; }

        public void Enter(PeerLinkPhase phase, DateTimeOffset now)
        {
            this.Phase = phase;
            this.PhaseSince = now;
        }

        public void Release()
        {
            this.Socket.Dispose();
            this.Channel?.Dispose();
            this.Keys.Dispose();
        }

        /// <summary>Where to probe: the last address the peer was heard from, then every candidate in its code.</summary>
        public IEnumerable<IPEndPoint> Targets() =>
            (this.Remote is { } remote ? [remote] : Array.Empty<IPEndPoint>()).Concat(this.PeerCandidates).Distinct();

        public void AskStun(IReadOnlyList<IPEndPoint> servers, DateTimeOffset now)
        {
            this.StunAsked = true;
            this._stunServers = servers;
            this._stunAskedAt = now;
            this.SendStun(servers, now);
        }

        /// <summary>Done once every server answered, or once the wait is over.</summary>
        public bool StunSettled(DateTimeOffset now) => this._stunPending.Count == 0 || now - this._stunAskedAt > PeerLinkRules.StunWait;

        public void RetryStun(DateTimeOffset now)
        {
            if (now - this._stunLastSent < PeerLinkRules.StunRetry)
                return;
            List<IPEndPoint> unanswered = [.. this._stunPending.Values];
            this._stunPending.Clear();
            this.SendStun(unanswered, now);
        }

        /// <summary>Keeps the router's mapping for this socket alive while a code waits to be pasted.</summary>
        public void RefreshStun(DateTimeOffset now)
        {
            if (now - this._stunLastSent < PeerLinkRules.StunRefresh)
                return;
            this._stunPending.Clear();
            this.SendStun(this._stunServers, now);
        }

        /// <summary>Records a STUN answer to one of this link's questions. Answers after the code was made only kept the mapping alive.</summary>
        public void AcceptStun(byte[] datagram)
        {
            string transaction = Convert.ToHexString(Stun.TransactionId(datagram));
            if (!this._stunPending.Remove(transaction) || this.Code is not null)
                return;
            if (Stun.TryParseBindingSuccess(datagram, out IPEndPoint? mapped) && mapped is not null)
                this.Mapped.Add(mapped);
        }

        public void StartWindow(DateTimeOffset now, ulong counter)
        {
            this._windowStart = now;
            this._windowCounter = counter;
            this._windowReceived = this.Received;
            this._windowSamples = this.Samples;
        }

        /// <summary>Turns the last second's counts into a sample rate and, from the peer's packet counters, a loss.</summary>
        public void CloseWindow(DateTimeOffset now)
        {
            double seconds = (now - this._windowStart).TotalSeconds;
            if (seconds > 0)
                this.SampleRate = Math.Round((this.Samples - this._windowSamples) / seconds, 1);
            ulong expected = this.NewestCounter - this._windowCounter;
            long received = this.Received - this._windowReceived;
            this.LossPercent = expected > 0 ? Math.Round(Math.Max(0, (double)expected - received) * 100 / expected, 1) : null;
            this.StartWindow(now, this.NewestCounter);
        }

        private void SendStun(IReadOnlyList<IPEndPoint> servers, DateTimeOffset now)
        {
            this._stunLastSent = now;
            foreach (IPEndPoint server in servers)
            {
                byte[] request = Stun.BindingRequest(out byte[] transaction);
                this._stunPending[Convert.ToHexString(transaction)] = server;
                this.Socket.Send(request, server);
            }
        }
    }
}
