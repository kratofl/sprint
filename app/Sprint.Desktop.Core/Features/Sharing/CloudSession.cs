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

    /// <summary>Empty for a Discord account.</summary>
    [JsonPropertyName("email")]
    public string Email { get; set; } = "";

    /// <summary>The server's id for the account. Empty in a session saved before it was kept.</summary>
    [JsonPropertyName("userId")]
    public string UserId { get; set; } = "";

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
        this._path = Path.Combine(dataRoot, FileName);
        this._log = log ?? NullLog.Instance;
        this.State = this.Load();
    }

    public CloudSessionState State { get; private set; }

    public bool IsSignedIn => this.State.Token.Length > 0 && this.State.ServerUrl.Length > 0;

    /// <summary>How the driver is credited on a lap they share.</summary>
    public string Attribution => this.State.DisplayName is { Length: > 0 } name ? name : "Unknown driver";

    public void SignIn(string serverUrl, string token, string email)
    {
        this.State.ServerUrl = serverUrl.TrimEnd('/');
        this.State.Token = token;
        this.State.Email = email;
        this.Save();
    }

    public void SetDisplayName(string displayName)
    {
        this.State.DisplayName = displayName;
        this.Save();
    }

    /// <summary>Remembers who the server says the token belongs to.</summary>
    public void SetProfile(string userId, string displayName)
    {
        this.State.UserId = userId;
        this.State.DisplayName = displayName;
        this.Save();
    }

    /// <summary>Forgets the token. The file is removed rather than blanked.</summary>
    public void SignOut()
    {
        this.State = new CloudSessionState { ServerUrl = this.State.ServerUrl };
        try
        {
            if (File.Exists(this._path))
            {
                File.Delete(this._path);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            this._log.Warn("Could not remove the stored cloud session", ex);
        }

        this.Save();
    }

    private CloudSessionState Load()
    {
        try
        {
            return File.Exists(this._path)
                ? JsonSerializer.Deserialize<CloudSessionState>(File.ReadAllText(this._path), Json) ?? new()
                : new();
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // A corrupt session file means signed out, never a failure to start.
            this._log.Warn("Ignoring an unreadable cloud session file", ex);
            return new();
        }
    }

    private void Save()
    {
        try
        {
            File.WriteAllText(this._path, JsonSerializer.Serialize(this.State, Json));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            this._log.Warn("Could not persist the cloud session", ex);
        }
    }
}
