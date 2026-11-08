using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Setup;

/// <summary>
/// The setup version a run was driven with, as the driver said. <paramref name="SnapshotId"/> is
/// a stored version (<see cref="SetupSnapshot.Id"/>); the name is kept beside it so a lap list can
/// say which setup without reading the setup store. A version's name never changes — the name is
/// part of what the id digests.
/// </summary>
/// <param name="SetupId">The setup's id in the Setups list (<see cref="SetupListItem.Id"/>), stable while the file stays where it is.</param>
public sealed record RunSetup(
    [property: JsonPropertyName("snapshotId")] string SnapshotId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("setupId")] string SetupId);

/// <summary>
/// Which setup each run was driven with, per lap-history session and outing
/// (<see cref="SessionPlanning.LapHistoryRecord.Outing"/>; 0 for laps without one). Only ever
/// what the driver picked: the game does not say which setup is loaded, and Sprint does not guess.
/// <para>
/// Kept apart from the session files on purpose: the recorder rewrites the session it is filling
/// on every lap from its own copy, which would drop a setup picked while that session is still
/// being driven. One small file under the data folder.
/// </para>
/// </summary>
public sealed class RunSetups
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _path;
    private readonly ILog _log;
    private readonly Lock _gate = new();
    private Dictionary<string, Dictionary<int, RunSetup>>? _sessions;

    public RunSetups(string path, ILog? log = null)
    {
        this._path = path ?? throw new ArgumentNullException(nameof(path));
        this._log = log ?? NullLog.Instance;
    }

    /// <summary>The setups picked for one session's runs, by outing.</summary>
    public IReadOnlyDictionary<int, RunSetup> For(string sessionId)
    {
        lock (this._gate)
        {
            return this.Sessions().TryGetValue(sessionId, out Dictionary<int, RunSetup>? runs)
                ? new Dictionary<int, RunSetup>(runs)
                : new Dictionary<int, RunSetup>();
        }
    }

    /// <summary>Every pick, by session and outing.</summary>
    public IReadOnlyDictionary<string, IReadOnlyDictionary<int, RunSetup>> All()
    {
        lock (this._gate)
        {
            return this.Sessions().ToDictionary(
                entry => entry.Key,
                entry => (IReadOnlyDictionary<int, RunSetup>)new Dictionary<int, RunSetup>(entry.Value),
                StringComparer.Ordinal);
        }
    }

    /// <summary>Puts a setup on one run, or takes it off with null.</summary>
    public void Set(string sessionId, int outing, RunSetup? setup)
    {
        lock (this._gate)
        {
            Dictionary<string, Dictionary<int, RunSetup>> sessions = this.Sessions();
            if (setup is not null)
            {
                if (!sessions.TryGetValue(sessionId, out Dictionary<int, RunSetup>? runs))
                {
                    runs = [];
                    sessions[sessionId] = runs;
                }

                runs[outing] = setup;
            }
            else if (sessions.TryGetValue(sessionId, out Dictionary<int, RunSetup>? runs) && runs.Remove(outing) && runs.Count == 0)
            {
                sessions.Remove(sessionId);
            }

            this.Write(sessions);
        }
    }

    private Dictionary<string, Dictionary<int, RunSetup>> Sessions()
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
            if (JsonSerializer.Deserialize<Dictionary<string, Dictionary<int, RunSetup>>>(stream, JsonOptions) is { } stored)
            {
                foreach ((string session, Dictionary<int, RunSetup> runs) in stored)
                {
                    this._sessions[session] = runs;
                }
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            // Unreadable picks cost the driver their picks, never the page.
            this._log.Warn($"Could not read the run setups at {this._path}", ex);
        }

        return this._sessions;
    }

    private void Write(Dictionary<string, Dictionary<int, RunSetup>> sessions)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(this._path) ?? ".");
            AtomicFile.Write(this._path, stream => JsonSerializer.Serialize(stream, sessions, JsonOptions));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            this._log.Error($"Failed to save the run setups at {this._path}", ex);
        }
    }
}
