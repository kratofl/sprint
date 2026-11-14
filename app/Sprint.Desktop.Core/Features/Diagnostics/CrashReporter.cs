namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Writes a standalone crash report to <see cref="DiagnosticsPaths.CrashDirectory"/>
/// and mirrors a one-line marker into the rolling log. A crash report is the
/// artifact a user attaches to a bug report; the log gives the surrounding
/// timeline. Old reports are pruned so the folder stays bounded.
/// </summary>
public sealed class CrashReporter
{
    private readonly DiagnosticsPaths _paths;
    private readonly ILog _log;
    private readonly Func<DateTimeOffset> _clock;
    private readonly string _appVersion;
    private readonly int _retainReports;
    private readonly object _gate = new();

    public CrashReporter(
        DiagnosticsPaths paths,
        ILog log,
        string appVersion,
        Func<DateTimeOffset>? clock = null,
        int retainReports = 20)
    {
        this._paths = paths;
        this._log = log;
        this._appVersion = appVersion;
        this._clock = clock ?? (() => DateTimeOffset.UtcNow);
        this._retainReports = retainReports;
    }

    /// <summary>
    /// Records <paramref name="exception"/> as a crash originating from
    /// <paramref name="source"/> (e.g. "AppDomain", "UI", "Task"). Returns the
    /// path to the written report, or <c>null</c> if the report could not be
    /// persisted. Never throws — a crash handler must not itself crash.
    /// </summary>
    public string? Report(string source, Exception exception)
    {
        DateTimeOffset timestamp = this._clock();
        this._log.Write(LogLevel.Fatal, $"Unhandled exception from {source}", exception);

        lock (this._gate)
        {
            try
            {
                string path = this._paths.CrashFileFor(timestamp);
                File.WriteAllText(path, CrashReportFormat.Build(timestamp, this._appVersion, source, exception));
                this.Prune();
                return path;
            }
            catch
            {
                return null;
            }
        }
    }

    private void Prune()
    {
        try
        {
            IEnumerable<string> existing = Directory.EnumerateFiles(this._paths.CrashDirectory, "crash-*.log");
            foreach (string stale in FileRetention.SelectForDeletion(existing, Math.Max(1, this._retainReports)))
            {
                File.Delete(stale);
            }
        }
        catch
        {
            // Best-effort housekeeping.
        }
    }
}
