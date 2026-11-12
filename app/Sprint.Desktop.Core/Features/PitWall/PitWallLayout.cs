using System.Text.Json;

namespace Sprint.Desktop.Features.PitWall;

/// <summary>A window's place on the desktop, in screen pixels as Electron reports them.</summary>
public sealed record PitWallBounds(int X, int Y, int Width, int Height);

/// <summary>
/// One slot on a page's 12×8 grid. One layer is a plain tile; more are a stack that takes turns,
/// every <see cref="CycleSeconds"/> or, with null, when the engineer switches it by hand.
/// </summary>
public sealed record PitWallTile
{
    public string Id { get; init; } = "";

    /// <summary>Tile kinds (<see cref="PitWallLayouts.Kinds"/>), the one shown first first.</summary>
    public IReadOnlyList<string> Layers { get; init; } = [];

    public int X { get; init; }

    public int Y { get; init; }

    public int W { get; init; }

    public int H { get; init; }

    public int? CycleSeconds { get; init; }

    public bool PauseOnHover { get; init; }

    /// <summary>Show the radar layer while a car is alongside.</summary>
    public bool JumpRadar { get; init; }

    /// <summary>Show the damage layer for a while after a new impact.</summary>
    public bool JumpDamage { get; init; }

    /// <summary>Open in its own window, at <see cref="Bounds"/> once it has been placed.</summary>
    public bool Detached { get; init; }

    public PitWallBounds? Bounds { get; init; }
}

public sealed record PitWallPage
{
    public string Id { get; init; } = "";

    public string Name { get; init; } = "";

    public bool Detached { get; init; }

    public PitWallBounds? Bounds { get; init; }

    public IReadOnlyList<PitWallTile> Tiles { get; init; } = [];
}

/// <summary>The engineer's pit wall arrangement on this PC: <c>state.pitWallLayout</c>.</summary>
public sealed record PitWallLayout
{
    public IReadOnlyList<PitWallPage> Pages { get; init; } = [];

    /// <summary>Where the pit wall's main window was left.</summary>
    public PitWallBounds? MainBounds { get; init; }
}

/// <summary>The pit wall layout's rules: the default, and reading and checking one from untrusted JSON.</summary>
public static class PitWallLayouts
{
    public const int Columns = 12;
    public const int Rows = 8;
    public const int MaxPages = 12;
    public const int MaxLayers = 6;
    public const int MaxNameLength = 40;
    public const int MinCycleSeconds = 3;
    public const int MaxCycleSeconds = 120;
    private const int MaxIdLength = 64;

    /// <summary>Every tile kind the renderer draws.</summary>
    public static IReadOnlySet<string> Kinds { get; } = new HashSet<string>(StringComparer.Ordinal)
    {
        "session", "timing", "track", "stint", "fuel", "relative", "target", "tyres", "pressure", "damage", "radar", "traces",
    };

    /// <summary>The approved mockups: a Race, a Car and a Traces page.</summary>
    public static PitWallLayout Default { get; } = new()
    {
        Pages =
        [
            Page("race", "Race",
                Tile("race-session", "session", 0, 0, 12, 1),
                Tile("race-timing", "timing", 0, 1, 7, 5),
                Tile("race-track", "track", 7, 1, 5, 4),
                Tile("race-stint", "stint", 7, 5, 3, 3),
                Tile("race-relative", "relative", 10, 5, 2, 3),
                Tile("race-target", "target", 0, 6, 3, 2),
                Tile("race-fuel", "fuel", 3, 6, 4, 2)),
            Page("car", "Car",
                Tile("car-tyres", "tyres", 0, 0, 7, 4),
                Tile("car-pressure", "pressure", 7, 0, 5, 4),
                Tile("car-damage", "damage", 0, 4, 5, 4),
                Tile("car-radar", "radar", 5, 4, 3, 4),
                Tile("car-relative", "relative", 8, 4, 4, 4)),
            Page("traces", "Traces",
                Tile("traces-traces", "traces", 0, 0, 8, 8),
                Tile("traces-pressure", "pressure", 8, 0, 4, 4),
                Tile("traces-track", "track", 8, 4, 4, 4)),
        ],
    };

