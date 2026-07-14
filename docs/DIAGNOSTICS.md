# Desktop Diagnostics: Logging & Crash Reports

The desktop app (`app/Sprint.Desktop.Client`) writes a rolling activity log and,
on an unhandled exception, a standalone crash report. This is the foundation
issue #47 asks for: durable diagnostics before the product grows.

Everything here is dependency-free (no Serilog / `Microsoft.Extensions.Logging`),
so it adds nothing to the single-file publish.

## Where the files live

Under the same AppData root as the app's other user state:

```
%AppData%\Sprint\diagnostics\
  logs\      sprint-YYYYMMDD.log   (one file per UTC day, last 7 kept)
  crashes\   crash-YYYYMMDD-HHmmss-fff.log   (last 20 kept)
```

Tests point this at a throwaway temp root; the user's real AppData is never
touched by the suite.

## What gets recorded

- **Activity log** — timestamped, leveled lines
  (`2026-07-13T09:41:02.123Z [INFO ] message`). Startup/shutdown, corrupt-config
  fallbacks, failed update checks, and any warning/error with its exception.
- **Crash report** — written when an exception escapes the UI loop, the CLR
  (`AppDomain.UnhandledException`), or an unobserved `Task`. Contains app version,
  OS/arch/.NET build, the crash source, and the full exception dump. This is the
  artifact to attach to a bug report. The same event is mirrored into the activity
  log at `FATAL`.

## How it is wired

- `Program.Main` calls `AppDiagnostics.Install()` **first**, so logging and crash
  capture cover composition and the UI loop, then wraps the run loop to report a
  fatal UI exception before rethrowing.
- `AppDiagnostics` owns the single `FileLogger` + `CrashReporter` and installs the
  global CLR/Task handlers that live outside the composition graph.
- Feature code depends on the small `ILog` interface by constructor injection
  (`DesktopRuntime` receives `AppDiagnostics.Log` from `CompositionRoot`), not on
  the static holder. `NullLog.Instance` is the safe default for tests and any
  caller that does not care about logs.

## Extending it

- To log from a service, take an `ILog` in the constructor and wire it in
  `CompositionRoot`. Use `log.Info/Warn/Error`; pass the `Exception` overload so
  the stack trace is captured.
- Pure pieces (`LogFormat`, `CrashReportFormat`, `FileRetention`) are side-effect
  free and unit-tested in `DiagnosticsTests`; keep formatting/policy changes there.
