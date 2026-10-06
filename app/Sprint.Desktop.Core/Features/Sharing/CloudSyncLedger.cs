using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>
/// What this PC last exchanged with its Sprint account (<c>cloud-sync.json</c>): for each local
/// item, the server's id for it and a hash of the content both sides agreed on. Comparing a
/// side's current hash with the agreed one tells who changed it since.
/// <para>
/// Scoped to one account: signing in to another account or server starts from an empty ledger,
/// so the first account's copies are never overwritten with the second's ids.
/// </para>
/// </summary>
public sealed class CloudSyncLedger
{
    private const string FileName = "cloud-sync.json";
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    private readonly string _path;
    private readonly ILog _log;
    private LedgerFile _file;

    public CloudSyncLedger(string dataRoot, ILog? log = null)
    {
        Directory.CreateDirectory(dataRoot);
        this._path = Path.Combine(dataRoot, FileName);
        this._log = log ?? NullLog.Instance;
        this._file = this.Load();
    }

    /// <summary>Switches to <paramref name="account"/> (<c>server|email</c>), forgetting everything if it is another one.</summary>
    public void UseAccount(string account)
    {
        if (this._file.Account == account)
            return;
        this._file = new LedgerFile { Account = account };
        this.Save();
    }

    public LedgerEntry? Get(SyncKind kind, string localId) =>
        this._file.Entries.FirstOrDefault(entry => entry.Kind == kind && entry.LocalId == localId);

    public LedgerEntry? FindByRemote(SyncKind kind, string remoteId) =>
        this._file.Entries.FirstOrDefault(entry => entry.Kind == kind && entry.RemoteId == remoteId);

    /// <summary>Records that both sides now hold content with <paramref name="hash"/>, and persists it.</summary>
    public void Set(SyncKind kind, string localId, string remoteId, string hash)
    {
        this._file.Entries.RemoveAll(entry => entry.Kind == kind && entry.LocalId == localId);
        this._file.Entries.Add(new LedgerEntry(kind, localId, remoteId, hash));
        this.Save();
    }

    private LedgerFile Load()
    {
        try
        {
            return File.Exists(this._path)
                ? JsonSerializer.Deserialize<LedgerFile>(File.ReadAllText(this._path), Json) ?? new LedgerFile()
                : new LedgerFile();
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // An unreadable ledger only costs a re-upload: everything reads as never synced.
            this._log.Warn("Ignoring an unreadable cloud sync ledger", ex);
            return new LedgerFile();
        }
    }

    private void Save()
    {
        try
        {
            File.WriteAllText(this._path, JsonSerializer.Serialize(this._file, Json));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            this._log.Warn("Could not persist the cloud sync ledger", ex);
        }
    }

    private sealed class LedgerFile
    {
        [JsonPropertyName("account")]
        public string Account { get; set; } = "";

        [JsonPropertyName("entries")]
        public List<LedgerEntry> Entries { get; set; } = [];
    }
}

/// <summary>One local item's link to its copy on the server.</summary>
public sealed record LedgerEntry(
    [property: JsonPropertyName("kind")] SyncKind Kind,
    [property: JsonPropertyName("localId")] string LocalId,
    [property: JsonPropertyName("remoteId")] string RemoteId,
    [property: JsonPropertyName("hash")] string Hash);
