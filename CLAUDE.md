# CLAUDE.md - Sprint

Neutral, full conventions live in @AGENTS.md. This file is the always-loaded
summary. Design contract: `docs/DESIGN.md`. Migration checklist:
`docs/MIGRATION_INVENTORY.md`.

## Critical for agents

- The desktop migration is now a .NET 10 / Avalonia solution under `app/`:
  `Sprint.Desktop.Client`, `Sprint.Desktop.Api`, `Sprint.Games`, and
  `Sprint.Desktop.Tests`.
- The old Go/Wails + React desktop is retired. Do not add Wails setup/build
  instructions back unless this architecture is intentionally restored.
- Windows / PowerShell are the local defaults. The `Makefile` shells out through
  PowerShell.
- Prioritize `app/`. Do not change `api/`, `web/`, or shared packages unless a
  shared contract requires the consumer update.
- Do not install tools or dependencies unless asked.
- Design = Graphite from `docs/DESIGN.md`: flat near-black surfaces, ember
  `#FF6A00`, informational `#4F9CFF`, Inter UI text, Space Grotesk display text,
  and centralized tokens in `Graphite.cs` / component themes.

## Verify loop

Use the .NET SDK pinned by `global.json`:

- Build with warnings as errors:
  `dotnet build app/Sprint.Desktop.sln -warnaserror`
- Desktop tests:
  `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj`
- Visual smoke after Avalonia shell/layout/Graphite changes:
  `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter VisualSmokeTests`
- Run locally:
  `dotnet run --project app/Sprint.Desktop.Client/Sprint.Desktop.Client.csproj`
- Publish:
  `make build-app` (defaults to `RID=win-x64`, override with `RID=linux-x64`)

If a bare `dotnet` resolves to the x64 runtime-only install, use the x86 SDK:
`& 'C:\Program Files (x86)\dotnet\dotnet.exe'`.

## Module boundaries

- `app/Sprint.Desktop.Api` owns shared desktop/game contracts:
  `TelemetryFrame`, `ITelemetrySource`, telemetry health/freshness, and engineer
  command shapes. It must not reference UI or game-specific implementation.
- `app/Sprint.Games` owns game-specific paths, shared-memory names, binary
  layouts, parsers, and telemetry adapters. Le Mans Ultimate is implemented
  through parser, mapper, shared-memory provider, and `ITelemetrySource`.
- `app/Sprint.Desktop.Client` owns Avalonia UI, runtime composition, persistence,
  dash render/editor, hardware display pipeline, input binding UI, update checks,
  and Graphite controls/themes.
- `app/Sprint.Desktop.Tests` owns behavior tests at stable seams: contracts,
  runtime persistence, LMU parsing/mapping/source, telemetry engine, dash painter
  and editor, hardware fakes/RGB565, input binding, updates, shell, and visual
  smoke.

## Current state

- PRD #107 is implemented to the software parity gate recorded in
  `docs/MIGRATION_INVENTORY.md`: WS1-WS11 are done, with physical-device,
  live-game, signing, and product-decision items explicitly deferred.
- Real LMU telemetry support exists, but live verification still requires a
  running Le Mans Ultimate instance on a Windows machine.
- VoCore/USBD480 support has the .NET interfaces, fake-tested screen pipeline,
  RGB565 conversion, and WinUSB transport/driver classes. Physical USB testing
  remains hardware-gated.
- Input binding has the command model, persistence, listen-mode reducer, and
  keyboard fallback UI. Windows Raw Input physical-button capture remains
  deferred.
- The dash path uses `DashPainter`/SkiaSharp for thumbnails, previews, and screen
  frames. Richer old-editor details such as full widget-stack/theme-manager parity
  remain documented deferrals.
- Release packaging publishes self-contained single-file desktop binaries for
  Windows and Linux. Updates are check-and-notify/manual-download by decision;
  unattended self-replacement is deferred.

## Pointers

- @AGENTS.md - full command list, focus rules, conventions.
- `docs/MIGRATION_INVENTORY.md` - PRD #107 parity and deferral record.
- `docs/DESIGN.md` - Graphite implementation contract.
- `docs/SCREEN_PROTOCOLS.md` - VoCore / USBD480 / RGB565 protocol reference.
- `docs/DESKTOP_SMOKE.md` - manual desktop parity smoke script.
