# Development

Commands live in [`AGENTS.md`](../../AGENTS.md#commands) and `make help`. This page covers how to
verify work and the traps that are not visible from the source.

## Machine constraints

- The Windows dev PC is also the gaming PC. Run one building agent at a time, build with
  `-nodeReuse:false`, and afterwards stop the build servers you started
  (`dotnet build-server shutdown`) and every process you launched, by PID. Never kill by name.
- Windows: if `dotnet` reports no SDKs, use `C:\Program Files (x86)\dotnet\dotnet.exe`.
- A stale `testhost` holding DLLs breaks the next build; find the one your run started and stop it.
- `make build-app` publishes for this machine's RID (`scripts/make-tasks.mjs rid`): `win-x64`,
  `osx-arm64`/`osx-x64`, `linux-x64`. An x64 Node under Rosetta yields `osx-x64`; pass `RID=` then.

## Developing on macOS

The host builds, tests and runs on macOS, and the app wears the macOS look. Game and hardware
integration is Windows-only, and each piece degrades instead of failing:

- LMU telemetry reports `Unsupported` in the toolbar status and Help.
- VoCore/USBD480 screens report `Unsupported` in Devices; the publisher never renders them, so no
  rear-view capture runs.
- Raw input, desktop-region capture, the live-compare HUD overlay and the self-update install are
  no-ops or refused.
- Tests that call a Windows API show as skipped (`[WindowsFact]`, see
  `app/Sprint.Desktop.Tests/README.md`).
- The live data folder is `~/.config/Sprint` (.NET's `ApplicationData`), not `%AppData%\Sprint`.
- `make dev-app` launches Electron from `app/desktop/.dev/Sprint.app` (gitignored) so the Dock
  says "Sprint" ([why](../internals/overview.md#one-renderer-two-native-looks)). It is rebuilt when
  the Electron version or `resources/icon.icns` changes; deleting `app/desktop/.dev/` is always safe.
- The Mac icons (`resources/icon-mac.png`, `resources/icon.icns`) are regenerated from the brand
  artwork with `node app/desktop/scripts/icons/make-mac-icon.mjs` (macOS only, needs `iconutil`);
  commit the outputs.
- `--query "platform=mac&telemetry=unsupported"` previews what a Mac actually shows.

## Verifying desktop UI

1. **Preview harness** (fast, no app, no host) — `app/desktop/scripts/preview/README.md`.
   Renders any view light or dark from real or sample state and screenshots it with Electron.
   Compare against `docs/design/mockups/win.png` / `win-dark.png`, and the macOS look
   (`--query platform=mac`) against `macos-light.html` / `macos-dark.html`. A shell or primitive
   change is checked in both looks.
2. **Real Electron** at least once per change that touches the bridge, preload or main process. The
   preview stubs `window.sprint`, so it cannot catch a broken bridge.

Running the real app:

- Agent shells set `ELECTRON_RUN_AS_NODE`, which makes Electron run as plain Node. `dev.mjs` and
  `screenshot.mjs` drop it; unset it yourself when you start Electron any other way.
- Never point a dev host at the live data folder (`%AppData%\Sprint`, `~/.config/Sprint` on macOS).
  Copy it to a scratch folder inside the repo
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

```sh
pnpm exec tsx scripts/render-check.tsx <preset.json> <fonts-dir> <out.html>
```

Presets are in `app/Sprint.Desktop.Host/presets/dash/`; fonts in `app/desktop/src/fonts/`. Open the
HTML at the panel size in a browser and screenshot it (Playwright MCP, or headless Edge on Windows);
the preview harness's `screenshot.mjs` only captures the desktop preview page. Check layout, alignment, clip direction,
weights and color against [dash rendering](../internals/dash-rendering.md) — not the telemetry values.

## Hardware

USB screens cannot be verified without the panel. A fake-driver pass (`FakeScreenDriver`) is not
physical-screen verification; say which one you ran. Device traps are in
[screen protocols](../internals/screen-protocols.md).
