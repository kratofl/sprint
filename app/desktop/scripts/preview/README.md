# Desktop preview harness

Renders any desktop view in a plain browser, light or dark, without Electron or
the native host, so a UI change can be screenshotted and compared against the
Windows mockup (`docs/design/mockups/win.png`, `win-dark.png`).

Run everything from `app/desktop`.

```powershell
# 1. Build the renderer and write dist/preview.html
node scripts/preview/build-preview.mjs              # vite build + preview page
node scripts/preview/build-preview.mjs --skip-build # reuse the current dist/
node scripts/preview/build-preview.mjs --sample     # force the synthetic state

# 2. Screenshot a view (headless Edge, 1440×900 by default)
node scripts/preview/screenshot.mjs --view Devices --theme dark --out C:\Projects\sprint\output\devices-dark.png
node scripts/preview/screenshot.mjs --view Home --theme light --query "collapsed=1&palette=1" --out C:\...\home.png
```

You can also open `dist/preview.html?view=Settings&theme=dark` in Edge launched
with `--allow-file-access-from-files`.

## Query parameters

| Parameter | Effect |
| --- | --- |
| `view=<AppView>` | `Home`, `SessionPlanner`, `Analysis`, `Dashes`, `Devices`, `Setups`, `RaceEngineer`, `Settings`, `Help` |
| `theme=light\|dark` | Forces a theme; omitted follows the OS |
| `collapsed=1` | Navigation pane in compact (48px) mode |
| `palette=1` | Opens the command palette |
| `update=1` | Reports an available update (Settings dot + notification) |
| `frame=none` | Drops the live telemetry frame; dash previews render their no-data state |
| `import=offer` | The startup results scan finds four sessions, so the import prompt opens; otherwise every scan finds nothing new |
| `click=<css selector>` | After the view opens, clicks the first match (waits up to 2s for it). Repeat it to click several things in order, e.g. `click=.devices-list .list-row&click=.command-bar .button.subtle.destructive` selects a device and opens the remove dialog. URL-encode the selector if it contains `&`, `#` or `+` |

## How it works

- `preview-stub.js` defines `window.sprint` (the same surface `electron/preload.ts`
  exposes) from a static payload, before the app bundle loads. Commands are
  logged to the console and otherwise ignored; nothing updates live.
- Pages are opened through the app's own inputs (Alt+1…7, or a click on the pane
  item for Settings/Help), so production code has no preview-only paths.
- `screenshot.mjs` runs Edge through PowerShell `Start-Process -Wait` with a
  throwaway profile in `dist/`, and stops it by PID after 60s.

## State payloads

- `state.sample.json` (committed): synthetic but realistic — LMU telemetry,
  two devices, the shipped "Driver Focus" dash, three session plans, lap history
  and an analysis selection. Enough to fill every view.
- `state.local.json` (gitignored — it is your own data): a real `/api/state`
  capture. `build-preview.mjs` prefers it when present. Capture it with
  `node scripts/preview/capture-state.mjs [path\to\dotnet.exe]` after
  `dotnet build app/Sprint.Desktop.Host/Sprint.Desktop.Host.csproj -nodeReuse:false`.
  The script starts the host with its own bearer token, reads one state, asks it
  to shut down and kills it by PID if needed; run `dotnet build-server shutdown`
  afterwards.

## Known issue

The host's telemetry frame uses its C# field names (`car.fuelLiters`,
`car.fuelPerLapLiters`, `speedMetersPerSecond`, …) while `packages/dashboard`
reads `car.fuel`, `car.fuelPerLap`, `speedMS`. The Home and Dashes previews hand
the raw frame to `DashRenderer`, whose fuel widget then throws and unmounts the
whole app. Until that is fixed, add `frame=none` (Home renders first, so this
affects every view).
