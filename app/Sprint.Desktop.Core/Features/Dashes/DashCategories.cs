namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The categories a dash can be filed under on the Dashes page (<see cref="DashLayout.Category"/>).
/// The built-ins below always exist; the user's own ones live in
/// <c>AppSettings.CustomDashCategories</c> so a just-created, still empty category survives.
/// Names compare case-insensitively everywhere; a dash stores the known spelling.
/// </summary>
public static class DashCategories
{
    /// <summary>The fixed categories, in the order the Dashes page groups them.</summary>
    public static IReadOnlyList<string> BuiltIn { get; } = ["Race", "Qualifying", "Practice", "Endurance"];

    /// <summary>Names the Dashes page already uses for its own buckets ("All" filter, uncategorised "Other").</summary>
    private static readonly string[] Reserved = ["All", "Other"];

    /// <summary>The known spelling of <paramref name="name"/> among the built-ins and <paramref name="custom"/>, or null.</summary>
    public static string? Find(string? name, IEnumerable<string> custom)
    {
        string trimmed = name?.Trim() ?? "";
        if (trimmed.Length == 0)
        {
            return null;
        }

        return BuiltIn.Concat(custom).FirstOrDefault(known => string.Equals(known, trimmed, StringComparison.OrdinalIgnoreCase));
    }

    public static bool IsBuiltIn(string name) =>
        BuiltIn.Any(builtIn => string.Equals(builtIn, name.Trim(), StringComparison.OrdinalIgnoreCase));

    public static bool IsReserved(string name) =>
        Reserved.Any(reserved => string.Equals(reserved, name.Trim(), StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Validates a name for a new custom category, or the new name of <paramref name="renaming"/>:
    /// trimmed, non-empty, not reserved and not already taken by a built-in or another custom one.
    /// Renaming a category to a different casing of its own name is allowed.
    /// </summary>
    public static bool TryValidateName(string? name, IEnumerable<string> custom, string? renaming, out string trimmed, out string error)
    {
        trimmed = name?.Trim() ?? "";
        error = "";
        if (trimmed.Length == 0) { error = "category name is required"; return false; }
        if (IsReserved(trimmed)) { error = $"\"{trimmed}\" is reserved"; return false; }
        if (IsBuiltIn(trimmed)) { error = $"\"{trimmed}\" is a built-in category"; return false; }

        string candidate = trimmed;
        bool taken = custom.Any(existing =>
            string.Equals(existing, candidate, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(existing, renaming, StringComparison.OrdinalIgnoreCase));
        if (taken) { error = $"a category named \"{trimmed}\" already exists"; return false; }
        return true;
    }
}
