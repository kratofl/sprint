# Desktop preview harness

Renders any desktop view without the app or the native host, light or dark, in
the brand look (Windows and Linux) or the macOS look, so a UI change can be
screenshotted and checked against `docs/design/DESIGN.md` and, for macOS, the
`macos-light.html` / `macos-dark.html` mockups. Works the same on Windows and
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

## Design mockups

A mockup is three options, A, B and C, built from the app's own components, primitives and tokens
and shown where they will live: on their page inside the real app shell (sidebar, toolbar, light
trails; a `PageHeader`'s actions land in the toolbar as on a real page), or as one of the app's
windows. Never hand-written HTML with its own CSS: that drifts from the design system.

1. Write `src/mockups/<name>.tsx` (gitignored, type-checked with the app). It default-exports a
   `Mockup` (`src/mockup/mockup.ts`): `{ view: 'Analysis', variants: { A, B, C } }`, or
   `{ window: 'pitwall' | 'designer' | 'hud', variants }`. Each option is a component; compose the
   real views and components, and put CSS for a genuinely new shape next to it
   (`src/mockups/<name>.css`, scoped under one class, tokens only).
2. Shoot it: `node scripts/preview/mockup.mjs <name>` — builds the preview, screenshots A/B/C in
   dark and light into `.dev/mockups/<name>/`, and writes `sheet.html` comparing them. Options:
   `--size 1600,900` (the pit wall), `--query "platform=mac&click=..."` (the Mac look, open a
   dialog first), `--clip x,y,w,h` (the part that differs, also shown at full size),
   `--themes dark`, `--skip-build`, `--dist dist-<slug>`.
3. Read every PNG, then show the sheet: its contents as `html` to T3's `html_preview`, then
   `html_render`. Each picture fits the width; tapping one shows it at full size.

Once an option is picked, build it into the real view and delete the mockup file. Only the preview
build mounts mockups (`?mockup=<name>&variant=A`, built with `--mode preview`); every other build
drops them.

## Query parameters

| Parameter | Effect |
| --- | --- |
| `view=<AppView>` | `Home`, `SessionPlanner`, `OnTrack`, `Analysis`, `Setups`, `Dashes`, `Devices`, `RaceEngineer`, `LiveLink`, `Settings`, `Help` |
| `theme=light\|dark` | Forces a theme; omitted follows the OS |
| `platform=mac\|windows` | The look Electron would pick on that OS; omitted is the brand look (`windows`), which Linux wears too |
| `collapsed=1` | The sidebar collapsed to its 56px icon rail; with `platform=mac` it is hidden |
| `palette=1` | Opens the command palette |
| `update=1` | Reports an available update (Settings dot + notification) |
| `frame=none` | Drops the live telemetry frame; dash previews render their no-data state |
| `telemetry=unsupported` | The LMU source reports `Unsupported` with no frame, as on a Mac. The Overview's game card reads "Not supported here", the sidebar's status row says so too, and Help's Checks give the reason |
| `import=offer` | The startup results scan finds four sessions, so the import prompt opens; otherwise every scan finds nothing new |
| `sprintWeb=1` | Turns the Sprint web feature flag on: the account row, the setup and the Sprint web group in Settings. Off by default, as the app ships. Any of `account`, `setup`, `servers`, `storage`, `live` or `discord` turns it on as well |
| `firstRun=1` / `firstRun=missing` | The first-run setup instead of the app, with Le Mans Ultimate found (`1`) or not (`missing`); with `platform=mac` it has no game or laps step. Its laps step finds the four sessions of `import=offer`. `click=.first-run .button.primary` goes on a step (repeat it), so three of them reach the laps step |
| `account=signed-in` | The desktop is signed in to Sprint; otherwise the account row reads "Sign in" |
| `setup=first-run` | Sprint web setup has not run yet, so it opens on its welcome step. Any password signs in except `wrong` |
| `servers=none` | The setup's network scan finds no server; otherwise it finds one at `192.168.1.20` |
| `storage=Both` / `storage=Remote` | Where data lives (default: this PC only). `Both` also reports a last upload in Settings |
| `live=<status>` | The live uplink's status in Settings: `Off`, `WaitingForGame`, `Connecting`, `Streaming`, `Reconnecting`. Default: `WaitingForGame` when signed in with `storage=Both`/`Remote`, otherwise `Off` |
| `link=<phase>` | The live link's phase on the Live link page: `Off`, `Preparing`, `Inviting`, `Joining`, `Connecting`, `Connected`, `Interrupted`, `Failed`, `Ended`. `linkRole=Engineer` shows the engineer's side where both exist (default: the driver's) |
| `found=<id,id>` | The USB scan finds these catalog ids plugged in and not added yet, so Add device shows them under "Plugged in now", e.g. `found=bavarian-omega-v2-pro`. Default: nothing new |
| `discord=1` / `discord=fail` | The server offers Discord sign-in. "Continue with Discord" then waits for the browser until Cancel (`1`), or fails at once with a server error (`fail`) |
| `training=on` / `training=arrange` / `training=none` | On track: training (`on`), the HUD up to arrange on the monitor (`arrange`), or no lap was ever recorded (`none`). Default: laps listed with two friends' laps, Ada's picked, HUD off; every lap with a line gets a made-up one, so `click=.ontrack-laps .list-row` opens a lap page and `click=.command-bar .button` opens compare. `chase=none` picks no lap. `fullscreen=1` adds the exclusive-fullscreen warning |
| `hud=<windowId>` | Mounts one training HUD window instead of the app: `delta`, `throttle`, `brake`, `speed`, `steering` or `gear`, with a braking zone ahead of the car, or `arrange` for the palette shown while arranging. `hudArranging=1` shows a window being arranged (edge, ×, grip). Screenshot it at its window size: `--size 240,92` for the delta, `--size 380,160` for a chart, `--size 520,56` for the palette |
| `setups=none` / `setups=unavailable` | Setups: an empty setup folder (`none`) or no game found (`unavailable`). Default: twelve made-up setups over four cars and tracks; `click=.setups-row` opens Race v3 (three versions, `click=.setups-version:nth-child(2)` opens an older one), `click=.command-bar .button` opens compare |
| `analysis=list` | Analysis: the sessions list (seven sessions over four cars and tracks, with an imported race and a friend's shared lap). Without it the sample opens a Spa practice session in three runs (out of the garage and back) with tyres and fuel per lap; run 1 carries "Race v3", run 3 "Quali", run 2 none; every lap but lap 4 has a made-up line. `click=.analysis-lap-open` opens lap 1 on its own page (a made-up loop for the map, steering, gear and what the car got, car settings with TC, brake bias and ABS changed mid-lap, two of your notes, and the car's own readings for the car card and its charts: `click=.analysis-car-corner.fl .analysis-car-value:nth-of-type(3)` puts the brake temperatures on the page, `click=.analysis-add-chart .button` opens Add chart, `focus=.analysis-chart-stack@0.5` puts the charts' cursor mid-lap, `car=none` leaves the car's readings out, as on a lap recorded before they were kept), and adding `click=.analysis-lap-actions [aria-haspopup=menu]` opens Compare with… (then `click=.analysis-pick-row:last-of-type` compares with Ada's shared lap, which came with two notes and a migration change; the Quali laps carry no settings, like an older lap); on the lap page `click=.analysis-pin.note` opens a note's bubble (`.analysis-pin.note.other:last-of-type` one of Ada's) and `click=.analysis-chart-svg@0.62` opens the note editor at that place; `click=[role=radio]:nth-child(2)` with `analysis=list` shows Shared; `focus=.analysis-times-dot` shows the chart's tooltip, `click=.analysis-run-setup.empty` opens the run setup picker (it opens upward near the window bottom); on Setups, Race v3 and Quali have made-up "On track" figures |
| `designer=<dashId>` | Mounts the dash designer window for that dash instead of the app, as Electron opens it from the Dashes page (`state.sample.json` has `default`, `sprint-race`, `hotlap`, …). Screenshot it at a window size, e.g. the default `1440,900`; `click=` works in it, e.g. `click=.designer-node-main` selects the first row in the sidebar (on `default`'s Driving page, the Top bar group; its Right column is a stack, so selecting it shows the layer tabs), `click=.designer-dock .button.primary` opens the widget library |
| `pitwall=main` / `pitwall=page:<id>` / `pitwall=tile:<id>` | Mounts a pit wall window instead of the app, linked as the engineer to a made-up Spa race (twelve cars, our #63 third at lap 34, a car alongside on the radar) with the default layout: pages `race`, `car`, `traces`. Screenshot it at `--size 1600,900`. `click=[role=tab]:nth-child(2)` opens the Car page, `click=.pw-bar .button.subtle` Edit layout, then `click=[data-tile-id=race-relative]` selects a tile. `pitwallStack=1` stacks Relative, Radar and Damage on the Race page, `pitwallAway=car` puts the Car page in its own window, `plan=none` shares no plan |
| `click=<css selector>` | After the view opens, clicks the first match (waits up to 2s for it). Repeat it to click several things in order, e.g. `click=.devices-tile&click=.command-bar .button.destructive` opens a device and then its remove dialog. A trailing `@<fraction>` clicks that far across the element instead, e.g. `click=.analysis-chart-svg@0.62` for a place along a chart. URL-encode the selector if it contains `&`, `#` or `+` |
| `focus=<css selector>` | After the clicks, focuses the first match and points at it (a `pointerover`), for what only focus or hover shows, e.g. a chart's tooltip. A trailing `@<fraction>` points that far across it, e.g. `focus=.analysis-chart-stack@0.5`. The hidden screenshot window never has focus, so focus events alone never fire there |

## How it works

- `preview-stub.js` defines `window.sprint` (the same surface `electron/preload.ts`
  exposes) from a static payload, before the app bundle loads. Commands are
  logged to the console and otherwise ignored; nothing updates live.
- Pages are opened through the app's own inputs (Alt+1…8, ⌘1…8 with
  `platform=mac`, or a click on the pane item for Settings/Help), so production
  code has no preview-only paths (design mockups aside, which only the preview build has). `palette=1` presses Ctrl+K or ⌘K the same way.
- `screenshot.mjs` starts Electron on `screenshot-electron.mjs`, which loads the
  page in a hidden offscreen window at `--size` with a device scale factor of 1,
  so the PNG is exactly that size. Electron gets a throwaway profile
  (`<dist>/electron-profile-<pid>`, deleted afterwards). Its process tree is
  stopped by its own PID after 60s, and swept after a normal exit, through
  `scripts/process-tree.mjs` — never by name.
- `screenshot.mjs` (like `dev.mjs`) drops `ELECTRON_RUN_AS_NODE` from Electron's
  environment; agent shells set it, and Electron would then start as plain Node.
- The preview has no window backdrop, so macOS vibrancy does not show: the sidebar
  draws its `--sidebar` token colour instead. The OS caption buttons are missing
  too; in Electron they sit at the right end of the toolbar.

## State payloads

- `state.sample.json` (committed): synthetic but realistic — LMU telemetry,
  two devices, the shipped "Driver Focus" dash plus six variants filed under every kind of category (built-in, your own, none), three session plans, lap history
  and an analysis selection. Enough to fill every view. Its `dashRefitLosses`
  (what each screen size would leave out of each dash; the host computes it, the stub
  refits nothing) is empty, because no sample dash loses a widget on any size. To see
  the "N widgets don't fit" warnings, put e.g. `{"default": {"portrait-480x800": 3}}` in.
- `state.local.json` (gitignored — it is your own data): a real `/api/state`
  capture. `build-preview.mjs` prefers it when present. Capture it with
  `node scripts/preview/capture-state.mjs [path/to/dotnet]` after
  `dotnet build app/Sprint.Desktop.Host/Sprint.Desktop.Host.csproj -nodeReuse:false`.
  The script starts the host with its own bearer token, reads one state, asks it
  to shut down and stops its process tree by PID if needed; run
  `dotnet build-server shutdown` afterwards.
