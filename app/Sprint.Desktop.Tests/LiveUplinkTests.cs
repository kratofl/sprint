using Sprint.Contracts;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Sharing;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Streaming the session being driven to the signed-in Sprint server: when it streams, how much,
/// and what happens when the game, the account or the connection goes away. The WebSocket is a
/// fake that records what it is sent; time is passed in.
/// </summary>
public sealed class LiveUplinkTests
{
    private static readonly CloudCredentials Ada = new("http://localhost:8080", "tok");
    private static readonly DateTimeOffset T0 = new(2026, 10, 12, 18, 0, 0, TimeSpan.Zero);
    private readonly List<FakeConnection> _connections = [];
    private readonly LiveUplink _uplink;
    private bool _serverDown;

    public LiveUplinkTests() => this._uplink = new LiveUplink(this.Connect);

    [Theory]
    [InlineData(true, CloudStorageMode.Both, true)]
    [InlineData(true, CloudStorageMode.Remote, true)]
    [InlineData(true, CloudStorageMode.Local, false)]
    [InlineData(false, CloudStorageMode.Both, false)]
    public void ItStreamsOnlyWhenSignedInAndDataIsKeptOnTheServer(bool signedIn, CloudStorageMode storage, bool expected) =>
        Assert.Equal(expected, LiveUplinkRules.Enabled(signedIn, storage));

    [Theory]
    [InlineData("http://localhost:8080", "ws://localhost:8080/api/live/ingest")]
    [InlineData("https://sprint.example/", "wss://sprint.example/api/live/ingest")]
    [InlineData("https://example.com/sprint", "wss://example.com/sprint/api/live/ingest")]
    public void TheIngestAddressIsTheServersOwnWithAWebSocketScheme(string server, string expected) =>
        Assert.Equal(new Uri(expected), LiveUplinkRules.IngestUri(server));

    [Fact]
    public void ReconnectsBackOffUpToThirtySeconds() =>
        Assert.Equal(
            [1, 2, 4, 8, 16, 30, 30],
            Enumerable.Range(1, 7).Select(failures => LiveUplinkRules.Backoff(failures).TotalSeconds));

    [Theory]
    [InlineData(60, 20)]
    [InlineData(30, 20)]
    [InlineData(10, 10)]
    public void AtMostTwentySamplesASecondAreTaken(int gameHz, int expected)
    {
        LiveSampleGate gate = new();

        int taken = Enumerable.Range(0, gameHz).Count(index => gate.Admit(T0.AddMilliseconds(index * 1000.0 / gameHz)));

        Assert.Equal(expected, taken);
    }

    [Fact]
    public void MessagesGoOutWithTheTypeTheServerDispatchesOn()
    {
        Assert.Equal(
            """{"type":"start","sessionKey":"s1","game":"LMU","track":"Spa","car":"963","sessionType":"Race"}""",
            WebSocketLiveConnection.Serialize(new LiveStartMessage { SessionKey = "s1", Game = "LMU", Track = "Spa", Car = "963", SessionType = "Race" }));
        Assert.Equal("""{"type":"end"}""", WebSocketLiveConnection.Serialize(new LiveEndMessage()));
        Assert.StartsWith("""{"type":"samples","samples":[{"timestamp":""", WebSocketLiveConnection.Serialize(new LiveSamplesMessage { Samples = [new LiveSample()] }), StringComparison.Ordinal);
    }

    [Fact]
    public async Task TheSessionBeingDrivenIsStartedAndItsSamplesFollowInBatches()
    {
        this.Drive(Session("s1"), at: 0);
        await this._uplink.StepAsync(T0.AddMilliseconds(10));
        this.Frames(from: 100, count: 3);

        await this._uplink.StepAsync(T0.AddMilliseconds(260));

        FakeConnection connection = Assert.Single(this._connections);
        LiveStartMessage start = Assert.IsType<LiveStartMessage>(connection.Sent[0]);
        Assert.Equal(new LiveStartMessage { SessionKey = "s1", Game = "Le Mans Ultimate", Track = "Spa", Car = "Porsche 963", SessionType = "Practice" }, start);
        Assert.Equal(3, Assert.IsType<LiveSamplesMessage>(connection.Sent[1]).Samples.Count);
        Assert.Equal(LiveUplinkStatus.Streaming, this._uplink.Status);
    }

