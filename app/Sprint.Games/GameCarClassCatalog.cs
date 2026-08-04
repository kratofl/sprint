using System.Text.RegularExpressions;

namespace Sprint.Games;

/// <summary>A semantic visual role the desktop can map onto its own design tokens.</summary>
public enum GameCarClassVisualRole
{
    Default,
    Hypercar,
    Lmp2,
    Lmgt3,
    Gte,
}

/// <summary>
/// One driver-facing class identity. Adapters and result files may use several raw names for the
/// same class; consumers deal in this stable identity instead.
/// </summary>
public sealed record GameCarClass(
    string Id,
    string Name,
    GameCarClassVisualRole VisualRole,
    IReadOnlyList<string> Aliases);

/// <summary>
/// Game-specific class vocabulary at the adapter boundary. Unknown games and classes remain
/// usable through a readable generated definition.
/// </summary>
public static partial class GameCarClassCatalog
{
    private static readonly IReadOnlyList<GameCarClass> LeMansUltimateClasses =
    [
        new("Hypercar", "Hypercar", GameCarClassVisualRole.Hypercar, ["Hypercar", "Hyper", "HYPERCAR", "LMH", "LMDh"]),
        new("LMP2", "LMP2", GameCarClassVisualRole.Lmp2, ["LMP2", "LMP2_ELMS"]),
        new("LMGT3", "LMGT3", GameCarClassVisualRole.Lmgt3, ["LMGT3", "GT3"]),
        new("GTE", "GTE", GameCarClassVisualRole.Gte, ["GTE", "GTE_AM", "GTE_PRO"]),
    ];

    /// <summary>Known classes first, then any game-provided classes the catalog has never seen.</summary>
    public static IReadOnlyList<GameCarClass> Classes(string? game, IEnumerable<string> observedRawClasses)
    {
        ArgumentNullException.ThrowIfNull(observedRawClasses);
        var known = KnownClasses(game);
        var result = new List<GameCarClass>(known);
        foreach (var raw in observedRawClasses
                     .Where(value => !string.IsNullOrWhiteSpace(value))
                     .Distinct(StringComparer.Ordinal)
                     .Order(StringComparer.Ordinal))
        {
            if (known.Any(definition => Matches(definition, raw)))
            {
                continue;
            }

            result.Add(new GameCarClass(raw, Humanize(raw), GameCarClassVisualRole.Default, [raw]));
        }

        return result;
    }

    public static string CanonicalId(string? game, string rawClass)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawClass);
        return KnownClasses(game).FirstOrDefault(definition => Matches(definition, rawClass))?.Id ?? rawClass;
    }

    public static string DisplayName(string? game, string classId) =>
        KnownClasses(game).FirstOrDefault(definition =>
            string.Equals(definition.Id, classId, StringComparison.Ordinal)
            || Matches(definition, classId))?.Name
        ?? Humanize(classId);

    private static IReadOnlyList<GameCarClass> KnownClasses(string? game) => IsLeMansUltimate(game)
        ? LeMansUltimateClasses
        : [];

    private static bool IsLeMansUltimate(string? game) =>
        string.Equals(game, "Le Mans Ultimate", StringComparison.OrdinalIgnoreCase)
        || string.Equals(game, "LeMansUltimate", StringComparison.OrdinalIgnoreCase)
        || string.Equals(game, "LMU", StringComparison.OrdinalIgnoreCase);

    private static bool Matches(GameCarClass definition, string rawClass) =>
        definition.Aliases.Contains(rawClass, StringComparer.OrdinalIgnoreCase);

    private static string Humanize(string raw)
    {
        var separated = SeparatorRegex().Replace(raw.Trim(), " ");
        return string.Join(
            ' ',
            separated.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(word =>
                word.Any(char.IsDigit) || word.All(character => !char.IsLetter(character) || char.IsUpper(character))
                    ? word.ToUpperInvariant()
                    : char.ToUpperInvariant(word[0]) + word[1..].ToLowerInvariant()));
    }

    [GeneratedRegex("[_-]+")]
    private static partial Regex SeparatorRegex();
}
