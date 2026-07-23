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

- **Activity log** — timestamped, leveled lines (including `DEBUG` in the desktop
  process)
  (`2026-07-13T09:41:02.123Z [INFO ] message`). Startup/shutdown, corrupt-config
  fallbacks, UI actions, persistence, screen enumeration/connect/send activity,
  failed update checks, and any warning/error with its exception.
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

## Development tools

Debug builds expose **Settings → Development → Open development tools**. The
separate window intentionally hosts independent modules side by side so they can
run at the same time:

- a global game-state override with presets and editable telemetry/conditions;
- real screen output, including per-screen and all-screen test patterns;
- the filtered live log.

When simulation is enabled, every dashboard consumer—including physical screens
set to `Dashboard`—uses the same simulated frame. A per-screen color pattern can
remain active at the same time, and future test modules can be added without
turning the tool into a screen-specific simulator.

`DevelopmentToolModuleHost` is the small composition seam for this workspace:
each module contributes a view while the host handles simultaneous column layout.
The simulation and screen panes have local scrolling, and the window supports the
desktop shell's canonical `1120×720` minimum.

The window, settings entry, and simulator are wrapped in `#if DEBUG`. They are
not compiled into Release/production builds. Durable file logging and crash
reports remain available in production.

## Extending it

- To log from a service, take an `ILog` in the constructor and wire it in
  `CompositionRoot`. Use `log.Info/Warn/Error`; pass the `Exception` overload so
  the stack trace is captured.
- Pure pieces (`LogFormat`, `CrashReportFormat`, `FileRetention`) are side-effect
  free and unit-tested in `DiagnosticsTests`; keep formatting/policy changes there.