    [Fact]
    public async Task NothingConnectsUntilAGameDeliversFrames()
    {
        this._uplink.Update(Ada, CloudStorageMode.Both, Session("s1"));

        await this._uplink.StepAsync(T0);

        Assert.Empty(this._connections);
        Assert.Equal(LiveUplinkStatus.WaitingForGame, this._uplink.Status);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SigningOutOrKeepingDataLocalEndsTheSessionAndCloses(bool signOut)
    {
        await this.Streaming("s1");

        this._uplink.Update(signOut ? null : Ada, signOut ? CloudStorageMode.Both : CloudStorageMode.Local, Session("s1"));
        await this._uplink.StepAsync(T0.AddMilliseconds(300));

        FakeConnection connection = Assert.Single(this._connections);
        Assert.IsType<LiveEndMessage>(connection.Sent[^1]);
        Assert.True(connection.Disposed);
        Assert.Equal(LiveUplinkStatus.Off, this._uplink.Status);
    }

    [Fact]
    public async Task WhenTheGameStopsDeliveringFramesTheSessionEnds()
    {
        await this.Streaming("s1");

        await this._uplink.StepAsync(T0.AddSeconds(15));

        FakeConnection connection = Assert.Single(this._connections);
        Assert.IsType<LiveEndMessage>(connection.Sent[^1]);
        Assert.True(connection.Disposed);
        Assert.Equal(LiveUplinkStatus.WaitingForGame, this._uplink.Status);
    }

    [Fact]
    public async Task ANewSessionIsStartedOnTheSameConnection()
    {
        await this.Streaming("s1");

        this.Drive(Session("s2"), at: 300);
        await this._uplink.StepAsync(T0.AddMilliseconds(400));

        FakeConnection connection = Assert.Single(this._connections);
        Assert.Equal("s2", Assert.IsType<LiveStartMessage>(connection.Sent[^1]).SessionKey);
    }

    [Fact]
    public async Task ADroppedConnectionDropsSamplesAndReconnectsAfterABackoff()
    {
        await this.Streaming("s1");
        this._connections[0].Broken = true;
        this.Frames(from: 300, count: 1);
        await this._uplink.StepAsync(T0.AddMilliseconds(400));
        Assert.Equal(LiveUplinkStatus.Reconnecting, this._uplink.Status);

        // Frames while disconnected are dropped, not queued for later.
        this.Frames(from: 500, count: 5);
        await this._uplink.StepAsync(T0.AddMilliseconds(900));
        Assert.Single(this._connections);

        await this._uplink.StepAsync(T0.AddMilliseconds(1500));
        this.Frames(from: 1550, count: 2);
        await this._uplink.StepAsync(T0.AddMilliseconds(1700));

        FakeConnection again = this._connections[1];
        Assert.Equal("s1", Assert.IsType<LiveStartMessage>(again.Sent[0]).SessionKey);
        Assert.Equal([2], again.Sent.OfType<LiveSamplesMessage>().Select(batch => batch.Samples.Count));
        Assert.Equal(LiveUplinkStatus.Streaming, this._uplink.Status);
    }

    [Fact]
    public async Task AnUnreachableServerIsRetriedWithoutBlockingTheGame()
    {
        this._serverDown = true;
        this.Drive(Session("s1"), at: 0);

        await this._uplink.StepAsync(T0.AddMilliseconds(10));
        this.Frames(from: 50, count: 3);

        Assert.Empty(this._connections);
        Assert.Equal(LiveUplinkStatus.Reconnecting, this._uplink.Status);
        Assert.False(string.IsNullOrEmpty(this._uplink.Detail));
    }

    private async Task Streaming(string sessionKey)
    {
        this.Drive(Session(sessionKey), at: 0);
        await this._uplink.StepAsync(T0.AddMilliseconds(10));
        this.Frames(from: 100, count: 2);
        await this._uplink.StepAsync(T0.AddMilliseconds(200));
        Assert.Equal(LiveUplinkStatus.Streaming, this._uplink.Status);
    }

    /// <summary>Signed in with data on the server, driving <paramref name="session"/>, one frame at <paramref name="at"/> ms.</summary>
    private void Drive(LapHistorySession session, int at)
    {
        this._uplink.Update(Ada, CloudStorageMode.Both, session);
        this._uplink.Observe(Frame(at));
    }

    /// <summary><paramref name="count"/> frames 50 ms apart from <paramref name="from"/> ms on: all under the 20 Hz cap.</summary>
    private void Frames(int from, int count)
    {
        for (int index = 0; index < count; index++)
            this._uplink.Observe(Frame(from + (index * 50)));
    }

    private static TelemetryFrame Frame(int at) => new() { Timestamp = T0.AddMilliseconds(at) };

    private static LapHistorySession Session(string id) => new()
    {
        Id = id,
        Context = new LapHistoryContext { Game = "Le Mans Ultimate", TrackCourse = "Spa", CarModel = "Porsche 963" },
        Kind = HistorySessionKind.Practice,
    };

    private Task<ILiveConnection> Connect(Uri ingest, string token, CancellationToken ct)
    {
        Assert.Equal(new Uri("ws://localhost:8080/api/live/ingest"), ingest);
        Assert.Equal("tok", token);
        if (this._serverDown)
            throw new LiveConnectionException("Could not reach Sprint web.");
        FakeConnection connection = new();
        this._connections.Add(connection);
        return Task.FromResult<ILiveConnection>(connection);
    }

    private sealed class FakeConnection : ILiveConnection
    {
        public List<LiveIngestMessage> Sent { get; } = [];

        public bool Broken { get; set; }

        public bool Disposed { get; private set; }

        public Task SendAsync(LiveIngestMessage message, CancellationToken ct)
        {
            if (this.Broken)
                throw new LiveConnectionException("The connection to Sprint web dropped.");
            this.Sent.Add(message);
            return Task.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            this.Disposed = true;
            return ValueTask.CompletedTask;
        }
    }
}
