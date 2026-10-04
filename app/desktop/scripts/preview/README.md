# Desktop preview harness

Renders any desktop view without the app or the native host, light or dark, in
the Windows or the macOS look, so a UI change can be screenshotted and compared
against the mockups: `docs/design/mockups/win.png` / `win-dark.png` for Windows,
`macos-light.html` / `macos-dark.html` for macOS. Works the same on Windows and
macOS.

Run everything from `app/desktop`. The commands are the same in PowerShell and sh;
`--out` takes an absolute path.

```sh
# 1. Build the renderer and write dist/preview.html
node scripts/preview/build-preview.mjs              # vite build + preview page
node scripts/preview/build-preview.mjs --skip-build # reuse the current dist/
node scripts/preview/build-preview.mjs --sample     # force the synthetic state

# 2. Screenshot a view (Electron, 1440×900 by default)
node scripts/preview/screenshot.mjs --view Devices --theme dark --out <abs>/devices-dark.png
node scripts/preview/screenshot.mjs --view Home --theme light --query "collapsed=1&palette=1" --out <abs>/home.png
node scripts/preview/screenshot.mjs --view Devices --theme dark --query "platform=mac" --out <abs>/devices-mac-dark.png
```

You can also open `dist/preview.html?view=Settings&theme=dark` in a Chromium
browser launched with `--allow-file-access-from-files`.

## Query parameters

| Parameter | Effect |
| --- | --- |
| `view=<AppView>` | `Home`, `SessionPlanner`, `Analysis`, `Dashes`, `Devices`, `Setups`, `RaceEngineer`, `Settings`, `Help` |
| `theme=light\|dark` | Forces a theme; omitted follows the OS |
| `platform=mac\|windows` | The look Electron would pick on that OS; omitted is Windows. Linux has no look of its own |
| `collapsed=1` | Navigation pane in compact (48px) mode; with `platform=mac` the sidebar is hidden |
| `palette=1` | Opens the command palette |
| `update=1` | Reports an available update (Settings dot + notification) |
| `frame=none` | Drops the live telemetry frame; dash previews render their no-data state |
| `telemetry=unsupported` | The LMU source reports `Unsupported` with no frame, as on a Mac. Windows look shows the Home InfoBar; with `platform=mac` it shows only in the toolbar indicator and on Help |
| `import=offer` | The startup results scan finds four sessions, so the import prompt opens; otherwise every scan finds nothing new |
| `click=<css selector>` | After the view opens, clicks the first match (waits up to 2s for it). Repeat it to click several things in order, e.g. `click=.devices-list .list-row&click=.command-bar .button.subtle.destructive` selects a device and opens the remove dialog. URL-encode the selector if it contains `&`, `#` or `+` |

## How it works

- `preview-stub.js` defines `window.sprint` (the same surface `electron/preload.ts`
  exposes) from a static payload, before the app bundle loads. Commands are
  logged to the console and otherwise ignored; nothing updates live.
- Pages are opened through the app's own inputs (Alt+1…7, ⌘1…7 with
  `platform=mac`, or a click on the pane item for Settings/Help), so production
  code has no preview-only paths. `palette=1` presses Ctrl+K or ⌘K the same way.
- `screenshot.mjs` starts Electron on `screenshot-electron.mjs`, which loads the
  page in a hidden offscreen window at `--size` with a device scale factor of 1,
  so the PNG is exactly that size. Electron gets a throwaway profile
  (`<dist>/electron-profile-<pid>`, deleted afterwards). Its process tree is
  stopped by its own PID after 60s, and swept after a normal exit, through
  `scripts/process-tree.mjs` — never by name.
- `screenshot.mjs` (like `dev.mjs`) drops `ELECTRON_RUN_AS_NODE` from Electron's
  environment; agent shells set it, and Electron would then start as plain Node.
- The preview has no window backdrop, so neither Mica nor macOS vibrancy shows:
  the title bar and sidebar draw their token colour instead (`--mica`; `--sidebar`
  on macOS).

## State payloads

- `state.sample.json` (committed): synthetic but realistic — LMU telemetry,
  two devices, the shipped "Driver Focus" dash, three session plans, lap history
  and an analysis selection. Enough to fill every view.
- `state.local.json` (gitignored — it is your own data): a real `/api/state`
  capture. `build-preview.mjs` prefers it when present. Capture it with
  `node scripts/preview/capture-state.mjs [path/to/dotnet]` after
  `dotnet build app/Sprint.Desktop.Host/Sprint.Desktop.Host.csproj -nodeReuse:false`.
  The script starts the host with its own bearer token, reads one state, asks it
  to shut down and stops its process tree by PID if needed; run
  `dotnet build-server shutdown` afterwards.

## Known issue

The host's telemetry frame uses its C# field names (`car.fuelLiters`,
`car.fuelPerLapLiters`, `speedMetersPerSecond`, …) while `packages/dashboard`
reads `car.fuel`, `car.fuelPerLap`, `speedMS`. The Home and Dashes previews hand
the raw frame to `DashRenderer`, whose fuel widget then throws and unmounts the
whole app. Until that is fixed, add `frame=none` (Home renders first, so this
affects every view).
