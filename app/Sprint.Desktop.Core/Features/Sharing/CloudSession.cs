using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>What is persisted about a signed-in cloud session.</summary>
public sealed class CloudSessionState
{
    /// <summary>Where the Sprint API lives. Self-hosted, so this is a setting, not a constant.</summary>
    [JsonPropertyName("serverUrl")]
    public string ServerUrl { get; set; } = "";

    [JsonPropertyName("token")]
    public string Token { get; set; } = "";

    [JsonPropertyName("email")]
    public string Email { get; set; } = "";

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = "";
}

/// <summary>
/// The signed-in cloud session, persisted between runs (#197).
/// <para>
/// Kept in its own file rather than in <c>settings.json</c>: settings get copied between
/// machines and pasted into bug reports, and a bearer token has no business travelling with
/// them.
/// </para>
/// <para>
/// <b>Known limitation:</b> the token is stored in plaintext. Sprint has no credential store,
/// and adding one — DPAPI on Windows, something else everywhere else — is its own piece of
/// work. Anyone with read access to the user's AppData can use this token until it expires.
/// </para>
/// </summary>
public sealed class CloudSession
{
    private const string FileName = "cloud-session.json";

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    private readonly string _path;
    private readonly ILog _log;

    public CloudSession(string dataRoot, ILog? log = null)
    {
        ArgumentException.ThrowIfNullOrEmpty(dataRoot);
        _path = Path.Combine(dataRoot, FileName);
        _log = log ?? NullLog.Instance;
        State = Load();
    }

    public CloudSessionState State { get; private set; }

    public bool IsSignedIn => State.Token.Length > 0 && State.ServerUrl.Length > 0;

    /// <summary>How the driver is credited on a lap they share.</summary>
    public string Attribution => State.DisplayName is { Length: > 0 } name ? name : "Unknown driver";

    public void SignIn(string serverUrl, string token, string email)
    {
        State.ServerUrl = serverUrl.TrimEnd('/');
        State.Token = token;
        State.Email = email;
        Save();
    }

    public void SetDisplayName(string displayName)
    {
        State.DisplayName = displayName;
        Save();
    }

    /// <summary>Forgets the token. The file is removed rather than blanked.</summary>
    public void SignOut()
    {
        State = new CloudSessionState { ServerUrl = State.ServerUrl };
        try
        {
            if (File.Exists(_path))
            {
                File.Delete(_path);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Warn("Could not remove the stored cloud session", ex);
        }

        Save();
    }

    private CloudSessionState Load()
    {
        try
        {
            return File.Exists(_path)
                ? JsonSerializer.Deserialize<CloudSessionState>(File.ReadAllText(_path), Json) ?? new()
                : new();
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // A corrupt session file means signed out, never a failure to start.
            _log.Warn("Ignoring an unreadable cloud session file", ex);
            return new();
        }
    }

    private void Save()
    {
        try
        {
            File.WriteAllText(_path, JsonSerializer.Serialize(State, Json));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Warn("Could not persist the cloud session", ex);
        }
    }
}
