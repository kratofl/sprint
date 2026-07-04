# CLAUDE.md — Sprint

Neutral, full conventions live in @AGENTS.md (read it — it is the source of
truth). This file is the always-loaded summary. Design contract: `docs/DESIGN.md`.
**Migration parity checklist: `docs/MIGRATION_INVENTORY.md` (read before touching `app/`).**

## Critical for agents (read first)

- **The desktop app is mid-migration to .NET 10 / Avalonia.** `app/` is now the
  `Sprint.Desktop.sln` solution (Client / Api / Games / Tests). The old Go/Wails +
  React desktop has been removed. Track the work via PRD **issue #107** and the
  parity matrix in `docs/MIGRATION_INVENTORY.md`.
- **Windows / PowerShell only.** The `Makefile` shells out to PowerShell. A Bash
  tool exists for POSIX scripts, but commands the user runs are PowerShell.
- **`app/` (.NET solution) + `packages/` (web UI/tokens/types) + `web/` + `api/`**
  are the surfaces. Do NOT change `api/` or `web/` unless asked or a shared
  contract requires it. The desktop app is the active focus.
- **Do not install tools/deps** unless asked.
- **Design = `docs/DESIGN.md`** (the Graphite flat system: near-black surfaces
  `#070707/#0D0D0D/#131313/#1B1B1B`, ember accent `#FF6A00`, `#4F9CFF`
  informational, radius 10, 40px titlebar). **Typography = `Inter` (UI) +
  `Space Grotesk` (display)** per the maintainer's `docs/Sprint.fig`; both fonts
  are bundled under `Sprint.Desktop.Client/Assets/Fonts` and exposed via
  `Graphite.FontStack` / `Graphite.DisplayFontStack`. `Graphite.cs` matches
  `docs/DESIGN.md` — do NOT reintroduce the old `IBM Plex` framing or a "palette
  contradiction" (that belonged to the `feat/figma-flat-ui-theme` branch). Keep
  matching `docs/Sprint.fig` for full component fidelity; do NOT hardcode hex
  outside `Graphite.cs`.

## Verify loop (run after edits)

The .NET solution lives at `app/Sprint.Desktop.sln`:

- **Restore / build:** `dotnet restore app/Sprint.Desktop.sln` →
  `dotnet build app/Sprint.Desktop.sln` (or `make lint-app` = build with
  `-warnaserror`, the real gate).
- **Desktop tests:** `make test-app` (= `dotnet test
  app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj`) — **xunit** (migrated in
  WS2: Microsoft.NET.Test.Sdk + xunit + xunit.runner.visualstudio).
- **Run the app:** `make dev-app` (= `dotnet run --project
  app/Sprint.Desktop.Client/Sprint.Desktop.Client.csproj`).
- **Publish:** `make build-app` → `app/build/bin`.
- **Go API (still used by api/web):** `make test-api`.
- **SDK gotcha (verified 2026-06-29):** the .NET **10.0.301** SDK is installed,
  but under the **x86** host `C:\Program Files (x86)\dotnet` — the x64 `dotnet` on
  PATH has only a 6.0.5 runtime, so a bare `dotnet build` reports "no SDK found."
  Use the x86 host explicitly, e.g.
  `& 'C:\Program Files (x86)\dotnet\dotnet.exe' build app/Sprint.Desktop.sln`.
  Build + `make test-app` are **verified green (0 warnings/0 errors, 4/4 tests)**.
  No `global.json` pins the SDK yet (WS2). If the command sandbox hides the SDK,
  run it unsandboxed in the worktree.

## Solution layout & module boundaries

- `app/Sprint.Desktop.Api` — shared desktop/game contract (`TelemetryFrame`,
  `ITelemetrySource`). **No** game paths, shared-memory names, binary layouts, or
  Avalonia/UI types.
- `app/Sprint.Games` — the ONLY place that knows game-specific paths/structs/
  parsers. Adapters implement the `Api` contract. `DemoTelemetrySource` is the
  dev/test adapter; Le Mans Ultimate is the first real target (currently a
  **placeholder** — constants only, no reader).
- `app/Sprint.Desktop.Client` — Avalonia shell, feature pages, dash render/editor,
  runtime persistence (`DesktopRuntime.cs`), `Graphite.cs` design layer.
- `app/Sprint.Desktop.Tests` — behavior tests at stable seams.

## Known state / gotchas (see inventory for the full matrix)

- `MainWindow.cs` (~986 lines) is a **monolithic** composition root that rebuilds
  the whole control tree per render — no DI, no MVVM/XAML view separation yet.
  Prefer presenter/view-model seams; don't grow `MainWindow`.
- Telemetry is **demo-only**; a single 500ms UI-thread `DispatcherTimer` (UI label
  says "60Hz" — that's cosmetic, not real). Real adapters need a background reader
  + cancellation off the UI thread.
- The shared contract has **no** disconnected/stale/invalid/health state yet — UI
  fakes a static "SIM DEMO / green dot". This blocks honest failure-state UI.
- `System.Text.Json` silently drops unknown members, so `DashLayout` / `AppSettings`
  / `CatalogDevice` **lose preset richness** (idlePage, alerts, per-widget config,
  device offsets/bindings, `dashEditorUI`) on load → lossy round-trips until the
  full shapes are modeled.
- Hardware (VoCore/USBD480/WinUSB/RGB565), input/joystick binding, delta, capture,
  updater, and the dash painter are **not yet ported** — Windows interop work.

## Pointers

- @AGENTS.md — full command list, focus rules, conventions (source of truth).
- `docs/MIGRATION_INVENTORY.md` — parity matrix (old → .NET status → workstream →
  priority → acceptance criteria) + per-workstream deferrals + open questions.
- `docs/DESIGN.md` — Graphite design contract (canonical UI system).
- `docs/Sprint.fig` — the maintainer's Figma file (visual source of truth for the
  componentized UI).
- `docs/SCREEN_PROTOCOLS.md` — WinUSB / VoCore / USBD480 / RGB565 protocol
  reference (still valid domain knowledge; reimplement in .NET).
- PRD **issue #107** — `gh issue view 107` (+ `--comments` for the design &
  architecture addenda).
- `handoffs/LATEST.md` — local-only recent-session context; read at session start
  if present (gitignored).
