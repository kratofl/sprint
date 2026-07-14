namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Resolves and owns the on-disk locations for diagnostics artifacts. Mirrors
/// <see cref="DesktopRuntime"/>'s AppData convention (<c>%AppData%/Sprint</c>) so
/// logs and crash reports sit next to the app's other user-scoped state, and lets
/// tests point everything at a throwaway temp root.
/// </summary>
public sealed class DiagnosticsPaths
{
    public DiagnosticsPaths(string root)
    {
        Root = root;
        LogDirectory = Path.Combine(root, "logs");
        CrashDirectory = Path.Combine(root, "crashes");
        Directory.CreateDirectory(LogDirectory);
        Directory.CreateDirectory(CrashDirectory);
    }

    public string Root { get; }

    public string LogDirectory { get; }

    public string CrashDirectory { get; }

    /// <summary>The default AppData location, <c>%AppData%/Sprint/diagnostics</c>.</summary>
    public static DiagnosticsPaths CreateDefault() => new(Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Sprint",
        "diagnostics"));

    /// <summary>Daily-rolled log file for <paramref name="date"/> (one file per UTC day).</summary>
    public string LogFileFor(DateTimeOffset date) =>
        Path.Combine(LogDirectory, $"sprint-{date.ToUniversalTime():yyyyMMdd}.log");

    /// <summary>A unique crash-report path stamped to the millisecond.</summary>
    public string CrashFileFor(DateTimeOffset timestamp) =>
        Path.Combine(CrashDirectory, $"crash-{timestamp.ToUniversalTime():yyyyMMdd-HHmmss-fff}.log");
}
