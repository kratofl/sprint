namespace Sprint.Games.LeMansUltimate.Results;

/// <summary>A result file that failed to read or parse, kept so a batch scan never loses the rest.</summary>
/// <param name="FilePath">Absolute path of the offending file.</param>
/// <param name="Message">Human-readable reason (parse error, IO error, ...).</param>
public sealed record LmuResultReadError(string FilePath, string Message);

/// <summary>Outcome of a directory scan: the sessions that parsed and the files that did not.</summary>
/// <param name="Sessions">Successfully parsed sessions, newest file first.</param>
/// <param name="Errors">Files that could not be read or parsed.</param>
public sealed record LmuResultsScan(
    IReadOnlyList<LmuSessionResult> Sessions,
    IReadOnlyList<LmuResultReadError> Errors);

/// <summary>
/// Reads Le Mans Ultimate result XMLs from a directory (normally the game's
/// <c>UserData\Log\Results</c>) and parses them with <see cref="LmuResultsParser"/>.
/// The directory is injected so the reader is unit-testable against a temp folder;
/// <see cref="DefaultResultsDirectory"/> resolves the standard install location.
/// </summary>
public sealed class LmuResultsReader
{
    /// <summary>The results folder relative to a Le Mans Ultimate install root.</summary>
    public static readonly string ResultsSubPath =
        Path.Combine("UserData", "Log", "Results");

    private readonly string _directory;

    /// <param name="directory">Directory containing result XMLs. Need not exist yet.</param>
    public LmuResultsReader(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        _directory = directory;
    }

    /// <summary>The directory this reader scans.</summary>
    public string Directory => _directory;

    /// <summary>True when the scanned directory currently exists.</summary>
    public bool DirectoryExists => System.IO.Directory.Exists(_directory);

    /// <summary>
    /// List result XML files newest-first by last-write time. Returns an empty list when the
    /// directory does not exist. Non-XML files (e.g. the sim's <c>BatchTemplate*.ini</c>) are
    /// excluded by the <c>*.xml</c> filter.
    /// </summary>
    public IReadOnlyList<FileInfo> ListResultFiles()
    {
        if (!DirectoryExists)
        {
            return [];
        }

        return new DirectoryInfo(_directory)
            .EnumerateFiles("*.xml", SearchOption.TopDirectoryOnly)
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .ToList();
    }

    /// <summary>Read and parse a single result file.</summary>
    /// <exception cref="LmuResultParseException">The file content is not a valid result document.</exception>
    /// <exception cref="IOException">The file could not be read.</exception>
    public LmuSessionResult ReadFile(string path)
    {
        var xml = File.ReadAllText(path);
        return LmuResultsParser.Parse(xml);
    }

    /// <summary>Try to read and parse one file, capturing any failure instead of throwing.</summary>
    public bool TryReadFile(string path, out LmuSessionResult? session, out LmuResultReadError? error)
    {
        try
        {
            session = ReadFile(path);
            error = null;
            return true;
        }
        catch (Exception ex) when (ex is LmuResultParseException or IOException or UnauthorizedAccessException)
        {
            session = null;
            error = new LmuResultReadError(path, ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Parse every result file in the directory, newest-first, skipping (and recording) any that
    /// fail rather than aborting the whole scan.
    /// </summary>
    public LmuResultsScan ReadAll()
    {
        var sessions = new List<LmuSessionResult>();
        var errors = new List<LmuResultReadError>();

        foreach (var file in ListResultFiles())
        {
            if (TryReadFile(file.FullName, out var session, out var error))
            {
                sessions.Add(session!);
            }
            else
            {
                errors.Add(error!);
            }
        }

        return new LmuResultsScan(sessions, errors);
    }

    /// <summary>
    /// A reader over the default install's results directory, or <c>null</c> when that directory
    /// cannot be found (e.g. LMU is installed on another drive or not installed).
    /// </summary>
    public static LmuResultsReader? ForDefaultInstall()
    {
        var directory = DefaultResultsDirectory();
        return directory is null ? null : new LmuResultsReader(directory);
    }

    /// <summary>
    /// Resolve the standard Steam install's results directory if it exists on disk, else null.
    /// This is a best-effort convenience for the default Windows Steam library only; callers on
    /// non-default libraries should construct the reader with an explicit path.
    /// </summary>
    public static string? DefaultResultsDirectory()
    {
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        if (string.IsNullOrEmpty(programFilesX86))
        {
            return null;
        }

        var candidate = Path.Combine(
            programFilesX86,
            "Steam", "steamapps", "common", "Le Mans Ultimate",
            ResultsSubPath);

        return System.IO.Directory.Exists(candidate) ? candidate : null;
    }
}
