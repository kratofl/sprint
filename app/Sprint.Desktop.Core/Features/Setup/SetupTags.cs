using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Setup;

/// <summary>
/// The session and style the driver gave a setup. Either may be null: not said. Both null is still
/// a tag: the driver said the setup is neither, whatever its name says.
/// </summary>
public sealed record SetupTag(
    [property: JsonPropertyName("session")] SetupSession? Session,
    [property: JsonPropertyName("style")] SetupStyle? Style)
{
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; init; }
}

/// <summary>
/// The tags the driver set on setups, by setup id (<see cref="SetupListItem.Id"/>). A driver's
/// tag replaces what the name says (<see cref="SetupNaming"/>) as a whole, so a session set by
/// hand on a Bealien setup does not keep the name's style beside it. One small file under the
/// data folder; the game's setup files are never written.
/// </summary>
public sealed class SetupTags
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string _path;
    private readonly ILog _log;
    private readonly Lock _gate = new();
    private Dictionary<string, SetupTag>? _tags;
    private bool _unreadable;

    public SetupTags(string path, ILog? log = null)
    {
        this._path = path ?? throw new ArgumentNullException(nameof(path));
        this._log = log ?? NullLog.Instance;
    }

    /// <summary>The driver's tag on a setup, or null when they never set one (or the tags cannot be read right now).</summary>
    public SetupTag? For(string setupId)
    {
        lock (this._gate)
        {
            return this.Tags()?.GetValueOrDefault(setupId);
        }
    }

    /// <summary>
    /// Sets a setup's tag, or with null takes the driver's tag off so the name speaks again. False
    /// when the tags could not be read or saved; nothing changed then.
    /// </summary>
    public bool Set(string setupId, SetupTag? tag)
    {
        lock (this._gate)
        {
            // Never written over tags that could not be read: that would lose every other tag.
            if (this.Tags() is not { } tags)
            {
                return false;
            }

            Dictionary<string, SetupTag> next = new(tags, StringComparer.Ordinal);
            if (tag is null)
            {
                next.Remove(setupId);
            }
            else
            {
                next[setupId] = tag;
            }

            if (!this.Write(next))
            {
                return false;
            }

            this._tags = next;
            return true;
        }
    }

    /// <summary>
    /// The tags, read once; null while the file cannot be opened (held by a scanner or a sync), to
    /// be read again next time.
    /// </summary>
    private Dictionary<string, SetupTag>? Tags()
    {
        if (this._tags is not null)
        {
            return this._tags;
        }

        Dictionary<string, SetupTag> read = new(StringComparer.Ordinal);
        if (File.Exists(this._path))
        {
            try
            {
                using FileStream stream = File.OpenRead(this._path);
                if (JsonSerializer.Deserialize<Dictionary<string, SetupTag>>(stream, JsonOptions) is { } stored)
                {
                    foreach ((string id, SetupTag tag) in stored)
                    {
                        read[id] = tag;
                    }
                }
            }
            catch (JsonException ex)
            {
                // Unreadable tags cost the driver their tags, never the page. Set aside, not
                // overwritten by the next tag: they may be from a newer Sprint.
                string? keptAt = AtomicFile.SetAside(this._path);
                this._log.Warn($"Could not read the setup tags at {this._path}" + (keptAt is null ? "" : $"; kept at {keptAt}"), ex);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Once per spell, not once per setup on the list.
                if (!this._unreadable)
                {
                    this._log.Warn($"Could not open the setup tags at {this._path}; trying again on the next read", ex);
                }

                this._unreadable = true;
                return null;
            }
        }

        this._unreadable = false;
        this._tags = read;
        return this._tags;
    }

    private bool Write(Dictionary<string, SetupTag> tags)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(this._path) ?? ".");
            AtomicFile.Write(this._path, stream => JsonSerializer.Serialize(stream, tags, JsonOptions));
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            this._log.Error($"Failed to save the setup tags at {this._path}", ex);
            return false;
        }
    }
}
