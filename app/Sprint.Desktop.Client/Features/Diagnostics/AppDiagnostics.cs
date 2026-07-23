using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Process-wide diagnostics entry point. Owns the single file logger and crash
/// reporter and installs the global "last resort" exception handlers that live
/// outside the composition graph (the CLR and TaskScheduler raise these, not our
/// code). Feature code should still receive an <see cref="ILog"/> by constructor
/// injection; <see cref="Log"/> exists only for the handful of cross-cutting call
/// sites (startup, global handlers) that have no graph to inject through.
/// </summary>
public static class AppDiagnostics
{
    private static readonly object InstallGate = new();
    private static bool _installed;

    private static UnhandledExceptionEventHandler? _domainHandler;
    private static EventHandler<UnobservedTaskExceptionEventArgs>? _taskHandler;

    /// <summary>The active process logger, or a no-op sink before <see cref="Install"/>.</summary>
    public static ILog Log { get; private set; } = NullLog.Instance;

    /// <summary>Bounded live stream consumed by the diagnostics window.</summary>
    public static LiveLogStore? LiveLog { get; private set; }

    /// <summary>The active crash reporter, available once <see cref="Install"/> has run.</summary>
    public static CrashReporter? Crash { get; private set; }

    /// <summary>Resolved diagnostics directories for the current process.</summary>
    public static DiagnosticsPaths? Paths { get; private set; }

    /// <summary>
    /// Creates the logger + crash reporter and hooks CLR/Task global handlers.
    /// Idempotent: a second call is a no-op. Returns an <see cref="IDisposable"/>
    /// that unhooks the handlers (used by tests; the app leaves them installed for
    /// the whole process lifetime).
    /// </summary>
    public static IDisposable Install(DiagnosticsPaths? paths = null, LogLevel minimumLevel = LogLevel.Debug)
    {
        lock (InstallGate)
        {
            if (_installed)
            {
                return new Uninstaller(() => { });
            }

            var resolvedPaths = paths ?? DiagnosticsPaths.CreateDefault();
            var fileLogger = new FileLogger(resolvedPaths, minimumLevel);
            var liveLog = new LiveLogStore();
            var logger = new CompositeLog(fileLogger, liveLog);
            var crash = new CrashReporter(resolvedPaths, logger, BuildInfo.Version);

            Log = logger;
            LiveLog = liveLog;
            Crash = crash;
            Paths = resolvedPaths;

            _domainHandler = (_, args) =>
            {
                if (args.ExceptionObject is Exception ex)
                {
                    crash.Report("AppDomain", ex);
                }
            };
            _taskHandler = (_, args) =>
            {
                crash.Report("Task", args.Exception);
                args.SetObserved();
            };

            AppDomain.CurrentDomain.UnhandledException += _domainHandler;
            TaskScheduler.UnobservedTaskException += _taskHandler;

            _installed = true;
            return new Uninstaller(Uninstall);
        }
    }

    private static void Uninstall()
    {
        lock (InstallGate)
        {
            if (!_installed)
            {
                return;
            }

            if (_domainHandler is not null)
            {
                AppDomain.CurrentDomain.UnhandledException -= _domainHandler;
            }

            if (_taskHandler is not null)
            {
                TaskScheduler.UnobservedTaskException -= _taskHandler;
            }

            _domainHandler = null;
            _taskHandler = null;
            Crash = null;
            LiveLog = null;
            Paths = null;
            Log = NullLog.Instance;
            _installed = false;
        }
    }

    private sealed class Uninstaller(Action dispose) : IDisposable
    {
        private Action? _dispose = dispose;

        public void Dispose()
        {
            var action = Interlocked.Exchange(ref _dispose, null);
            action?.Invoke();
        }
    }
}
