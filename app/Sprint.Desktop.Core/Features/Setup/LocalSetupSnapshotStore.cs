using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Setup;

/// <summary>
/// Desktop-local <see cref="ISetupSnapshotStore"/>: one JSON file per captured version under
/// <c>%AppData%/Sprint/setup-snapshots/</c>. One file per snapshot keeps a capture proportional
/// to the setup that changed, and isolates a corrupt file to the version it holds.
/// </summary>
/// <remarks>
/// Sprint's own data directory, never the game's — capture reads the sim's folder and writes
/// only here.
/// </remarks>
public sealed class LocalSetupSnapshotStore : ISetupSnapshotStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string _root;
    private readonly ILog _log;

    public LocalSetupSnapshotStore(string? dataRoot = null, ILog? log = null)
    {
        _root = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint",
            "setup-snapshots");
        _log = log ?? NullLog.Instance;
        Directory.CreateDirectory(_root);
    }

    public IReadOnlyList<SetupSnapshot> LoadAll()
    {
        var snapshots = new List<SetupSnapshot>();
        foreach (var file in Directory.EnumerateFiles(_root, "*.json"))
        {
            if (Load(file) is { Id.Length: > 0 } snapshot)
            {
                snapshots.Add(snapshot);
            }
        }

        return snapshots;
    }

    public void Save(SetupSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        if (string.IsNullOrEmpty(snapshot.Id))
        {
            throw new ArgumentException(
                "A setup snapshot must have an id before it can be saved.",
                nameof(snapshot));
        }

        var path = Path.Combine(_root, SafeFileName(snapshot.Id) + ".json");
        try
        {
            AtomicFile.Write(path, stream => JsonSerializer.Serialize(stream, snapshot, JsonOptions));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Error($"Failed to persist setup snapshot at {path}", ex);
        }
    }

    private SetupSnapshot? Load(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            return JsonSerializer.Deserialize<SetupSnapshot>(stream, JsonOptions);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // One unreadable file must not cost the driver the rest of the vault; skip it and
            // leave a breadcrumb.
            _log.Warn($"Ignoring unreadable setup snapshot at {path}", ex);
            return null;
        }
    }

    // Ids are generated from content, but a synced id could carry separators.
    private static string SafeFileName(string id)
    {
        Span<char> buffer = stackalloc char[id.Length];
        for (var i = 0; i < id.Length; i++)
        {
            var c = id[i];
            buffer[i] = Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 ? '_' : c;
        }

        return new string(buffer);
    }
}
