using System.Text.Json;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.PitWall;

/// <summary>Which pit wall window <see cref="PitWallLayoutStore.Place"/> moves.</summary>
public enum PitWallWindow
{
    Main,
    Page,
    Tile,
}

/// <summary>
/// The pit wall layout of this PC, kept in <c>pitwall-layout.json</c> under the data folder. A
/// missing, unreadable or invalid file is the default layout (and is logged, not thrown). The
/// <c>pitwall.*</c> commands write it from Kestrel threads while <c>/api/state</c> reads it, so
/// every member takes the lock; <see cref="Layout"/> is an immutable snapshot.
/// </summary>
public sealed class PitWallLayoutStore
{
    public const string FileName = "pitwall-layout.json";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly string _path;
    private readonly ILog _log;
    private readonly Lock _gate = new();
    private PitWallLayout? _layout;

    public PitWallLayoutStore(string dataRoot, ILog? log = null)
    {
        ArgumentNullException.ThrowIfNull(dataRoot);
        this._path = Path.Combine(dataRoot, FileName);
        this._log = log ?? NullLog.Instance;
    }

    public PitWallLayout Layout
    {
        get
        {
            lock (this._gate)
                return this._layout ??= this.Read();
        }
    }

    /// <summary>Replaces the layout with one read from a command; false with the reason when it is invalid.</summary>
    public bool TrySave(JsonElement json, out string error)
    {
        lock (this._gate)
        {
            if (!PitWallLayouts.TryParse(json, this.Layout.MainBounds, out PitWallLayout layout, out error))
                return false;
            this.Write(layout);
            return true;
        }
    }

    /// <summary>Remembers where a window was left: the main window, or a page's or tile's own window by id.</summary>
    public bool TryPlace(PitWallWindow window, string? id, PitWallBounds bounds, out string error)
    {
        ArgumentNullException.ThrowIfNull(bounds);
        lock (this._gate)
        {
            PitWallLayout layout = this.Layout;
            error = "";
            switch (window)
            {
                case PitWallWindow.Main:
                    this.Write(layout with { MainBounds = bounds });
                    return true;
                case PitWallWindow.Page when layout.Pages.Any(page => page.Id == id):
                    this.Write(layout with { Pages = [.. layout.Pages.Select(page => page.Id == id ? page with { Bounds = bounds } : page)] });
                    return true;
                case PitWallWindow.Tile when layout.Pages.Any(page => page.Tiles.Any(tile => tile.Id == id)):
                    this.Write(layout with
                    {
                        Pages = [.. layout.Pages.Select(page => page with { Tiles = [.. page.Tiles.Select(tile => tile.Id == id ? tile with { Bounds = bounds } : tile)] })],
                    });
                    return true;
                default:
                    error = $"no pit wall {window.ToString().ToLowerInvariant()} '{id}'";
                    return false;
            }
        }
    }

    /// <summary>Back to the default pages; where the main window sits is kept.</summary>
    public void Reset()
    {
        lock (this._gate)
            this.Write(PitWallLayouts.Default with { MainBounds = this.Layout.MainBounds });
    }

    private PitWallLayout Read()
    {
        if (!File.Exists(this._path))
            return PitWallLayouts.Default;

        string error;
        try
        {
            using FileStream stream = File.OpenRead(this._path);
            using JsonDocument document = JsonDocument.Parse(stream);
            if (PitWallLayouts.TryParse(document.RootElement, null, out PitWallLayout layout, out error))
                return layout;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            this._log.Warn($"Ignoring an unreadable pit wall layout at {this._path}", ex);
            return PitWallLayouts.Default;
        }
        catch (JsonException ex)
        {
            error = ex.Message;
        }

        // A layout this build cannot take (a tile kind from a newer Sprint, say) is set aside,
        // or the next window move would overwrite it with the default for good.
        string? keptAt = AtomicFile.SetAside(this._path);
        this._log.Warn($"Ignoring the pit wall layout at {this._path}: {error}" + (keptAt is null ? "" : $"; kept at {keptAt}"));
        return PitWallLayouts.Default;
    }

    private void Write(PitWallLayout layout)
    {
        this._layout = layout;
        try
        {
            AtomicFile.Write(this._path, stream => JsonSerializer.Serialize(stream, layout, JsonOptions));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            this._log.Error($"Failed to save the pit wall layout at {this._path}", ex);
        }
    }
}
