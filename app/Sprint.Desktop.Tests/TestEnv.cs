namespace Sprint.Desktop.Tests;

/// <summary>
/// Shared test-environment paths. Persistence tests run against fresh temp dirs
/// and the real preset tree, never the user's AppData (PRD #107 testing decision).
/// </summary>
internal static class TestEnv
{
    public static string RepoRoot { get; } = FindRepoRoot();

    public static string PresetRoot => Path.Combine(RepoRoot, "app", "Sprint.Desktop.Client", "presets");

    /// <summary>A unique, empty temp data root for a single test. Caller deletes it.</summary>
    public static string NewTempDataRoot()
    {
        var dir = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string FindRepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "app", "Sprint.Desktop.Client", "presets")))
            {
                return dir.FullName;
            }
        }

        throw new DirectoryNotFoundException("Could not find repository root containing app/Sprint.Desktop.Client/presets.");
    }
}