    /// <summary>
    /// Reads a layout from a command or the stored file. <paramref name="mainBounds"/> stands in
    /// when the JSON has no <c>mainBounds</c> at all, so a client saving pages need not echo it.
    /// </summary>
    public static bool TryParse(JsonElement json, PitWallBounds? mainBounds, out PitWallLayout layout, out string error)
    {
        layout = Default;
        if (json.ValueKind != JsonValueKind.Object || !json.TryGetProperty("pages", out JsonElement pagesJson) || pagesJson.ValueKind != JsonValueKind.Array)
        {
            error = "layout.pages must be an array";
            return false;
        }

        if (json.TryGetProperty("mainBounds", out JsonElement mainJson))
        {
            if (!TryBounds(mainJson, out mainBounds, out error))
                return false;
        }

        List<PitWallPage> pages = [];
        foreach (JsonElement pageJson in pagesJson.EnumerateArray())
        {
            if (!TryPage(pageJson, out PitWallPage? page, out error) || page is null)
                return false;
            pages.Add(page);
        }

        PitWallLayout parsed = new() { Pages = pages, MainBounds = mainBounds };
        if (Check(parsed) is { } invalid)
        {
            error = invalid;
            return false;
        }

        layout = parsed;
        error = "";
        return true;
    }

    /// <summary>What is wrong with <paramref name="layout"/>, or null when nothing is.</summary>
    public static string? Check(PitWallLayout layout)
    {
        ArgumentNullException.ThrowIfNull(layout);
        if (layout.Pages.Count is < 1 or > MaxPages)
            return $"a pit wall has 1 to {MaxPages} pages";

        HashSet<string> pageIds = new(StringComparer.Ordinal);
        HashSet<string> tileIds = new(StringComparer.Ordinal);
        foreach (PitWallPage page in layout.Pages)
        {
            if (!ValidId(page.Id) || !pageIds.Add(page.Id))
                return $"page id '{page.Id}' is missing, too long or used twice";
            if (page.Name.Trim().Length is < 1 or > MaxNameLength)
                return $"a page name is 1 to {MaxNameLength} characters";

            bool[,] taken = new bool[Columns, Rows];
            foreach (PitWallTile tile in page.Tiles)
            {
                if (!ValidId(tile.Id) || !tileIds.Add(tile.Id))
                    return $"tile id '{tile.Id}' is missing, too long or used twice";
                if (tile.Layers.Count is < 1 or > MaxLayers)
                    return $"tile '{tile.Id}' has 1 to {MaxLayers} layers";
                if (tile.Layers.FirstOrDefault(kind => !Kinds.Contains(kind)) is { } unknown)
                    return $"unknown tile kind: {unknown}";
                if (tile.W < 1 || tile.H < 1 || tile.X < 0 || tile.Y < 0 || tile.X + tile.W > Columns || tile.Y + tile.H > Rows)
                    return $"tile '{tile.Id}' does not fit the {Columns}×{Rows} grid";
                if (tile.CycleSeconds is < MinCycleSeconds or > MaxCycleSeconds)
                    return $"a stack switches every {MinCycleSeconds} to {MaxCycleSeconds} seconds, or by hand";

                for (int column = tile.X; column < tile.X + tile.W; column++)
                {
                    for (int row = tile.Y; row < tile.Y + tile.H; row++)
                    {
                        if (taken[column, row])
                            return $"tile '{tile.Id}' overlaps another tile on page '{page.Name}'";
                        taken[column, row] = true;
                    }
                }
            }
        }

        return null;
    }

    /// <summary>Reads window bounds: an object with whole x, y and a positive width and height, or null.</summary>
    public static bool TryBounds(JsonElement json, out PitWallBounds? bounds, out string error)
    {
        bounds = null;
        error = "";
        if (json.ValueKind == JsonValueKind.Null)
            return true;

        if (json.ValueKind != JsonValueKind.Object
            || !TryWhole(json, "x", out int x) || !TryWhole(json, "y", out int y)
            || !TryWhole(json, "width", out int width) || !TryWhole(json, "height", out int height)
            || width <= 0 || height <= 0)
        {
            error = "bounds must carry x, y and a positive width and height";
            return false;
        }

        bounds = new PitWallBounds(x, y, width, height);
        return true;
    }

    private static bool TryPage(JsonElement json, out PitWallPage? page, out string error)
    {
        page = null;
        if (json.ValueKind != JsonValueKind.Object
            || !TryText(json, "id", out string id)
            || !TryText(json, "name", out string name)
            || !json.TryGetProperty("tiles", out JsonElement tilesJson) || tilesJson.ValueKind != JsonValueKind.Array)
        {
            error = "a page needs an id, a name and a tiles array";
            return false;
        }

        if (!TryFlag(json, "detached", out bool detached, out error) || !TryOptionalBounds(json, out PitWallBounds? bounds, out error))
            return false;

        List<PitWallTile> tiles = [];
        foreach (JsonElement tileJson in tilesJson.EnumerateArray())
        {
            if (!TryTile(tileJson, out PitWallTile? tile, out error) || tile is null)
                return false;
            tiles.Add(tile);
        }

        page = new PitWallPage { Id = id, Name = name.Trim(), Detached = detached, Bounds = bounds, Tiles = tiles };
        return true;
    }

