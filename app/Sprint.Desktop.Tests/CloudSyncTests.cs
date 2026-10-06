using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Keeping this PC and a Sprint server in step: what gets uploaded, what comes down, which side
/// wins, and when a local session may go away. The server is a fake that stores what it is sent.
/// </summary>
public sealed class CloudSyncTests : IDisposable
{
    private const string Account = "http://localhost:8080|ada@sprint.gg";
    private readonly string _root = Path.Combine(Path.GetTempPath(), "sprint-cloud-sync-" + Guid.NewGuid().ToString("N"));
    private readonly FakeServer _server = new();

    public CloudSyncTests() => Directory.CreateDirectory(this._root);

    public void Dispose() => Directory.Delete(this._root, recursive: true);

    [Fact]
    public async Task EverythingIsUploadedOnceAndAnUnchangedItemIsNotSentAgain()
    {
        FakeLocal local = new(Session("s1", ended: true), Dash("d1", "Race"), Setup("p1", "Monza"));
        CloudSync sync = this.Sync(local);

        SyncReport first = await sync.PushAsync(this._server.Client(), Account, removeUploadedSessions: false);
        SyncReport second = await sync.PushAsync(this._server.Client(), Account, removeUploadedSessions: false);

        Assert.Equal(3, first.Uploaded);
        Assert.Equal(0, second.Uploaded);
        Assert.Equal(3, this._server.Count);
    }

