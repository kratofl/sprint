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
        this._root = root;
    }

    public string? WatchRoot => this._root;

    public IReadOnlyList<GameSetupInfo> ListSetups()
    {
        if (!Directory.Exists(this._root))
        {
            // A driver who has never saved a setup has no folder, which is not an error.
            return [];
        }

        return
        [
            .. new DirectoryInfo(this._root)
                .EnumerateFiles("*.svm", SearchOption.AllDirectories)
                .OrderByDescending(file => file.LastWriteTimeUtc)
                .Select(file => new GameSetupInfo(
                    file.FullName,
                    Path.GetFileNameWithoutExtension(file.Name),
                    this.TrackOf(file),
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

        LmuSetupFile file = LmuSetupFile.Parse(text);
        return new GameSetupSnapshot(
            setup,
            file.VehicleClassSetting,
            [.. file.Entries.Select(entry => new GameSetupValue(entry.Section, entry.Key, entry.RawValue))]);
    }

    public GameSetupReading? Describe(GameSetupValue value) => LmuSetupSheet.Describe(value);

    public GameSetupVehicle DescribeVehicle(string vehicleDescriptor) => LmuSetupSheet.DescribeVehicle(vehicleDescriptor);

    public string TrackName(string track) => LmuSetupSheet.TrackName(track);

    /// <summary>
    /// The track a setup is filed under: the sim keeps one folder per track under the settings
    /// root. Null for a file sitting directly in the root, which belongs to no track.
    /// </summary>
    private string? TrackOf(FileInfo file)
    {
        string relative = Path.GetRelativePath(this._root, file.DirectoryName ?? this._root);
        if (relative is "." or "")
        {
            return null;
        }

        // Only the folder directly under the root names the track; anything deeper is the
        // sim's own sub-structure and would name a folder no track is called.
        int separator = relative.IndexOfAny([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar]);
        return separator < 0 ? relative : relative[..separator];
    }

    /// <summary>
    /// Where Le Mans Ultimate keeps its setups when the driver chose no install folder, whether
    /// or not anything is there yet (<see cref="LmuInstall.DefaultFolder"/>). An empty string
    /// on a platform with no Steam library.
    /// </summary>
    public static string DefaultSetupsPath()
    {
        string folder = LmuInstall.DefaultFolder();
        return folder.Length == 0 ? "" : Path.Combine(folder, SetupsSubPath);
    }
}
