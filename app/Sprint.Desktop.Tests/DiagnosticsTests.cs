using Sprint.Desktop.Features.Diagnostics;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Behavior tests for the diagnostics seam (#47): line formatting, crash-report
/// content, file-sink rolling + retention, and path resolution. Everything runs
/// against a throwaway temp root, never the user's AppData.
/// </summary>
public sealed class DiagnosticsTests
{
    private static readonly DateTimeOffset FixedTime =
        new(2026, 7, 13, 9, 41, 2, 123, TimeSpan.Zero);

    [Fact]
    public void LogLineHasSortableUtcTimestampLevelAndMessage()
    {
        var line = LogFormat.Line(FixedTime, LogLevel.Info, "engine started", null);

        Assert.Equal("2026-07-13T09:41:02.123Z [INFO ] engine started", line);
    }

    [Fact]
    public void LogLineCollapsesEmbeddedNewlinesInMessage()
    {
        var line = LogFormat.Line(FixedTime, LogLevel.Warn, "line one\nline two", null);

        // The message stays on a single physical line so read-back never mistakes
        // a wrapped message for a second record.
        Assert.Single(line.Split('\n'));
        Assert.Contains("line one line two", line);
    }

    [Fact]
    public void LogLineAppendsExceptionOnIndentedContinuationLines()
    {
        var line = LogFormat.Line(FixedTime, LogLevel.Error, "boom", new InvalidOperationException("nope"));
        var physical = line.Split('\n');

        Assert.StartsWith("2026-07-13T09:41:02.123Z [ERROR] boom", physical[0]);
        Assert.Contains(physical, l => l.StartsWith("    ") && l.Contains("InvalidOperationException"));
    }

    [Fact]
    public void FileLoggerWritesRecordsAtOrAboveMinimumLevelOnly()
    {
        var root = NewRoot();
        try
        {
            var paths = new DiagnosticsPaths(root);
            var logger = new FileLogger(paths, LogLevel.Warn, () => FixedTime);

            logger.Info("skipped");
            logger.Warn("kept");

            var contents = File.ReadAllText(paths.LogFileFor(FixedTime));
            Assert.DoesNotContain("skipped", contents);
            Assert.Contains("kept", contents);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void FileLoggerRollsToADailyFile()
    {
        var root = NewRoot();
        try
        {
            var day1 = FixedTime;
            var day2 = FixedTime.AddDays(1);
            var clockTime = day1;

            var paths = new DiagnosticsPaths(root);
            var logger = new FileLogger(paths, LogLevel.Info, () => clockTime);

            logger.Info("first day");
            clockTime = day2;
            logger.Info("second day");

            Assert.Contains("first day", File.ReadAllText(paths.LogFileFor(day1)));
            Assert.Contains("second day", File.ReadAllText(paths.LogFileFor(day2)));
            Assert.NotEqual(paths.LogFileFor(day1), paths.LogFileFor(day2));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void RetentionKeepsOnlyTheMostRecentFiles()
    {
        var files = new[] { "sprint-20260101.log", "sprint-20260103.log", "sprint-20260102.log" };

        var deleted = FileRetention.SelectForDeletion(files, keep: 2);

        Assert.Equal(new[] { "sprint-20260101.log" }, deleted);
    }

    [Fact]
    public void FileLoggerPrunesOldDayFilesOnConstruction()
    {
        var root = NewRoot();
        try
        {
            var logDir = Path.Combine(root, "logs");
            Directory.CreateDirectory(logDir);
            foreach (var day in new[] { "20260101", "20260102", "20260103" })
            {
                File.WriteAllText(Path.Combine(logDir, $"sprint-{day}.log"), "old");
            }

            var paths = new DiagnosticsPaths(root);
            _ = new FileLogger(paths, retainDays: 2);

            var remaining = Directory.GetFiles(logDir, "sprint-*.log").Select(Path.GetFileName).OrderBy(n => n).ToArray();
            Assert.Equal(new[] { "sprint-20260102.log", "sprint-20260103.log" }, remaining);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void CrashReporterWritesReportWithContextAndLogsFatal()
    {
        var root = NewRoot();
        try
        {
            var paths = new DiagnosticsPaths(root);
            var log = new FileLogger(paths, LogLevel.Info, () => FixedTime);
            var reporter = new CrashReporter(paths, log, "9.9.9", () => FixedTime);

            var path = reporter.Report("UI", new InvalidOperationException("kaboom"));

            Assert.NotNull(path);
            var report = File.ReadAllText(path!);
            Assert.Contains("Sprint Desktop crash report", report);
            Assert.Contains("App version: 9.9.9", report);
            Assert.Contains("Source: UI", report);
            Assert.Contains("InvalidOperationException", report);
            Assert.Contains("kaboom", report);

            // The crash is also mirrored into the timeline log at FATAL.
            Assert.Contains("[FATAL]", File.ReadAllText(paths.LogFileFor(FixedTime)));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void InstallWiresLoggerAndCrashReporterAndUninstallCleansUp()
    {
        var root = NewRoot();
        try
        {
            using (AppDiagnostics.Install(new DiagnosticsPaths(root)))
            {
                Assert.IsType<FileLogger>(AppDiagnostics.Log);
                Assert.NotNull(AppDiagnostics.Crash);

                var path = AppDiagnostics.Crash!.Report("UI", new InvalidOperationException("wired"));
                Assert.NotNull(path);
                Assert.True(File.Exists(path!));
            }

            // After dispose the process is left with the safe no-op sink again so a
            // test never leaves global handlers or a live file logger installed.
            Assert.Same(NullLog.Instance, AppDiagnostics.Log);
            Assert.Null(AppDiagnostics.Crash);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static string NewRoot() => TestEnv.NewTempDataRoot();
}
