using Sprint.Desktop.Api.Games;

namespace Sprint.Games.LeMansUltimate.Setups;

/// <summary>
/// Le Mans Ultimate's stored setups (<c>UserData\player\Settings\&lt;Track&gt;\*.svm</c>) as
/// Sprint records. The sim's INI-like format stops here: callers see
/// <see cref="GameSetupSnapshot"/> only.
/// </summary>
/// <remarks>
/// Read-only, by contract and by intent — Sprint never writes into the game directory.
/// </remarks>
public sealed class LmuSetupRepository : ISetupRepository
{
    /// <summary>The setups folder relative to a Le Mans Ultimate install root.</summary>
    public static readonly string SetupsSubPath =
        Path.Combine("UserData", "player", "Settings");

    private readonly string _root;

    /// <param name="root">Directory holding the per-track setup folders. Need not exist yet.</param>
    public LmuSetupRepository(string root)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(root);
        _root = root;
    }

    public string? WatchRoot => _root;

    public IReadOnlyList<GameSetupInfo> ListSetups()
    {
        if (!Directory.Exists(_root))
        {
            // A driver who has never saved a setup has no folder, which is not an error.
            return [];
        }

        return
        [
            .. new DirectoryInfo(_root)
                .EnumerateFiles("*.svm", SearchOption.AllDirectories)
                .OrderByDescending(file => file.LastWriteTimeUtc)
                .Select(file => new GameSetupInfo(
                    file.FullName,
                    Path.GetFileNameWithoutExtension(file.Name),
                    TrackOf(file),
                    file.LastWriteTimeUtc))
        ];
    }

    public GameSetupSnapshot? Read(GameSetupInfo setup)
    {
        ArgumentNullException.ThrowIfNull(setup);

        string text;
        try
        {
            // The id is this repository's own key and a path only to this repository, so an id
            // from anywhere else names no file here. Reading also races the sim writing the
            // file — one unreadable setup must never abort a scan.
            text = File.ReadAllText(setup.Id);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return null;
        }

        var file = LmuSetupFile.Parse(text);
        return new GameSetupSnapshot(
            setup,
            file.VehicleClassSetting,
            [.. file.Entries.Select(entry => new GameSetupValue(entry.Section, entry.Key, entry.RawValue))]);
    }

    /// <summary>
    /// The track a setup is filed under: the sim keeps one folder per track under the settings
    /// root. Null for a file sitting directly in the root, which belongs to no track.
    /// </summary>
    private string? TrackOf(FileInfo file)
    {
        var relative = Path.GetRelativePath(_root, file.DirectoryName ?? _root);
        if (relative is "." or "")
        {
            return null;
        }

        // Only the folder directly under the root names the track; anything deeper is the
        // sim's own sub-structure and would name a folder no track is called.
        var separator = relative.IndexOfAny([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar]);
        return separator < 0 ? relative : relative[..separator];
    }

    /// <summary>
    /// Where the default Steam install keeps its setups, whether or not anything is there yet,
    /// or an empty string on a platform with no such library.
    /// </summary>
    public static string DefaultSetupsPath()
    {
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        if (string.IsNullOrEmpty(programFilesX86))
        {
            return "";
        }

        return Path.Combine(
            programFilesX86,
            "Steam", "steamapps", "common", "Le Mans Ultimate",
            SetupsSubPath);
    }
}
