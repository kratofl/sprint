using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Contracts;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>What kind of thing is synced. Stored by name in the ledger.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<SyncKind>))]
public enum SyncKind
{
    Session,
    Setup,
    Dash,
}

/// <summary>A session's searchable facts, sent beside its payload so the web can list it without parsing it.</summary>
public sealed record SyncSessionInfo(string Game, string Track, string Car, string Type, DateTimeOffset StartedAt, bool Ended);

/// <summary>One local thing that can live on the server: its id, display name and full JSON.</summary>
public sealed record SyncItem(SyncKind Kind, string Id, string Name, string Json, SyncSessionInfo? Session);

/// <summary>What a sync did. <see cref="Error"/> is empty when it finished.</summary>
public sealed record SyncReport(int Uploaded, int Downloaded, int Conflicts, int RemovedLocally, string Error)
{
    public bool Ok => this.Error.Length == 0;

    public static SyncReport Failed(string error) => new(0, 0, 0, 0, error);
}

/// <summary>How far a running sync is, for a progress bar.</summary>
public sealed record SyncProgress(string Direction, int Done, int Total);

/// <summary>This PC's syncable data. The seam between the sync rules and the desktop's stores.</summary>
public interface ICloudSyncLocal
{
    /// <summary>Every local session, setup and dash that may be synced.</summary>
    IReadOnlyList<SyncItem> Items();

    /// <summary>Creates or replaces a local item from JSON downloaded from the server.</summary>
    void Write(SyncKind kind, string json);

    /// <summary>Removes a local session that the server already holds.</summary>
    void DeleteSession(string id);
}

