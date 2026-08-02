using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Desktop-local <see cref="ILapHistoryStore"/>: one JSON file per history session under
/// <c>%AppData%/Sprint/lap-history/</c>. One file per session keeps each write proportional
/// to the session being driven rather than to the whole corpus, and isolates a corrupt file
/// to the laps it holds instead of every lap the driver has ever turned.
/// </summary>
public sealed class LocalLapHistoryStore : ILapHistoryStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string _root;
    private readonly ILog _log;

    public LocalLapHistoryStore(string? dataRoot = null, ILog? log = null)
    {
        _root = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint",
            "lap-history");
        _log = log ?? NullLog.Instance;
        Directory.CreateDirectory(_root);
    }

    public IReadOnlyList<LapHistorySession> LoadAll()
    {
        var sessions = new List<LapHistorySession>();
        foreach (var file in Directory.EnumerateFiles(_root, "*.json"))
        {
            if (Load(file) is { Id.Length: > 0 } session)
            {
                sessions.Add(session);
            }
        }

        return sessions;
    }

    /// <summary>
    /// Reads only each file's <c>context</c> object, skipping the laps as raw tokens. The laps
    /// carry a 201-point reference curve each, so materialising them to answer "which tracks
    /// have I driven" costs orders of magnitude more than the answer is worth.
    /// </summary>
    public IReadOnlyList<LapHistoryContext> LoadContexts()
    {
        var contexts = new List<LapHistoryContext>();
        foreach (var file in Directory.EnumerateFiles(_root, "*.json"))
        {
            if (ReadContext(file) is { } context)
            {
                contexts.Add(context);
            }
        }

        return contexts;
    }

    private LapHistoryContext? ReadContext(string path)
    {
        try
        {
            var bytes = File.ReadAllBytes(path);
            var reader = new Utf8JsonReader(bytes);

            // Walk the top level only: step into the context object when it appears and skip
            // every other value wholesale, so the lap array is never turned into objects.
            while (reader.Read())
            {
                if (reader.TokenType != JsonTokenType.PropertyName || reader.CurrentDepth != 1)
                {
                    continue;
                }

                var isContext = reader.ValueTextEquals("context");
                reader.Read();
                if (isContext)
                {
                    return JsonSerializer.Deserialize<LapHistoryContext>(ref reader, JsonOptions);
                }

                reader.Skip();
            }

            return null;
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            _log.Warn($"Ignoring unreadable lap-history file at {path}", ex);
            return null;
        }
    }

    public void Save(LapHistorySession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        if (string.IsNullOrEmpty(session.Id))
        {
            throw new ArgumentException(
                "A history session must have an id before it can be saved.",
                nameof(session));
        }

        WriteJson(SessionPath(session.Id), session);
    }

    public void Delete(string sessionId)
    {
        if (string.IsNullOrEmpty(sessionId))
        {
            return;
        }

        try
        {
            var path = SessionPath(sessionId);
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception ex)
        {
            _log.Warn($"Failed to delete lap-history session '{sessionId}'", ex);
        }
    }

    private LapHistorySession? Load(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            return JsonSerializer.Deserialize<LapHistorySession>(stream, JsonOptions);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // One unreadable file must not cost the driver the rest of the corpus every
            // estimate rests on; skip it and leave a breadcrumb.
            _log.Warn($"Ignoring unreadable lap-history file at {path}", ex);
            return null;
        }
    }

    private string SessionPath(string sessionId) =>
        Path.Combine(_root, SafeFileName(sessionId) + ".json");

    private void WriteJson<T>(string path, T value)
    {
        try
        {
            using var stream = File.Create(path);
            JsonSerializer.Serialize(stream, value, JsonOptions);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Error($"Failed to persist lap-history file at {path}", ex);
        }
    }

    // Ids are generated, but an imported or synced id could carry separators.
    private static string SafeFileName(string sessionId)
    {
        Span<char> buffer = stackalloc char[sessionId.Length];
        for (var i = 0; i < sessionId.Length; i++)
        {
            var c = sessionId[i];
            buffer[i] = Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 ? '_' : c;
        }

        return new string(buffer);
    }
}