    private static bool TryTile(JsonElement json, out PitWallTile? tile, out string error)
    {
        tile = null;
        if (json.ValueKind != JsonValueKind.Object
            || !TryText(json, "id", out string id)
            || !json.TryGetProperty("layers", out JsonElement layersJson) || layersJson.ValueKind != JsonValueKind.Array
            || !TryWhole(json, "x", out int x) || !TryWhole(json, "y", out int y)
            || !TryWhole(json, "w", out int w) || !TryWhole(json, "h", out int h))
        {
            error = "a tile needs an id, a layers array and whole x, y, w and h";
            return false;
        }

        List<string> layers = [];
        foreach (JsonElement layer in layersJson.EnumerateArray())
        {
            if (layer.ValueKind != JsonValueKind.String)
            {
                error = "tile layers are tile kinds";
                return false;
            }

            layers.Add(layer.GetString() ?? "");
        }

        int? cycle = null;
        if (json.TryGetProperty("cycleSeconds", out JsonElement cycleJson) && cycleJson.ValueKind != JsonValueKind.Null)
        {
            if (!TryWholeValue(cycleJson, out int seconds))
            {
                error = "cycleSeconds is a whole number of seconds or null";
                return false;
            }

            cycle = seconds;
        }

        if (!TryFlag(json, "pauseOnHover", out bool pause, out error)
            || !TryFlag(json, "jumpRadar", out bool jumpRadar, out error)
            || !TryFlag(json, "jumpDamage", out bool jumpDamage, out error)
            || !TryFlag(json, "detached", out bool detached, out error)
            || !TryOptionalBounds(json, out PitWallBounds? bounds, out error))
        {
            return false;
        }

        tile = new PitWallTile
        {
            Id = id,
            Layers = layers,
            X = x,
            Y = y,
            W = w,
            H = h,
            CycleSeconds = cycle,
            PauseOnHover = pause,
            JumpRadar = jumpRadar,
            JumpDamage = jumpDamage,
            Detached = detached,
            Bounds = bounds,
        };
        return true;
    }

    private static PitWallPage Page(string id, string name, params PitWallTile[] tiles) => new() { Id = id, Name = name, Tiles = tiles };

    private static PitWallTile Tile(string id, string kind, int x, int y, int w, int h) =>
        new() { Id = id, Layers = [kind], X = x, Y = y, W = w, H = h, PauseOnHover = true };

    private static bool ValidId(string id) => id.Length is > 0 and <= MaxIdLength && !id.Any(char.IsWhiteSpace);

    private static bool TryText(JsonElement json, string name, out string value)
    {
        value = json.TryGetProperty(name, out JsonElement element) && element.ValueKind == JsonValueKind.String ? element.GetString() ?? "" : "";
        return value.Length > 0;
    }

    /// <summary>An optional boolean: absent or null is false.</summary>
    private static bool TryFlag(JsonElement json, string name, out bool value, out string error)
    {
        value = false;
        error = "";
        if (!json.TryGetProperty(name, out JsonElement element) || element.ValueKind == JsonValueKind.Null)
            return true;
        if (element.ValueKind is JsonValueKind.True or JsonValueKind.False)
        {
            value = element.GetBoolean();
            return true;
        }

        error = $"{name} must be true or false";
        return false;
    }

    private static bool TryOptionalBounds(JsonElement json, out PitWallBounds? bounds, out string error)
    {
        bounds = null;
        error = "";
        return !json.TryGetProperty("bounds", out JsonElement element) || TryBounds(element, out bounds, out error);
    }

    private static bool TryWhole(JsonElement json, string name, out int value)
    {
        value = 0;
        return json.TryGetProperty(name, out JsonElement element) && TryWholeValue(element, out value);
    }

    /// <summary>A number that is whole once rounded (Electron's bounds can carry fractions on scaled displays).</summary>
    private static bool TryWholeValue(JsonElement element, out int value)
    {
        value = 0;
        if (element.ValueKind != JsonValueKind.Number || !element.TryGetDouble(out double number) || !double.IsFinite(number) || Math.Abs(number) > 1_000_000)
            return false;
        value = (int)Math.Round(number);
        return true;
    }
}