/// <summary>
/// Moves sessions, setups and dashes between this PC and the signed-in Sprint account.
/// <list type="bullet">
/// <item>Push uploads what changed here since the last sync, each item to the same server copy.</item>
/// <item>Pull brings down what is missing here or changed only on the server.</item>
/// <item>When both sides changed an item, this PC keeps its version; the next push sends it.</item>
/// <item>"Web only" removes finished sessions here once the server confirmed holding them.</item>
/// </list>
/// One sync runs at a time; a second request while one runs is turned away.
/// </summary>
public sealed class CloudSync(ICloudSyncLocal local, CloudSyncLedger ledger)
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    /// <summary>The running sync's progress, or null when none runs.</summary>
    public SyncProgress? Progress { get; private set; }

    /// <summary>Uploads everything that changed here. <paramref name="account"/> is <c>server|email</c>.</summary>
    public async Task<SyncReport> PushAsync(SprintCloudClient remote, string account, bool removeUploadedSessions, CancellationToken ct = default)
    {
        if (!await this._gate.WaitAsync(0, ct).ConfigureAwait(false))
            return SyncReport.Failed("A sync is already running.");
        try
        {
            ledger.UseAccount(account);
            List<SyncItem> changed = [.. local.Items().Where(item => ledger.Get(item.Kind, item.Id)?.Hash != Hash(item.Json))];
            int uploaded = 0;
            string error = "";
            this.Progress = new SyncProgress("upload", 0, changed.Count);
            foreach (SyncItem item in changed)
            {
                CloudResult<string> saved = await Upload(remote, item, ledger.Get(item.Kind, item.Id)?.RemoteId, ct).ConfigureAwait(false);
                if (!saved.Ok || saved.Value is null)
                {
                    error = saved.Message;
                    break;
                }

                ledger.Set(item.Kind, item.Id, saved.Value, Hash(item.Json));
                this.Progress = new SyncProgress("upload", ++uploaded, changed.Count);
            }

            int removed = removeUploadedSessions && error.Length == 0 ? this.RemoveUploadedSessions() : 0;
            return new SyncReport(uploaded, 0, 0, removed, error);
        }
        finally
        {
            this.Progress = null;
            this._gate.Release();
        }
    }

    /// <summary>Downloads what is missing here or changed only on the server.</summary>
    public async Task<SyncReport> PullAsync(SprintCloudClient remote, string account, CancellationToken ct = default)
    {
        if (!await this._gate.WaitAsync(0, ct).ConfigureAwait(false))
            return SyncReport.Failed("A sync is already running.");
        try
        {
            ledger.UseAccount(account);
            CloudResult<List<(SyncKind Kind, string RemoteId, string Data)>> listed = await ListRemote(remote, ct).ConfigureAwait(false);
            if (!listed.Ok || listed.Value is null)
                return SyncReport.Failed(listed.Message);

            Dictionary<(SyncKind, string), SyncItem> here = local.Items().ToDictionary(item => (item.Kind, item.Id));
            int downloaded = 0;
            int conflicts = 0;
            int done = 0;
            this.Progress = new SyncProgress("download", 0, listed.Value.Count);
            foreach ((SyncKind kind, string remoteId, string data) in listed.Value)
            {
                this.Progress = new SyncProgress("download", ++done, listed.Value.Count);
                string remoteHash = Hash(data);
                LedgerEntry? entry = ledger.FindByRemote(kind, remoteId);
                string? localId = entry?.LocalId ?? IdOf(data);
                if (localId is null)
                    continue;
                SyncItem? mine = here.GetValueOrDefault((kind, localId));

                if (entry is null)
                {
                    // Never linked. Take it if there is nothing here; otherwise link the two, and
                    // when they differ record the server's content as agreed, so this PC's version
                    // reads as the newer one and the next push replaces the server's copy.
                    if (mine is null)
                    {
                        local.Write(kind, data);
                        downloaded++;
                    }
                    else if (Hash(mine.Json) != remoteHash)
                    {
                        conflicts++;
                    }

                    ledger.Set(kind, localId, remoteId, remoteHash);
                    continue;
                }

                bool remoteChanged = remoteHash != entry.Hash;
                bool localChanged = mine is not null && Hash(mine.Json) != entry.Hash;
                if (mine is null || (remoteChanged && !localChanged))
                {
                    local.Write(kind, data);
                    ledger.Set(kind, localId, remoteId, remoteHash);
                    downloaded++;
                }
                else if (remoteChanged)
                {
                    conflicts++;
                }
            }

            return new SyncReport(0, downloaded, conflicts, 0, "");
        }
        finally
        {
            this.Progress = null;
            this._gate.Release();
        }
    }

    private int RemoveUploadedSessions()
    {
        int removed = 0;
        foreach (SyncItem item in local.Items())
        {
            if (item is { Kind: SyncKind.Session, Session.Ended: true } && ledger.Get(item.Kind, item.Id)?.Hash == Hash(item.Json))
            {
                local.DeleteSession(item.Id);
                removed++;
            }
        }

        return removed;
    }

    private static async Task<CloudResult<string>> Upload(SprintCloudClient remote, SyncItem item, string? remoteId, CancellationToken ct)
    {
        switch (item.Kind)
        {
            case SyncKind.Session:
                SyncSessionInfo info = item.Session ?? new SyncSessionInfo("", "", "", "unknown", DateTimeOffset.UnixEpoch, true);
                CloudResult<SessionSummary> session = await remote.SaveSessionAsync(new SaveSessionInput
                {
                    Id = remoteId, Game = info.Game, Track = info.Track, Car = info.Car, SessionType = info.Type, StartedAt = info.StartedAt, Data = item.Json,
                }, ct).ConfigureAwait(false);
                return IdOf(session, summary => summary.Id);
            case SyncKind.Setup:
                CloudResult<SetupSummary> setup = await remote.SaveSetupAsync(new SaveSetupInput { Id = remoteId, Name = item.Name, Data = item.Json }, ct).ConfigureAwait(false);
                return IdOf(setup, summary => summary.Id);
            default:
                CloudResult<LayoutSummary> layout = await remote.SaveLayoutAsync(new SaveLayoutInput { Id = remoteId, Name = item.Name, Data = item.Json }, ct).ConfigureAwait(false);
                return IdOf(layout, summary => summary.Id);
        }
    }

    private static async Task<CloudResult<List<(SyncKind Kind, string RemoteId, string Data)>>> ListRemote(SprintCloudClient remote, CancellationToken ct)
    {
        CloudResult<List<SessionSummary>> sessions = await remote.SessionsAsync(ct).ConfigureAwait(false);
        if (!sessions.Ok || sessions.Value is null)
            return CloudResult<List<(SyncKind, string, string)>>.Failed(sessions.Failure, sessions.Message);
        CloudResult<List<SetupSummary>> setups = await remote.SetupsAsync(ct).ConfigureAwait(false);
        if (!setups.Ok || setups.Value is null)
            return CloudResult<List<(SyncKind, string, string)>>.Failed(setups.Failure, setups.Message);
        CloudResult<List<LayoutSummary>> layouts = await remote.LayoutsAsync(ct).ConfigureAwait(false);
        if (!layouts.Ok || layouts.Value is null)
            return CloudResult<List<(SyncKind, string, string)>>.Failed(layouts.Failure, layouts.Message);

        return CloudResult<List<(SyncKind, string, string)>>.Success(
        [
            .. sessions.Value.Select(row => (SyncKind.Session, row.Id, row.Data)),
            .. setups.Value.Select(row => (SyncKind.Setup, row.Id, row.Data)),
            .. layouts.Value.Select(row => (SyncKind.Dash, row.Id, row.Data)),
        ]);
    }

    private static CloudResult<string> IdOf<T>(CloudResult<T> result, Func<T, string> id) =>
        result.Ok && result.Value is { } value
            ? CloudResult<string>.Success(id(value))
            : CloudResult<string>.Failed(result.Failure, result.Message);

    /// <summary>The local id inside a payload this PC uploaded, or null for something it cannot place.</summary>
    private static string? IdOf(string data)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(data);
            return document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty("id", out JsonElement id)
                && id.ValueKind == JsonValueKind.String
                && id.GetString() is { Length: > 0 } value
                ? value
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Hash(string json) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json)));
}
