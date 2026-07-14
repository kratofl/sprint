namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Appends log records to a daily-rolled text file under
/// <see cref="DiagnosticsPaths.LogDirectory"/>. Deliberately simple: each write
/// opens, appends, and closes under a lock, so the logger holds no long-lived
/// handle, is safe from any thread, and tolerates the log file being deleted or
/// rotated externally between writes. Old day-files are pruned on construction.
/// </summary>
public sealed class FileLogger : ILog
{
    private readonly DiagnosticsPaths _paths;
    private readonly LogLevel _minimumLevel;
    private readonly Func<DateTimeOffset> _clock;
    private readonly bool _echoToConsole;
    private readonly object _gate = new();

    public FileLogger(
        DiagnosticsPaths paths,
        LogLevel minimumLevel = LogLevel.Info,
        Func<DateTimeOffset>? clock = null,
        int retainDays = 7,
        bool echoToConsole = false)
    {
        _paths = paths;
        _minimumLevel = minimumLevel;
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _echoToConsole = echoToConsole;
        PruneOldLogs(retainDays);
    }

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        if (level < _minimumLevel)
        {
            return;
        }

        var timestamp = _clock();
        var line = LogFormat.Line(timestamp, level, message, exception);

        lock (_gate)
        {
            try
            {
                File.AppendAllText(_paths.LogFileFor(timestamp), line + Environment.NewLine);
            }
            catch
            {
                // Logging must never take down the app. A disk/permission failure
                // here is swallowed on purpose; the console echo below still helps
                // during development.
            }
        }

        if (_echoToConsole)
        {
            Console.Error.WriteLine(line);
        }
    }

    private void PruneOldLogs(int retainDays)
    {
        try
        {
            var existing = Directory.EnumerateFiles(_paths.LogDirectory, "sprint-*.log");
            foreach (var stale in FileRetention.SelectForDeletion(existing, Math.Max(1, retainDays)))
            {
                File.Delete(stale);
            }
        }
        catch
        {
            // Best-effort housekeeping; never block startup on it.
        }
    }
}
