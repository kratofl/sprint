namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Pure retention policy: given the existing artifact files (newest interesting
/// last by ordinal name — our names sort chronologically), decide which to prune
/// so the diagnostics folder cannot grow without bound. Separated from I/O so the
/// keep/delete decision is unit-testable.
/// </summary>
public static class FileRetention
{
    /// <summary>
    /// Returns the files to delete so that at most <paramref name="keep"/> of the
    /// most recent remain. Ordering is by ordinal path comparison, which matches
    /// the zero-padded timestamp names produced by <see cref="DiagnosticsPaths"/>.
    /// </summary>
    public static IReadOnlyList<string> SelectForDeletion(IEnumerable<string> files, int keep)
    {
        ArgumentNullException.ThrowIfNull(files);
        if (keep < 0)
        {
            keep = 0;
        }

        var ordered = files.OrderBy(path => path, StringComparer.Ordinal).ToList();
        var excess = ordered.Count - keep;
        return excess <= 0 ? Array.Empty<string>() : ordered.Take(excess).ToList();
    }
}
