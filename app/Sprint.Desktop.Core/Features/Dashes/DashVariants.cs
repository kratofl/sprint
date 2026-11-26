using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Where a <see cref="DashVariant"/> applies, as the designer's scope picks it: a device, a game,
/// a class, a car, or several of them. A null level matches anything; at least one is set.
/// </summary>
public sealed class DashVariantScope
{
    [JsonPropertyName("device")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Device { get; set; }

    /// <summary>The game as telemetry names it ("LeMansUltimate").</summary>
    [JsonPropertyName("game")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Game { get; set; }

    /// <summary>A class as <c>CarNames.ClassOf</c> spells it ("Hypercar").</summary>
    [JsonPropertyName("carClass")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CarClass { get; set; }

    /// <summary>A car's name ("Hypercar BMW").</summary>
    [JsonPropertyName("car")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Car { get; set; }
}

/// <summary>What a dash variant replaces of its dash: everything the designer's sections draw.</summary>
public sealed class DashVariantLayout
{
    [JsonPropertyName("gridCols")]
    public int GridCols { get; set; }

    [JsonPropertyName("gridRows")]
    public int GridRows { get; set; }

    [JsonPropertyName("colSizes")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<double>? ColSizes { get; set; }

    [JsonPropertyName("rowSizes")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<double>? RowSizes { get; set; }

    [JsonPropertyName("idlePage")]
    public DashPage? IdlePage { get; set; }

    [JsonPropertyName("pages")]
    public List<DashPage> Pages { get; set; } = [];

    /// <summary>The lap review and the pit limiter, which the host keeps as the designer wrote them.</summary>
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>One version of a dash, shown in its <see cref="Scope"/> in place of the dash's own content.</summary>
public sealed class DashVariant
{
    [JsonPropertyName("scope")]
    public DashVariantScope Scope { get; set; } = new();

    [JsonPropertyName("layout")]
    public DashVariantLayout Layout { get; set; } = new();
}

/// <summary>
/// A dash's versions per scope. The device's dash rules pick which dash a screen shows; then the
/// most specific variant of that dash matching the device and car replaces the dash's content
/// (<see cref="For"/>): a car before its class before its game, at the same level one for this
/// device before one for every device. A variant keeps the dash's name, category, screen size,
/// alerts and theme; only what the designer draws differs. The designer makes a variant on the
/// first edit in a scope that had none, so picking a scope alone changes nothing.
/// </summary>
public static class DashVariants
{
    /// <summary>The most a dash keeps; far more than a garage of cars needs.</summary>
    public const int MaxVariants = 64;

    public const int MaxValueLength = 120;

    /// <summary>
    /// What <paramref name="dash"/> shows on <paramref name="deviceId"/> in this game, class and
    /// car: the dash itself, or a copy of it carrying its most specific matching variant's content.
    /// Never with its variants: only what is drawn.
    /// </summary>
    public static DashLayout For(DashLayout dash, string deviceId, string game, string? carClass, string car)
    {
        ArgumentNullException.ThrowIfNull(dash);
        DashVariant? best = null;
        int bestRank = 0;
        foreach (DashVariant variant in dash.Variants ?? [])
        {
            DashVariantScope scope = variant.Scope;
            bool matches = Matches(scope.Device, deviceId) && Matches(scope.Game, game) && Matches(scope.CarClass, carClass) && Matches(scope.Car, car);
            int rank = matches ? Rank(scope) : 0;
            if (rank > bestRank)
            {
                best = variant;
                bestRank = rank;
            }
        }

        if (best is not null)
        {
            return Shown(dash, best);
        }

        // Without its variants: a scene carries the dash it draws, not every version of it.
        if (dash.Variants is not { Count: > 0 })
        {
            return dash;
        }

        DashLayout itself = dash.WithAlerts(dash.Alerts);
        itself.Variants = null;
        return itself;
    }

    /// <summary>
    /// The dash as <paramref name="variant"/> shows it: a shallow copy with the variant's content
    /// and no variants of its own. For drawing and checking, never for saving.
    /// </summary>
    public static DashLayout Shown(DashLayout dash, DashVariant variant)
    {
        ArgumentNullException.ThrowIfNull(dash);
        ArgumentNullException.ThrowIfNull(variant);
        // MemberwiseClone through WithAlerts, so a property added to the dash later is carried along.
        DashLayout shown = dash.WithAlerts(dash.Alerts);
        DashVariantLayout content = variant.Layout;
        shown.GridCols = content.GridCols;
        shown.GridRows = content.GridRows;
        shown.ColSizes = content.ColSizes;
        shown.RowSizes = content.RowSizes;
        shown.IdlePage = content.IdlePage;
        shown.Pages = content.Pages;
        shown.ExtensionData = content.ExtensionData;
        shown.Variants = null;
        return shown;
    }

    /// <summary>Writes back what a refit or a cleanup changed on a variant's <see cref="Shown"/> copy.</summary>
    public static void Store(DashVariant variant, DashLayout shown)
    {
        ArgumentNullException.ThrowIfNull(variant);
        ArgumentNullException.ThrowIfNull(shown);
        variant.Layout.GridCols = shown.GridCols;
        variant.Layout.GridRows = shown.GridRows;
        variant.Layout.ColSizes = shown.ColSizes;
        variant.Layout.RowSizes = shown.RowSizes;
        variant.Layout.IdlePage = shown.IdlePage;
        variant.Layout.Pages = shown.Pages;
    }

    /// <summary>
    /// Whether a dash's variants are sound: at most <see cref="MaxVariants"/>, each with at least
    /// one level of 1 to <see cref="MaxValueLength"/> characters, no scope twice, each a valid dash
    /// as shown (<see cref="DashLayoutValidator"/>).
    /// </summary>
    public static bool AreValid(DashLayout dash)
    {
        ArgumentNullException.ThrowIfNull(dash);
        if (dash.Variants is not { } variants)
        {
            return true;
        }

        if (variants.Count > MaxVariants)
        {
            return false;
        }

        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        foreach (DashVariant variant in variants)
        {
            if (variant?.Scope is not { } scope || variant.Layout is null)
            {
                return false;
            }

            string?[] levels = [scope.Device, scope.Game, scope.CarClass, scope.Car];
            if (levels.All(level => level is null) || levels.Any(level => level is not null && (level.Trim().Length == 0 || level.Length > MaxValueLength)))
            {
                return false;
            }

            if (!seen.Add(string.Join('\u001f', levels.Select(level => level?.Trim() ?? ""))) || !DashLayoutValidator.IsValid(Shown(dash, variant)))
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>Runs <paramref name="change"/> on each variant as shown, keeping what it changed; true when any changed.</summary>
    public static bool Update(DashLayout dash, Func<DashLayout, bool> change)
    {
        ArgumentNullException.ThrowIfNull(dash);
        ArgumentNullException.ThrowIfNull(change);
        bool changed = false;
        foreach (DashVariant variant in dash.Variants ?? [])
        {
            DashLayout shown = Shown(dash, variant);
            if (change(shown))
            {
                Store(variant, shown);
                changed = true;
            }
        }

        return changed;
    }

    // A car before its class before its game; at the same level, one for a device first, then the one naming more levels.
    private static int Rank(DashVariantScope scope)
    {
        int level = scope.Car is not null ? 3 : scope.CarClass is not null ? 2 : scope.Game is not null ? 1 : 0;
        int named = new[] { scope.Game, scope.CarClass, scope.Car }.Count(value => value is not null);
        return level * 100 + (scope.Device is not null ? 10 : 0) + named + 1;
    }

    private static bool Matches(string? scope, string? current) =>
        scope is null || (current is not null && current.Length > 0 && string.Equals(scope.Trim(), current.Trim(), StringComparison.OrdinalIgnoreCase));
}
