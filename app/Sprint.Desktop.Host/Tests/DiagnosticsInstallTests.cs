using System.Runtime.CompilerServices;
using Sprint.Desktop.Features.Diagnostics;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// Proves the host wiring for crash reporting (WEB_DESKTOP_CUTOVER item 1): Program.cs calls
/// <see cref="AppDiagnostics.Install"/> before anything else, which is supposed to hook the
/// process-wide <see cref="TaskScheduler.UnobservedTaskException"/> and
/// <see cref="AppDomain.UnhandledException"/> handlers into <see cref="CrashReporter"/>. The
/// existing Core-level test (<c>DiagnosticsTests.InstallWiresLoggerAndCrashReporterAndUninstallCleansUp</c>)
/// only proves <c>Crash.Report</c> works when called directly; it never proves the automatic
/// handlers actually fire. This test exercises the real <c>TaskScheduler.UnobservedTaskException</c>
/// path end to end, which is the part most likely to be silently missing. The
/// <c>AppDomain.UnhandledException</c> half cannot be exercised the same way: raising a genuine
/// unhandled exception on a thread terminates the process even with the handler installed, so it
/// would kill the test host rather than the app under test -- that half is covered by wiring +
/// code review only (Program.cs installs before any other startup work, exactly as
/// <see cref="AppDiagnostics.Install"/> hooks both handlers together).
/// </summary>
public sealed class DiagnosticsInstallTests
{
    [Fact]
    public async Task AnUnobservedTaskExceptionWritesACrashReportViaTheInstalledGlobalHandler()
    {
        string root = NewTempRoot();
        DiagnosticsPaths paths = new(root);
        try
        {
            using (AppDiagnostics.Install(paths))
            {
                ThrowInAnUnobservedTask();

                // TaskScheduler.UnobservedTaskException only fires once the faulted task's
                // finalizer runs and nobody ever observed its exception. GC timing is not under
                // the test's control, so force collection in a bounded retry loop instead of
                // asserting immediately.
                string[] crashFiles = [];
                for (int attempt = 0; attempt < 20 && crashFiles.Length == 0; attempt++)
                {
                    GC.Collect();
                    GC.WaitForPendingFinalizers();
                    GC.Collect();
                    await Task.Delay(50);
                    crashFiles = Directory.GetFiles(paths.CrashDirectory, "crash-*.log");
                }

                Assert.Single(crashFiles);
                string report = File.ReadAllText(crashFiles[0]);
                Assert.Contains("Source: Task", report);
                Assert.Contains("deliberately unobserved", report);
            }
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    // Isolated in its own non-inlined method so the faulted Task goes out of scope as soon as
    // this call returns, with no local in the test method itself keeping it (or its exception)
    // reachable/observed.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void ThrowInAnUnobservedTask()
    {
        _ = Task.Run(() => throw new InvalidOperationException("deliberately unobserved"));
    }

    private static string NewTempRoot()
    {
        string dir = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Host.Tests", "diagnostics", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }
}
