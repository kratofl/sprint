namespace Sprint.Games;

/// <summary>
/// The names one game goes by in stored records. History written by different Sprint versions
/// and sources spells Le Mans Ultimate differently: the name every writer stamps today
/// (<c>LeMansUltimate</c>), its display name, and the short form.
/// </summary>
public static class GameNames
{
    /// <summary>Whether <paramref name="game"/> names Le Mans Ultimate, in any of its spellings.</summary>
    public static bool IsLeMansUltimate(string? game) =>
        string.Equals(game, "LeMansUltimate", StringComparison.OrdinalIgnoreCase)
        || string.Equals(game, "Le Mans Ultimate", StringComparison.OrdinalIgnoreCase)
        || string.Equals(game, "LMU", StringComparison.OrdinalIgnoreCase);
}
