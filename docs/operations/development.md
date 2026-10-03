# Development

Commands live in [`AGENTS.md`](../../AGENTS.md#commands) and `make help`. This page covers how to
verify work and the traps that are not visible from the source.

## Machine constraints

- The dev PC is also the gaming PC. Run one building agent at a time, build with
  `-nodeReuse:false`, and afterwards stop the build servers you started
  (`dotnet build-server shutdown`) and every process you launched, by PID. Never kill by name.
- If `dotnet` reports no SDKs, use `C:\Program Files (x86)\dotnet\dotnet.exe`.
- A stale `testhost` holding DLLs breaks the next build; find the one your run started and stop it.

## Verifying desktop UI

1. **Preview harness** (fast, no Electron, no host) — `app/desktop/scripts/preview/README.md`.
   Renders any view light or dark from real or sample state and screenshots it in headless Edge.
   Compare against `docs/design/mockups/win.png` / `win-dark.png`.
2. **Real Electron** at least once per change that touches the bridge, preload or main process. The
   preview stubs `window.sprint`, so it cannot catch a broken bridge.

Running the real app:

- Unset `ELECTRON_RUN_AS_NODE` (agent shells set it; Electron then runs as plain Node).
- Never point a dev host at the live `%AppData%\Sprint`. Copy it to a scratch folder inside the repo
  (drop `devices.json` so nothing opens a USB screen) and set `SPRINT_DESKTOP_DATA_ROOT`; Electron
  passes its environment to the host.
- Give Electron `--user-data-dir=<scratch>` and `--remote-debugging-port=<port>`, then drive the window
  over CDP.
- `make dev-app` starts Vite, Electron and the host. Say so before running it, and make sure all three
  are gone afterwards.

## Electron traps

- The preload must be CommonJS (`electron/preload.cts` → `dist-electron/preload.cjs`). An ES-module
  preload in a sandboxed window fails silently: `window.sprint` is undefined and every view shows an
  empty state, not an error.
- The host log does not record commands, so a quiet log does not prove a command arrived.
- Host JSON uses C# names; `app/desktop/src/telemetryFrame.ts` converts frames to the dash renderer's
  shape once, from `bridge.ts`. Views never see host shapes.

## Verifying the dash renderer

From `packages/dashboard`:

```powershell
pnpm exec tsx scripts/render-check.tsx <preset.json> <fonts-dir> <out.html>
```

Presets are in `app/Sprint.Desktop.Host/presets/dash/`; fonts in `app/desktop/src/fonts/`. Open the
HTML at the panel size in headless Edge and screenshot it. Check layout, alignment, clip direction,
weights and color against [dash rendering](../internals/dash-rendering.md) — not the telemetry values.

## Hardware

USB screens cannot be verified without the panel. A fake-driver pass (`FakeScreenDriver`) is not
physical-screen verification; say which one you ran. Device traps are in
[screen protocols](../internals/screen-protocols.md).
