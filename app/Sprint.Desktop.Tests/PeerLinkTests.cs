using System.Buffers.Binary;
using System.Net;
using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Peer;
using Sprint.Desktop.Features.PitWall;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The live link between a driver's and an engineer's desktop: the code exchange, connecting,
/// streaming, and how it ends. The network is a fake that delivers datagrams between sockets by
/// address and answers STUN like a public server would; time is passed in.
/// </summary>
public sealed class PeerLinkTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 22, 18, 0, 0, TimeSpan.Zero);
    private static readonly IPEndPoint DriverPublic = IPEndPoint.Parse("198.51.100.10:40001");
    private static readonly IPEndPoint EngineerPublic = IPEndPoint.Parse("203.0.113.20:40002");

    private readonly FakeNet _net;
    private readonly PeerLink _driver;
    private readonly PeerLink _engineer;
    private DateTimeOffset _now = T0;
    private PitWallShare? _offer;
    private readonly List<bool> _asks = [];

    public PeerLinkTests()
    {
        this._net = new FakeNet(() => this._now);
        this._driver = new PeerLink(() => this._net.Open(DriverPublic), this._net.ResolveStun, () => [], share: (_, sharing) =>
        {
            this._asks.Add(sharing);
            return this._offer;
        });
        this._engineer = new PeerLink(() => this._net.Open(EngineerPublic), this._net.ResolveStun, () => []);
    }

    [Fact]
    public void ADriverAndAnEngineerConnectByTradingTwoCodes()
    {
        this.Connect();

        Assert.Equal(PeerLinkPhase.Connected, this._driver.State.Phase);
        Assert.Equal(PeerLinkPhase.Connected, this._engineer.State.Phase);
        Assert.Equal(PeerRole.Driver, this._driver.State.Role);
        Assert.Equal(PeerRole.Engineer, this._engineer.State.Role);
        Assert.Equal(PeerPath.Ipv4, this._engineer.State.Health?.Path);
        Assert.Equal(PeerReachability.Open, this._driver.State.Reachability);
        Assert.Null(this._driver.State.Code);
    }

    [Fact]
    public void EachSideKnowsTheOthersSprintOnceConnected()
    {
        this.Connect();
        this.Run(TimeSpan.FromSeconds(1));

        PeerBuild same = PeerBuild.Of(PeerLinkRules.Level, BuildInfo.Version);
        Assert.Equal(PeerBuildMatch.Same, same.Match);
        Assert.Equal(same, this._driver.State.Peer);
        Assert.Equal(same, this._engineer.State.Peer);
    }

    [Fact]
    public void APingFromABuildBeforeLevelsReadsAsAnOlderSprint()
    {
        PeerPing old = Assert.IsType<PeerPing>(PeerMessage.Deserialize("""{"type":"ping","sent":5}"""u8));

        Assert.Equal(new PeerBuild(null, PeerBuildMatch.PeerOlder), PeerBuild.Of(old.Level, old.App));
        Assert.Equal(new PeerBuild("0.9.0", PeerBuildMatch.PeerNewer), PeerBuild.Of(PeerLinkRules.Level + 1, "0.9.0+abc123"));
        // The peer writes the version: one that is long or holds control characters is not shown.
        Assert.Null(PeerBuild.Of(PeerLinkRules.Level, new string('9', 40)).App);
        Assert.Null(PeerBuild.Of(PeerLinkRules.Level, "1.0\u001b[2J").App);
    }

    [Fact]
    public void TheEngineerSeesTheSessionAndTheNewestSample()
    {
        this.Connect();
        this._driver.Update(Session("s1"));
        for (int index = 0; index < 20; index++)
        {
            this._driver.Observe(Frame(this._now, lap: 4));
            this.Run(TimeSpan.FromMilliseconds(50));
        }

        this.Run(TimeSpan.FromSeconds(1));

        PeerLinkState engineer = this._engineer.State;
        Assert.Equal("Spa", engineer.Session?.Track);
        Assert.Equal(4, engineer.Latest?.Lap);
        Assert.Equal(180, engineer.Latest?.SpeedKph ?? 0, precision: 3);
        Assert.Equal("Spa", this._driver.State.Session?.Track);
        // The fake network is instant: what remains of the round trip is nothing, not the steps' waiting.
        Assert.Equal(0, engineer.Health?.RoundTripMs);
    }

    [Fact]
    public void TheEngineersPitWallFillsFromTheDriversBoardRadarPlanAndTarget()
    {
        PitWallTrace target = new(7, 124.5, [0, 0.5, 1], [80, 250, 90], [0, 1, 0.2], [1, 0, 0], [0, 0.1, 0]);
        this._offer = new PitWallShare("p1", "Spa 6 Hours", """{"id":"p1","name":"Spa 6 Hours","status":"Tracking"}""", target);
        this.Connect();
        this._driver.Update(Session("s1"));
        for (int index = 0; index < 40; index++)
        {
            this._driver.Observe(BoardFrame(this._now));
            this.Run(TimeSpan.FromMilliseconds(50));
        }

        PitWallState wall = this._engineer.State.PitWall ?? throw new InvalidOperationException("no board arrived");

        Assert.Equal("Spa", wall.Session.Track);
        Assert.Equal(new[] { 1, 2 }, wall.Field.Select(car => car.Place));
        Assert.Equal("Medium", wall.Field[0].Compound);
        Assert.Equal(2, Assert.Single(wall.Radar).Id);
        Assert.Equal("Spa 6 Hours", wall.Plan?.GetProperty("name").GetString());
        PitWallTrace shared = this._engineer.Trace(PitWallTraceLap.Target);
        Assert.Equal(7, shared.Lap);
        Assert.Equal(124.5, shared.LapTime);
        Assert.Equal(new double[] { 80, 250, 90 }, shared.Speed);
        Assert.Equal(new PeerSharedPlan("p1", "Spa 6 Hours"), this._driver.State.SharedPlan);
        Assert.True(this._driver.State.SharingPlan);
        Assert.Null(this._driver.State.PitWall);
    }

    [Fact]
    public void ADriverWhoStopsSharingTakesThePlanOffThePitWall()
    {
        this._offer = new PitWallShare("p1", "Spa 6 Hours", """{"id":"p1"}""", null);
        this.Connect();
        this._driver.Observe(BoardFrame(this._now));
        this.Run(TimeSpan.FromSeconds(2));
        Assert.Equal(JsonValueKind.Object, this._engineer.State.PitWall?.Plan?.ValueKind);

        this._driver.SetSharePlan(false);
        this._driver.Observe(BoardFrame(this._now));
        this.Run(TimeSpan.FromSeconds(1));

        Assert.Null(this._engineer.State.PitWall?.Plan);
        Assert.False(this._driver.State.SharingPlan);
        Assert.Equal(PitWallTrace.Empty, this._engineer.Trace(PitWallTraceLap.Target));
    }

    [Fact]
    public void SwitchingSharingOnAsksForTheFullOfferAtOnce()
    {
        this._offer = new PitWallShare("p1", "Spa 6 Hours", """{"id":"p1"}""", null);
        this._driver.SetSharePlan(false);
        this.Connect();
        this.Run(TimeSpan.FromSeconds(2));
        // Off, the plan is still asked for (the Live link page names it), but never for sharing.
        Assert.NotEmpty(this._asks);
        Assert.DoesNotContain(true, this._asks);
        Assert.Equal(new PeerSharedPlan("p1", "Spa 6 Hours"), this._driver.State.SharedPlan);

        this._asks.Clear();
        this._driver.SetSharePlan(true);
        this.Run(TimeSpan.FromMilliseconds(50));

        Assert.Equal(new[] { true }, this._asks);
    }

    [Fact]
    public void NothingIsSharedWhileTheDriverIsNotOnTrack()
    {
        this.Connect();
        this._driver.Observe(Frame(this._now, lap: 1));

        this.Run(TimeSpan.FromSeconds(2));

        Assert.Null(this._engineer.State.Session);
        Assert.Null(this._engineer.State.Latest);
    }

    [Fact]
    public void AReplyMustAnswerTheInviteThatIsOpen()
    {
        this._driver.Invite();
        this.Run(TimeSpan.FromSeconds(2));
        string invite = this.CodeOf(this._driver);

        Assert.False(this._driver.TryComplete(invite, out string wrongKind));
        Assert.Contains("invite code", wrongKind, StringComparison.Ordinal);

        Assert.True(this._engineer.TryJoin(invite, out _));
        this.Run(TimeSpan.FromSeconds(2));
        string reply = this.CodeOf(this._engineer);
        this._driver.Invite();
        this.Run(TimeSpan.FromSeconds(2));

        Assert.False(this._driver.TryComplete(reply, out string stale));
        Assert.Contains("different invite", stale, StringComparison.Ordinal);
    }

    [Fact]
    public void WithoutADirectPathTheDriverGivesUpAfterThirtySeconds()
    {
        this._net.Blocked = true;
        this.Trade();

        this.Run(TimeSpan.FromSeconds(29));
        Assert.Equal(PeerLinkPhase.Connecting, this._driver.State.Phase);

        this.Run(TimeSpan.FromSeconds(2));
        Assert.Equal(PeerLinkPhase.Failed, this._driver.State.Phase);
        Assert.Contains("No direct path", this._driver.State.Detail, StringComparison.Ordinal);
        Assert.Equal(PeerLinkPhase.Joining, this._engineer.State.Phase);
    }

    [Fact]
    public void ALinkThatGoesQuietIsInterruptedThenEndsAndComesBackIfThePathDoes()
    {
        this.Connect();
        this._net.Blocked = true;

        this.Run(TimeSpan.FromSeconds(6));
        Assert.Equal(PeerLinkPhase.Interrupted, this._engineer.State.Phase);

        this._net.Blocked = false;
        this.Run(TimeSpan.FromSeconds(2));
        Assert.Equal(PeerLinkPhase.Connected, this._engineer.State.Phase);

        this._net.Blocked = true;
        this.Run(TimeSpan.FromSeconds(70));
        Assert.Equal(PeerLinkPhase.Ended, this._engineer.State.Phase);
        Assert.Equal("The connection was lost.", this._engineer.State.Detail);
    }

    [Fact]
    public void ClosingTellsThePeerAndFreesTheSocket()
    {
        this.Connect();

        this._driver.Close();
        this.Run(TimeSpan.FromMilliseconds(200));

        Assert.Equal(PeerLinkPhase.Off, this._driver.State.Phase);
        Assert.Equal(PeerLinkPhase.Ended, this._engineer.State.Phase);
        Assert.Equal("The driver ended the link.", this._engineer.State.Detail);
        Assert.All(this._net.Sockets, socket => Assert.True(socket.Disposed));

        this._engineer.Close();
        this.Run(TimeSpan.FromMilliseconds(100));
        Assert.Equal(PeerLinkPhase.Off, this._engineer.State.Phase);
    }

    [Fact]
    public void AnUnansweredInviteExpires()
    {
        this._driver.Invite();

        this.Run(TimeSpan.FromMinutes(11));

        Assert.Equal(PeerLinkPhase.Failed, this._driver.State.Phase);
        Assert.Contains("expired", this._driver.State.Detail, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(new[] { "198.51.100.10:40001", "198.51.100.10:40001" }, PeerReachability.Open)]
    [InlineData(new[] { "198.51.100.10:40001", "198.51.100.10:40999" }, PeerReachability.Strict)]
    [InlineData(new[] { "198.51.100.10:40001" }, PeerReachability.Unknown)]
    [InlineData(new string[0], PeerReachability.LocalOnly)]
    public void TwoStunAnswersTellWhetherTheRouterKeepsItsPort(string[] mapped, PeerReachability expected) =>
        Assert.Equal(expected, PeerLinkRules.ReachabilityOf([.. mapped.Select(IPEndPoint.Parse)]));

    [Fact]
    public void ACodeListsThePublicAddressFirstThenIpv6ThenTheLocalNetwork()
    {
        IPAddress[] local = [IPAddress.Parse("192.168.1.20"), IPAddress.Parse("2001:db8::7"), IPAddress.Parse("fe80::1"), IPAddress.Parse("127.0.0.1")];

        IReadOnlyList<IPEndPoint> candidates = PeerLinkRules.Candidates([DriverPublic, DriverPublic], local, 40001, ipv6: true);

        Assert.Equal([DriverPublic, IPEndPoint.Parse("[2001:db8::7]:40001"), IPEndPoint.Parse("192.168.1.20:40001")], candidates);
    }

    [Theory]
    [InlineData("192.168.1.20:5000", PeerPath.LocalNetwork)]
    [InlineData("10.0.0.2:5000", PeerPath.LocalNetwork)]
    [InlineData("203.0.113.20:5000", PeerPath.Ipv4)]
    [InlineData("[2001:db8::7]:5000", PeerPath.Ipv6)]
    public void ThePathIsJudgedByWhereThePacketsComeFrom(string remote, PeerPath expected) =>
        Assert.Equal(expected, PeerLinkRules.PathOf(IPEndPoint.Parse(remote)));

    [Fact]
    public async Task TwoLinksConnectOverRealUdpSocketsOnThisMachine()
    {
        using LoopbackStun stun = new();
        PeerLink driver = new(UdpPeerSocket.Open, stun.Resolve, () => []);
        PeerLink engineer = new(UdpPeerSocket.Open, stun.Resolve, () => []);
        try
        {
            driver.Invite();
            string invite = await Until(driver, engineer, () => driver.State.Code);
            Assert.True(engineer.TryJoin(invite, out _));
            string reply = await Until(driver, engineer, () => engineer.State.Code);
            Assert.True(driver.TryComplete(reply, out _));

            await Until(driver, engineer, () => driver.State.Phase == PeerLinkPhase.Connected && engineer.State.Phase == PeerLinkPhase.Connected ? "up" : null);

            Assert.Equal(PeerPath.LocalNetwork, engineer.State.Health?.Path);
        }
        finally
        {
            driver.Close();
            engineer.Close();
            driver.Step(DateTimeOffset.UtcNow);
            engineer.Step(DateTimeOffset.UtcNow);
        }
    }

    /// <summary>Steps both real links on the real clock until <paramref name="value"/> has an answer, for at most five seconds.</summary>
    private static async Task<string> Until(PeerLink driver, PeerLink engineer, Func<string?> value)
    {
        DateTimeOffset deadline = DateTimeOffset.UtcNow.AddSeconds(5);
        while (DateTimeOffset.UtcNow < deadline)
        {
            driver.Step(DateTimeOffset.UtcNow);
            engineer.Step(DateTimeOffset.UtcNow);
            if (value() is { } found)
                return found;
            await Task.Delay(20);
        }

        throw new TimeoutException($"Gave up waiting: driver {driver.State.Phase}, engineer {engineer.State.Phase}.");
    }

    /// <summary>Invite, join and complete, then step until both are connected.</summary>
    private void Connect()
    {
        this.Trade();
        this.Run(TimeSpan.FromSeconds(1));
    }

    private void Trade()
    {
        this._driver.Invite();
        this.Run(TimeSpan.FromSeconds(2));
        Assert.True(this._engineer.TryJoin(this.CodeOf(this._driver), out string joinError), joinError);
        this.Run(TimeSpan.FromSeconds(2));
        Assert.True(this._driver.TryComplete(this.CodeOf(this._engineer), out string completeError), completeError);
        this.Run(TimeSpan.FromMilliseconds(100));
    }

    private string CodeOf(PeerLink link) => link.State.Code ?? throw new InvalidOperationException($"No code yet: {link.State.Phase}");

    /// <summary>Steps both links every 50 ms for <paramref name="duration"/>.</summary>
    private void Run(TimeSpan duration)
    {
        DateTimeOffset end = this._now + duration;
        while (this._now < end)
        {
            this._now += PeerLinkRules.Step;
            this._driver.Step(this._now);
            this._engineer.Step(this._now);
        }
    }

    private static TelemetryFrame Frame(DateTimeOffset at, int lap) => new()
    {
        Timestamp = at,
        Lap = new LapState { CurrentLap = lap },
        Car = new CarState { SpeedMetersPerSecond = 50 },
    };

    /// <summary>The driver in a race at Spa with one car alongside.</summary>
    private static TelemetryFrame BoardFrame(DateTimeOffset at) => new()
    {
        Timestamp = at,
        Session = new SessionInfo { Track = "Spa", SessionType = SessionType.Race, TrackLengthMeters = 7004, InCar = true },
        Car = new CarState { Pose = new CarPose() },
        Field =
        [
            new FieldCar { Id = 2, Driver = "R. Lindqvist", Place = 2, PositionX = 3, PositionZ = -1, Compound = "Medium" },
            new FieldCar { Id = 1, Driver = "E. Varga", Place = 1, IsPlayer = true, Compound = "Medium" },
        ],
    };

    private static LapHistorySession Session(string id) => new()
    {
        Id = id,
        Context = new LapHistoryContext { Game = "Le Mans Ultimate", TrackCourse = "Spa", CarModel = "Porsche 963" },
        Kind = HistorySessionKind.Race,
    };

    /// <summary>A Binding success answer telling <paramref name="transactionId"/>'s sender it is at <paramref name="mapped"/> (IPv4).</summary>
    private static byte[] StunAnswer(ReadOnlySpan<byte> transactionId, IPEndPoint mapped)
    {
        byte[] answer = new byte[32];
        BinaryPrimitives.WriteUInt16BigEndian(answer, 0x0101);
        BinaryPrimitives.WriteUInt16BigEndian(answer.AsSpan(2), 12);
        BinaryPrimitives.WriteUInt32BigEndian(answer.AsSpan(4), 0x2112A442);
        transactionId.CopyTo(answer.AsSpan(8));
        BinaryPrimitives.WriteUInt16BigEndian(answer.AsSpan(20), 0x0020);
        BinaryPrimitives.WriteUInt16BigEndian(answer.AsSpan(22), 8);
        answer[25] = 0x01;
        BinaryPrimitives.WriteUInt16BigEndian(answer.AsSpan(26), (ushort)(mapped.Port ^ 0x2112));
        BinaryPrimitives.WriteUInt32BigEndian(answer.AsSpan(28), BinaryPrimitives.ReadUInt32BigEndian(mapped.Address.GetAddressBytes()) ^ 0x2112A442);
        return answer;
    }

    /// <summary>
    /// The internet, minus the routers: every socket is reachable at its public address unless
    /// <see cref="Blocked"/>, and two STUN servers answer with the sender's address.
    /// </summary>
    private sealed class FakeNet(Func<DateTimeOffset> now)
    {
        private static readonly IPEndPoint[] StunServers = [IPEndPoint.Parse("192.0.2.1:3478"), IPEndPoint.Parse("192.0.2.2:3478")];
        private readonly Dictionary<IPEndPoint, FakeSocket> _bound = [];

        public bool Blocked { get; set; }

        /// <summary>Delivery is instant, so a datagram arrives at the sender's time.</summary>
        public Func<DateTimeOffset> Now { get; } = now;

        public List<FakeSocket> Sockets { get; } = [];

        public IPeerSocket Open(IPEndPoint at)
        {
            FakeSocket socket = new(this, at);
            this._bound[at] = socket;
            this.Sockets.Add(socket);
            return socket;
        }

        public Task<IReadOnlyList<IPEndPoint>> ResolveStun(CancellationToken ct) => Task.FromResult<IReadOnlyList<IPEndPoint>>(StunServers);

        public void Deliver(byte[] datagram, IPEndPoint from, IPEndPoint to)
        {
            if (StunServers.Contains(to) && Stun.IsMessage(datagram))
            {
                this._bound[from].Inbox.Enqueue(new PeerDatagram(StunAnswer(Stun.TransactionId(datagram), from), to, this.Now()));
                return;
            }

            if (!this.Blocked && this._bound.TryGetValue(to, out FakeSocket? socket) && !socket.Disposed)
                socket.Inbox.Enqueue(new PeerDatagram(datagram, from, this.Now()));
        }
    }

    private sealed class FakeSocket(FakeNet net, IPEndPoint at) : IPeerSocket
    {
        public Queue<PeerDatagram> Inbox { get; } = new();

        public bool Disposed { get; private set; }

        public int Port => at.Port;

        public bool SupportsIpv6 => true;

        public void Send(byte[] datagram, IPEndPoint to)
        {
            if (!this.Disposed)
                net.Deliver(datagram, at, to);
        }

        public bool TryReceive(out PeerDatagram datagram) => this.Inbox.TryDequeue(out datagram);

        public void Dispose() => this.Disposed = true;
    }

    /// <summary>A STUN server on 127.0.0.1 that tells each asker its own address, for the real-socket test.</summary>
    private sealed class LoopbackStun : IDisposable
    {
        private readonly System.Net.Sockets.UdpClient _udp = new(new IPEndPoint(IPAddress.Loopback, 0));
        private readonly CancellationTokenSource _stop = new();

        public LoopbackStun() => _ = this.ServeAsync();

        public Task<IReadOnlyList<IPEndPoint>> Resolve(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<IPEndPoint>>(this._udp.Client.LocalEndPoint is IPEndPoint local ? [local] : []);

        public void Dispose()
        {
            this._stop.Cancel();
            this._udp.Dispose();
        }

        private async Task ServeAsync()
        {
            try
            {
                while (!this._stop.IsCancellationRequested)
                {
                    System.Net.Sockets.UdpReceiveResult request = await this._udp.ReceiveAsync(this._stop.Token);
                    if (Stun.IsMessage(request.Buffer))
                        await this._udp.SendAsync(StunAnswer(Stun.TransactionId(request.Buffer), request.RemoteEndPoint), request.RemoteEndPoint, this._stop.Token);
                }
            }
            catch (Exception ex) when (ex is OperationCanceledException or ObjectDisposedException or System.Net.Sockets.SocketException)
            {
                // Stopped.
            }
        }
    }
}
