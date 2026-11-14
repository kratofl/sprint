using System.Text.RegularExpressions;
using Sprint.Games.LeMansUltimate.Results;
using Sprint.Games.LeMansUltimate.Setups;

namespace Sprint.Games.LeMansUltimate;

/// <summary>
/// Where Le Mans Ultimate is installed: finding it across the Steam libraries, telling whether
/// a folder is an install, and counting what it holds. Everything that reads the game's files
/// (setups, results) is rooted at one install folder found here or chosen by the driver.
/// </summary>
public static class LmuInstall
{
    /// <summary>The game's executable, directly in the install folder.</summary>
    public const string ExecutableName = "Le Mans Ultimate.exe";

    private static readonly string SteamGamePath = Path.Combine("steamapps", "common", "Le Mans Ultimate");

    /// <summary>
    /// Whether this platform can host the game at all: it is a Windows Steam game, so a
    /// platform with no Program Files (x86) has no Steam library to find it in.
    /// </summary>
    public static bool Supported => SteamRoot().Length > 0;

    /// <summary>
    /// Whether <paramref name="folder"/> is a Le Mans Ultimate install. The rule: an existing
    /// directory holding <see cref="ExecutableName"/> or a <c>UserData</c> folder. Either is
    /// enough, because the driver may point at a copy of the game's data without the exe, and
    /// the exe alone is what a fresh install has before its first run writes UserData.
    /// </summary>
    public static bool IsInstall(string folder)
    {
        if (string.IsNullOrWhiteSpace(folder))
        {
            return false;
        }

        try
        {
            return Directory.Exists(folder)
                && (File.Exists(Path.Combine(folder, ExecutableName)) || Directory.Exists(Path.Combine(folder, "UserData")));
        }
        catch (Exception ex) when (ex is ArgumentException or IOException or UnauthorizedAccessException or NotSupportedException)
        {
            return false;
        }
    }

    /// <summary>The first Steam library that has the game installed, or null when none does.</summary>
    public static string? Find()
    {
        string steam = SteamRoot();
        if (steam.Length == 0)
        {
            return null;
        }

        return SteamLibraries(steam)
            .Select(library => Path.Combine(library, SteamGamePath))
            .FirstOrDefault(IsInstall);
    }

    /// <summary>
    /// The folder to read the game's files from when the driver chose none: the install
    /// <see cref="Find"/> finds, else the default Steam library's place for it, so a reader can
    /// still say where it looked. An empty string on a platform with no Steam library.
    /// </summary>
    public static string DefaultFolder()
    {
        string steam = SteamRoot();
        return steam.Length == 0 ? "" : Find() ?? Path.Combine(steam, SteamGamePath);
    }

    /// <summary>The <c>.svm</c> setup files under the install's setups folder. 0 when there is none.</summary>
    public static int CountSetups(string folder) =>
        CountFiles(folder, LmuSetupRepository.SetupsSubPath, "*.svm", SearchOption.AllDirectories);

    /// <summary>The results <c>.xml</c> files in the install's results folder. 0 when there is none.</summary>
    public static int CountResults(string folder) =>
        CountFiles(folder, LmuResultsReader.ResultsSubPath, "*.xml", SearchOption.TopDirectoryOnly);

    private static int CountFiles(string folder, string subPath, string pattern, SearchOption search)
    {
        if (string.IsNullOrWhiteSpace(folder))
        {
            return 0;
        }

        try
        {
            string directory = Path.Combine(folder, subPath);
            return Directory.Exists(directory) ? Directory.EnumerateFiles(directory, pattern, search).Count() : 0;
        }
        catch (Exception ex) when (ex is ArgumentException or IOException or UnauthorizedAccessException)
        {
            return 0;
        }
    }

    /// <summary>The default Steam folder, or an empty string on a platform with none.</summary>
    private static string SteamRoot()
    {
        string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        return string.IsNullOrEmpty(programFilesX86) ? "" : Path.Combine(programFilesX86, "Steam");
    }

    /// <summary>
    /// The Steam libraries listed in <c>steamapps/libraryfolders.vdf</c>, the default one
    /// first. A game installed on another drive lives in one of the others.
    /// </summary>
    private static IEnumerable<string> SteamLibraries(string steam)
    {
        string listing;
        try
        {
            listing = File.ReadAllText(Path.Combine(steam, "steamapps", "libraryfolders.vdf"));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            listing = "";
        }

        // Each library is a `"path"  "D:\\SteamLibrary"` line, its backslashes escaped.
        return
        [
            steam,
            .. Regex.Matches(listing, @"""path""\s+""([^""]+)""")
                .Select(match => match.Groups[1].Value.Replace(@"\\", @"\", StringComparison.Ordinal)),
        ];
    }
}