    [Fact]
    public async Task AChangedItemReplacesItsCopyOnTheServerInsteadOfAddingOne()
    {
        FakeLocal local = new(Dash("d1", "Race"));
        CloudSync sync = this.Sync(local);
        await sync.PushAsync(this._server.Client(), Account, removeUploadedSessions: false);

        local.Put(Dash("d1", "Race v2"));
        SyncReport report = await sync.PushAsync(this._server.Client(), Account, removeUploadedSessions: false);

        Assert.Equal(1, report.Uploaded);
        Assert.Equal(1, this._server.Count);
        Assert.Contains("Race v2", this._server.Single().Data, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PullingOnASecondPcBringsDownWhatTheFirstUploaded()
    {
        await this.Sync(new FakeLocal(Session("s1", ended: true), Dash("d1", "Race"))).PushAsync(this._server.Client(), Account, removeUploadedSessions: false);
        FakeLocal secondPc = new();

        SyncReport report = await new CloudSync(secondPc, new CloudSyncLedger(Path.Combine(this._root, "second-pc"))).PullAsync(this._server.Client(), Account);

        Assert.Equal(2, report.Downloaded);
        Assert.Equal(["d1", "s1"], secondPc.Ids());
    }

    [Fact]
    public async Task WhenBothSidesChangedTheSameItemThisPcKeepsItsOwnVersion()
    {
        FakeLocal local = new(Dash("d1", "Mine"));
        CloudSync sync = this.Sync(local);
        await sync.PushAsync(this._server.Client(), Account, removeUploadedSessions: false);
        local.Put(Dash("d1", "Mine, edited here"));
        this._server.EditSingle(Dash("d1", "Edited on the web").Json);

        SyncReport report = await sync.PullAsync(this._server.Client(), Account);

        Assert.Equal(1, report.Conflicts);
        Assert.Contains("edited here", local.Json("d1"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task AChangeMadeOnlyOnTheWebComesDown()
    {
        FakeLocal local = new(Dash("d1", "Mine"));
        CloudSync sync = this.Sync(local);
        await sync.PushAsync(this._server.Client(), Account, removeUploadedSessions: false);
        this._server.EditSingle(Dash("d1", "Edited on the web").Json);

        SyncReport report = await sync.PullAsync(this._server.Client(), Account);

        Assert.Equal(1, report.Downloaded);
        Assert.Contains("Edited on the web", local.Json("d1"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task WebOnlyRemovesFinishedSessionsFromThisPcOnceTheyAreUploaded()
    {
        FakeLocal local = new(Session("done", ended: true), Session("live", ended: false), Dash("d1", "Race"));

        SyncReport report = await this.Sync(local).PushAsync(this._server.Client(), Account, removeUploadedSessions: true);

        Assert.Equal(1, report.RemovedLocally);
        // The running session is still being recorded, and dashes are needed to drive.
        Assert.Equal(["d1", "live"], local.Ids());
    }

    [Fact]
    public async Task NothingIsRemovedLocallyWhenTheUploadFails()
    {
        FakeLocal local = new(Session("done", ended: true));
        this._server.Fail = true;

        SyncReport report = await this.Sync(local).PushAsync(this._server.Client(), Account, removeUploadedSessions: true);

        Assert.False(report.Ok);
        Assert.Equal(["done"], local.Ids());
    }

    [Fact]
    public async Task ADifferentAccountStartsFromScratchInsteadOfOverwritingTheFirstOnesCopies()
    {
        FakeLocal local = new(Dash("d1", "Race"));
        CloudSync sync = this.Sync(local);
        await sync.PushAsync(this._server.Client(), Account, removeUploadedSessions: false);

        SyncReport other = await sync.PushAsync(this._server.Client(), "http://localhost:8080|bob@sprint.gg", removeUploadedSessions: false);

        Assert.Equal(1, other.Uploaded);
        Assert.Equal(2, this._server.Count);
    }

    private CloudSync Sync(FakeLocal local) => new(local, new CloudSyncLedger(this._root));

    private static SyncItem Session(string id, bool ended) => new(
        SyncKind.Session,
        id,
        id,
        $$"""{"id":"{{id}}","laps":[1,2,3]}""",
        new SyncSessionInfo("Le Mans Ultimate", "Spa", "Porsche 963", "Practice", new DateTimeOffset(2026, 10, 1, 18, 0, 0, TimeSpan.Zero), ended));

    private static SyncItem Dash(string id, string name) => new(SyncKind.Dash, id, name, $$"""{"id":"{{id}}","name":"{{name}}"}""", null);

    private static SyncItem Setup(string id, string name) => new(SyncKind.Setup, id, name, $$"""{"id":"{{id}}","name":"{{name}}"}""", null);

    /// <summary>This PC's sessions, setups and dashes, in memory.</summary>
    private sealed class FakeLocal(params SyncItem[] items) : ICloudSyncLocal
    {
        private readonly Dictionary<string, SyncItem> _items = items.ToDictionary(item => item.Id);

        public IReadOnlyList<SyncItem> Items() => [.. this._items.Values];

        public void Write(SyncKind kind, string json)
        {
            string id = JsonNode.Parse(json)?["id"]?.GetValue<string>() ?? throw new InvalidOperationException("no id");
            SyncSessionInfo? session = kind == SyncKind.Session
                ? new SyncSessionInfo("", "", "", "", DateTimeOffset.UnixEpoch, true)
                : null;
            this._items[id] = new SyncItem(kind, id, id, json, session);
        }

        public void DeleteSession(string id) => this._items.Remove(id);

        public void Put(SyncItem item) => this._items[item.Id] = item;

        public string Json(string id) => this._items[id].Json;

        public string[] Ids() => [.. this._items.Keys.Order(StringComparer.Ordinal)];
    }

    /// <summary>Stores what the save mutations send and lists it back, like the Sprint API.</summary>
    private sealed class FakeServer : HttpMessageHandler
    {
        private readonly Dictionary<string, (string Field, JsonObject Row)> _rows = [];
        private int _next;

        public bool Fail { get; set; }

        public int Count => this._rows.Count;

        public HttpClient Http() => new(this, disposeHandler: false) { BaseAddress = new Uri("http://localhost:8080/") };

        public SprintCloudClient Client() => new(this.Http(), () => "token");

        public (string Id, string Data) Single()
        {
            KeyValuePair<string, (string Field, JsonObject Row)> row = Assert.Single(this._rows);
            return (row.Key, row.Value.Row["data"]?.GetValue<string>() ?? "");
        }

        public void EditSingle(string data) => Assert.Single(this._rows).Value.Row["data"] = data;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (this.Fail)
                throw new HttpRequestException("Connection refused");
            string body = request.Content is null ? "{}" : await request.Content.ReadAsStringAsync(cancellationToken);
            JsonObject call = JsonNode.Parse(body)?.AsObject() ?? [];
            string query = call["query"]?.GetValue<string>() ?? "";
            JsonObject? input = call["variables"]?["i"]?.AsObject();
            JsonNode? answer = query switch
            {
                _ when query.Contains("saveSession(", StringComparison.Ordinal) => this.Save("sessions", input),
                _ when query.Contains("saveSetup(", StringComparison.Ordinal) => this.Save("setups", input),
                _ when query.Contains("saveLayout(", StringComparison.Ordinal) => this.Save("layouts", input),
                _ => this.List(query.Trim('{', '}').Split('{')[0]),
            };
            string field = query.Contains("save", StringComparison.Ordinal) ? query.Split('{')[1].Split('(')[0] : query.Trim('{', '}').Split('{')[0];
            JsonObject response = new() { ["data"] = new JsonObject { [field] = answer } };
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(response.ToJsonString(), Encoding.UTF8, "application/json") };
        }

        private JsonObject Save(string field, JsonObject? input)
        {
            string id = input?["id"]?.GetValue<string>() is { Length: > 0 } given && this._rows.ContainsKey(given) ? given : $"r{++this._next}";
            JsonObject row = (JsonObject)(input?.DeepClone() ?? new JsonObject());
            row["id"] = id;
            this._rows[id] = (field, row);
            return new JsonObject { ["id"] = id };
        }

        private JsonArray List(string field) =>
            [.. this._rows.Values.Where(row => row.Field == field).Select(row => row.Row.DeepClone())];
    }
}
