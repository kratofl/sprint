using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// What the startup scan already has an answer for (#185): archive entries the driver has
/// imported, and entries they have declined. Keyed by the entry's id plus its size and
/// last-write stamp — the three things an importer can state <em>without parsing</em>, which
/// is what lets a normal launch open no files at all.
/// <para>
/// Declining is recorded separately from importing. Both silence the prompt, but only one of
/// them means "the corpus has this": a driver who changes their mind must still be able to
/// import a declined archive from the manual entry point.
/// </para>
/// <para>
/// No hashing. A moved or restored folder produces ids the ledger has never seen and costs
/// exactly one re-parse pass; the importer's natural key is what stops that pass writing a
/// duplicate.
/// </para>
/// </summary>
public sealed class ResultsImportLedger
{
    private const string FileName = "results-import-ledger.json";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string _path;
    private readonly ILog _log;
    private readonly Dictionary<string, LedgerRecord> _records;

    public ResultsImportLedger(string? dataRoot = null, ILog? log = null)
    {
        var root = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint");
        Directory.CreateDirectory(root);
        _path = Path.Combine(root, FileName);
        _log = log ?? NullLog.Instance;
        _records = Load();
    }

    /// <summary>Whether this exact entry has already been answered, either way.</summary>
    public bool IsSettled(ResultsArchiveEntry entry)
    {
        ArgumentNullException.ThrowIfNull(entry);
        return _records.TryGetValue(entry.Id, out var record) && record.Matches(entry);
    }

    /// <summary>Whether this exact entry was imported (as opposed to declined).</summary>
    public bool WasImported(ResultsArchiveEntry entry)
    {
        ArgumentNullException.ThrowIfNull(entry);
        return _records.TryGetValue(entry.Id, out var record)
            && record.Matches(entry)
            && record.Outcome == LedgerOutcome.Imported;
    }

    public void MarkImported(IEnumerable<ResultsArchiveEntry> entries) =>
        Mark(entries, LedgerOutcome.Imported);

    public void MarkDeclined(IEnumerable<ResultsArchiveEntry> entries) =>
        Mark(entries, LedgerOutcome.Declined);

    private void Mark(IEnumerable<ResultsArchiveEntry> entries, LedgerOutcome outcome)
    {
        ArgumentNullException.ThrowIfNull(entries);
        foreach (var entry in entries)
        {
            _records[entry.Id] = new LedgerRecord
            {
                SizeBytes = entry.SizeBytes,
                LastWriteUtc = entry.LastWriteUtc,
                Outcome = outcome,
            };
        }

        Save();
    }

    private Dictionary<string, LedgerRecord> Load()
    {
        if (!File.Exists(_path))
        {
            return new Dictionary<string, LedgerRecord>(StringComparer.Ordinal);
        }

        try
        {
            using var stream = File.OpenRead(_path);
            var loaded = JsonSerializer.Deserialize<Dictionary<string, LedgerRecord>>(stream, JsonOptions);
            return loaded is null
                ? new Dictionary<string, LedgerRecord>(StringComparer.Ordinal)
                : new Dictionary<string, LedgerRecord>(loaded, StringComparer.Ordinal);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // An unreadable ledger costs one re-parse pass and no duplicates; refusing to
            // start, or silently treating everything as imported, would both be worse.
            _log.Warn($"Ignoring unreadable results-import ledger at {_path}", ex);
            return new Dictionary<string, LedgerRecord>(StringComparer.Ordinal);
        }
    }

    private void Save()
    {
        try
        {
            using var stream = File.Create(_path);
            JsonSerializer.Serialize(stream, _records, JsonOptions);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Error($"Failed to persist results-import ledger at {_path}", ex);
        }
    }

    private enum LedgerOutcome
    {
        Imported,
        Declined,
    }

    private sealed class LedgerRecord
    {
        [JsonPropertyName("sizeBytes")]
        public long SizeBytes { get; set; }

        [JsonPropertyName("lastWriteUtc")]
        public DateTimeOffset LastWriteUtc { get; set; }

        [JsonPropertyName("outcome")]
        public LedgerOutcome Outcome { get; set; }

        /// <summary>
        /// Size and stamp both have to match: the sim rewriting a result file in place is a
        /// new archive to import, not the one that was already answered for.
        /// </summary>
        public bool Matches(ResultsArchiveEntry entry) =>
            SizeBytes == entry.SizeBytes && LastWriteUtc == entry.LastWriteUtc;
    }
}
