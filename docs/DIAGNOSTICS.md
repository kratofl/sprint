# Desktop Diagnostics: Logging & Crash Reports

The desktop app's native host (`app/Sprint.Desktop.Host`, backed by
`Sprint.Desktop.Core`'s `Features/Diagnostics`) writes a rolling activity log and,
on an unhandled exception, a standalone crash report. This is the foundation
issue #47 asks for: durable diagnostics before the product grows.

Everything here is dependency-free (no Serilog / `Microsoft.Extensions.Logging`),
so it adds nothing to the published host.

## Where the files live

`DiagnosticsPaths` (`Sprint.Desktop.Core/Features/Diagnostics/DiagnosticsPaths.cs`)
resolves the root, rooted beside the runtime's other user state:

```
%AppData%\Sprint\diagnostics\
  logs\      sprint-YYYYMMDD.log   (one file per UTC day, last 7 kept)
  crashes\   crash-YYYYMMDD-HHmmss-fff.log   (last 20 kept)
```

Tests, and any host launched with `SPRINT_DESKTOP_DATA_ROOT` set (used for a
throwaway temp root), get their own diagnostics directory under that root instead
— the user's real AppData is never touched by the suite.

## What gets recorded

- **Activity log** — timestamped, leveled lines
  (`2026-07-13T09:41:02.123Z [INFO ] message`). Startup/shutdown, corrupt-config
  fallbacks, command handling, persistence, screen enumeration/connect/send
  activity, failed update checks, and any warning/error with its exception.
- **Crash report** — `CrashReporter` (`Sprint.Desktop.Core/Features/Diagnostics`)
  writes a standalone report containing app version, OS/arch/.NET build, the
  crash source, and the full exception dump, and mirrors the same event into the
  activity log at `FATAL`. It is designed to run behind `AppDomain.UnhandledException`
  and unobserved-`Task` handlers via `AppDiagnostics.Install()`, but
  `Sprint.Desktop.Host/Program.cs` does not currently call `Install()` — the host
  wires its own `FileLogger`/`LiveLogStore` directly (see below) without the
  crash handlers, so no crash report is written today. `AppDiagnostics` and
  `CrashReporter` are exercised directly in `DiagnosticsTests`.

## How it is wired

- `Sprint.Desktop.Host/Program.cs` builds `DiagnosticsPaths`, a `FileLogger`, and
  a `LiveLogStore` first, then combines them into one `CompositeLog` so every
  record reaches both the on-disk log and the in-memory stream the app reads.
  `DesktopRuntime` and the rest of the composition receive that `ILog` by
  constructor injection, not through a static holder — `NullLog.Instance` is the
  safe default for tests and any caller that does not care about logs.
- The host exposes the live stream and current settings over HTTP:
  `GET /api/diagnostics/logs` (query: `minLevel`, `text`) returns filtered
  entries, and the `diagnostics.setLogLevel` command (via `POST /api/commands`)
  changes the `LiveLogStore`'s minimum level at runtime. `/api/state` includes
  the current `logLevel` and log `directory` under `diagnostics`.
- In the app, **Help & diagnostics** (`app/desktop/src/views/HelpView.tsx`) is the
  log viewer: a level filter, a text filter, a refresh button, and the resolved
  log directory, backed by `HelpDiagnostics.ts`'s typed narrowing of the host's
  JSON.

## Extending it

- To log from a service, take an `ILog` in the constructor and wire it through
  `Sprint.Desktop.Host/Program.cs`. Use `log.Info/Warn/Error`; pass the
  `Exception` overload so the stack trace is captured.
- Pure pieces (`LogFormat`, `CrashReportFormat`, `FileRetention`) are side-effect
  free and unit-tested in `DiagnosticsTests`; keep formatting/policy changes there.
