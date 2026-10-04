# Desktop diagnostics

Where to look when the desktop app misbehaves. Code: `app/Sprint.Desktop.Core/Features/Diagnostics/`,
installed by `AppDiagnostics.Install()` at the top of `app/Sprint.Desktop.Host/Program.cs`.

## Files

```
%AppData%\Sprint\diagnostics\
  logs\      sprint-YYYYMMDD.log              one file per UTC day, last 7 kept
  crashes\   crash-YYYYMMDD-HHmmss-fff.log    last 20 kept
```

A host started with `SPRINT_DESKTOP_DATA_ROOT` set writes under that root instead. Tests and agent
runs use this so the user's real AppData is never touched — run the host against a copy of the data,
never the live folder.

Check the logs first for hardware problems: screen enumeration, open, first frame and every state
change are logged (see [screen protocols](../internals/screen-protocols.md#troubleshooting)).

## Live access

- `GET /api/diagnostics/logs?minLevel=&text=` returns filtered in-memory entries.
- The `diagnostics.setLogLevel` command (`POST /api/commands`) changes the level at runtime.
- `/api/state` carries the current `logLevel` and log `directory` under `diagnostics`.
- In the app: Help & diagnostics shows the same stream with level and text filters.

The host needs its per-launch bearer token; Electron holds it, so drive a running app through the
renderer (CDP) rather than calling the host directly.

## Rules

- One logger for the process (`AppDiagnostics.Log`), passed by constructor as `ILog`. `NullLog.Instance`
  is the default for tests. No Serilog or `Microsoft.Extensions.Logging` — nothing extra ships.
- Pass the `Exception` overload so the stack trace is captured.
- Unhandled and unobserved-task exceptions write a crash report and mirror it into the log at `FATAL`.
- Formatting and retention (`LogFormat`, `CrashReportFormat`, `FileRetention`) are pure and tested in
  `DiagnosticsTests`.
