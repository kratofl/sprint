using System.Text.Json;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>
/// The notes the driver left on laps in Analysis, per lap-history session and lap number. Only
/// their own: notes that came with a shared lap stay on its record
/// (<see cref="LapHistoryRecord.Notes"/>) and are read-only.
/// <para>
/// Kept apart from the session files on purpose, like <c>RunSetups</c>: the recorder rewrites the
/// session it is filling on every lap from its own copy, which would drop a note written while
/// that session is still being driven. One small file under the data folder.
/// </para>
/// </summary>
public sealed class LapNotes
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _path;
    private readonly ILog _log;
    private readonly Func<DateTimeOffset> _clock;
    private readonly Func<string> _idFactory;
    private readonly Lock _gate = new();
    private Dictionary<string, Dictionary<int, List<LapNote>>>? _sessions;

    public LapNotes(string path, ILog? log = null, Func<DateTimeOffset>? clock = null, Func<string>? idFactory = null)
    {
        this._path = path ?? throw new ArgumentNullException(nameof(path));
        this._log = log ?? NullLog.Instance;
        this._clock = clock ?? (() => DateTimeOffset.UtcNow);
        this._idFactory = idFactory ?? (() => Guid.NewGuid().ToString("N"));
    }

    /// <summary>One lap's notes, in the order they were written.</summary>
    public IReadOnlyList<LapNote> For(string sessionId, int lapNumber)
    {
        lock (this._gate)
        {
            return this.Sessions().TryGetValue(sessionId, out Dictionary<int, List<LapNote>>? laps)
                && laps.TryGetValue(lapNumber, out List<LapNote>? notes)
                ? [.. notes]
                : [];
        }
    }

    /// <summary>Files a new note on a lap. The caller has checked the lap, the place and the text.</summary>
    public LapNote Add(string sessionId, int lapNumber, double distanceMeters, string text, string author)
    {
        lock (this._gate)
        {
            Dictionary<string, Dictionary<int, List<LapNote>>> sessions = this.Sessions();
            if (!sessions.TryGetValue(sessionId, out Dictionary<int, List<LapNote>>? laps))
            {
                laps = [];
                sessions[sessionId] = laps;
            }

            if (!laps.TryGetValue(lapNumber, out List<LapNote>? notes))
            {
                notes = [];
                laps[lapNumber] = notes;
            }

            LapNote note = new(this._idFactory(), distanceMeters, text, author, this._clock());
            notes.Add(note);
            this.Write(sessions);
            return note;
        }
    }

    /// <summary>Rewrites one note's text, keeping its place, author and time. False when there is no such note.</summary>
    public bool Update(string sessionId, int lapNumber, string noteId, string text)
    {
        lock (this._gate)
        {
            Dictionary<string, Dictionary<int, List<LapNote>>> sessions = this.Sessions();
            if (Find(sessions, sessionId, lapNumber) is not { } notes)
            {
                return false;
            }

            int index = notes.FindIndex(note => note.Id == noteId);
            if (index < 0)
            {
                return false;
            }

            notes[index] = notes[index] with { Text = text };
            this.Write(sessions);
            return true;
        }
    }

    /// <summary>Removes one note. False when there is no such note.</summary>
    public bool Delete(string sessionId, int lapNumber, string noteId)
    {
        lock (this._gate)
        {
            Dictionary<string, Dictionary<int, List<LapNote>>> sessions = this.Sessions();
            if (Find(sessions, sessionId, lapNumber) is not { } notes || notes.RemoveAll(note => note.Id == noteId) == 0)
            {
                return false;
            }

            if (notes.Count == 0 && sessions.TryGetValue(sessionId, out Dictionary<int, List<LapNote>>? laps))
            {
                laps.Remove(lapNumber);
                if (laps.Count == 0)
                {
                    sessions.Remove(sessionId);
                }
            }

            this.Write(sessions);
            return true;
        }
    }

    private static List<LapNote>? Find(Dictionary<string, Dictionary<int, List<LapNote>>> sessions, string sessionId, int lapNumber) =>
        sessions.TryGetValue(sessionId, out Dictionary<int, List<LapNote>>? laps) && laps.TryGetValue(lapNumber, out List<LapNote>? notes)
            ? notes
            : null;

    private Dictionary<string, Dictionary<int, List<LapNote>>> Sessions()
    {
        if (this._sessions is not null)
        {
            return this._sessions;
        }

        this._sessions = new(StringComparer.Ordinal);
        if (!File.Exists(this._path))
        {
            return this._sessions;
        }

        try
        {
            using FileStream stream = File.OpenRead(this._path);
            if (JsonSerializer.Deserialize<Dictionary<string, Dictionary<int, List<LapNote>>>>(stream, JsonOptions) is { } stored)
            {
                foreach ((string session, Dictionary<int, List<LapNote>> laps) in stored)
                {
                    this._sessions[session] = laps;
                }
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            // Unreadable notes cost the driver their notes, never the page.
            this._log.Warn($"Could not read the lap notes at {this._path}", ex);
        }

        return this._sessions;
    }

    private void Write(Dictionary<string, Dictionary<int, List<LapNote>>> sessions)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(this._path) ?? ".");
            AtomicFile.Write(this._path, stream => JsonSerializer.Serialize(stream, sessions, JsonOptions));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            this._log.Error($"Failed to save the lap notes at {this._path}", ex);
        }
    }
}
