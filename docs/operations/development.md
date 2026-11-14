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
- Sprint web (accounts, sync, the server live stream) is off by default behind a feature flag. Turn
  it on for a dev run with the environment variable `Sprint__Features__SprintWeb=true`; Electron
  passes it to the host.

## Rust toolchain

The dash renderer (`packages/dashboard/renderer`) is Rust, and the host's build and the desktop
app's Vite config both compile it (`scripts/build-dash-renderer.mjs`), so nothing desktop builds
without it. On a new machine install [rustup](https://rustup.rs) (on Windows with the MSVC linker,
i.e. Visual Studio Build Tools with C++, which rustup-init offers), then add the targets:

```sh
rustup target add wasm32-unknown-unknown   # the editor, dash stills, browser displays
rustup target add i686-pc-windows-msvc     # Windows, only when the working dotnet is the x86 SDK
```

The native target must match the process the host runs as, not the machine: under the x86 SDK the
host builds and tests as 32-bit and needs `i686-pc-windows-msvc`, while `make build-app` publishes
`win-x64` (`x86_64-pc-windows-msvc`, rustup's default on 64-bit Windows). cargo is found on `PATH`
or in `~/.cargo/bin`, so a shell started before the install still works. Install nothing on a
user's behalf; when it is missing, say which command to run.

What a missing piece looks like:

- No cargo: the build stops with `build-dash-renderer: error: the Rust toolchain is required ...`
  (an MSBuild error in `dotnet build`, a thrown error in Vite).
- No target: `build-dash-renderer: error: the Rust target <triple> is not installed. Run: rustup
  target add <triple>`.
- A host built without its library, or for the other architecture: every dash screen shows red and
  black stripes and reads `Faulted`, `the dash renderer library (sprint_dash.dll) could not be
  loaded into this X86 process ...`.

The first build of each target compiles the crate in release with full LTO and takes a while;
after that cargo has nothing to do. `make clean` deletes the crate's `target` folder.

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
  says "Sprint" ([why](../internals/overview.md#one-renderer-two-looks)). It is rebuilt when
  the Electron version or `resources/icon.icns` changes; deleting `app/desktop/.dev/` is always safe.
- The Mac icons (`resources/icon-mac.png`, `resources/icon.icns`) are regenerated from the brand
  artwork with `node app/desktop/scripts/icons/make-mac-icon.mjs` (macOS only, needs `iconutil`);
  commit the outputs.
- `--query "platform=mac&telemetry=unsupported"` previews what a Mac actually shows.

## Verifying desktop UI

1. **Preview harness** (fast, no app, no host) — `app/desktop/scripts/preview/README.md`.
   Renders any view light or dark from real or sample state and screenshots it with Electron.
   Check the brand look against `docs/design/DESIGN.md` (it is the web app's system), and the
   macOS look (`--query platform=mac`) against `macos-light.html` / `macos-dark.html`. A shell or
   primitive change is checked in both looks: the Mac look inherits every shared rule it does not
   override.
2. **Real Electron** at least once per change that touches the bridge, preload or main process. The
   preview stubs `window.sprint`, so it cannot catch a broken bridge.

Running the real app:

- Agent shells set `ELECTRON_RUN_AS_NODE`, which makes Electron run as plain Node. `dev.mjs` and
  `screenshot.mjs` drop it; unset it yourself when you start Electron any other way.
- A dev run never uses the installed app's data folder (`%AppData%\Sprint`, `~/.config/Sprint` on
  macOS). `make dev-app` and `make dev-host` keep everything, the host's data and Electron's profile,
  in `app/desktop/.dev/data` of the checkout they run from, so worktrees never share state.
  `make reset-dev-data` deletes it. To run on real data, copy it to a scratch folder inside the repo
  (drop `devices.json` so nothing opens a USB screen) and set `SPRINT_DESKTOP_DATA_ROOT` to it;
  Electron moves its profile there too and passes its environment to the host.
- An agent runs the app with `make agent-app` (`app/desktop/scripts/agent-app.mjs`), not
  `make dev-app`: nothing shows on screen, it starts on a fresh data folder in
  `app/desktop/.dev/agent-runs/` (`DATA=<dir>` copies one in, `FILE=<recording>` replays telemetry),
  and it prints the folder and its CDP port. Drive and capture it with `app/desktop/scripts/cdp.mjs`
  and stop it with `agent-app.mjs stop <folder>`, which ends its whole process tree and deletes the
  folder. Several runs can go at once; each has its own data folder, because Chromium locks the
  profile in it.
- An agent run renders the main window offscreen (`SPRINT_DESKTOP_HIDDEN=1`, dev builds only): a
  merely hidden window paints nothing and every screenshot hangs. Offscreen there are no OS caption
  buttons, so a check of the window chrome itself still needs a visible `make dev-app`.
- Started any other way, give Electron `SPRINT_DESKTOP_DATA_ROOT` and
  `--remote-debugging-port=<port>`, then drive the window over CDP.
- `make dev-app` starts Vite, Electron and the host. Say so before running it, and make sure all three
  are gone afterwards.
- In a dev run, ⌘⌥⇧L / Ctrl+Alt+Shift+L reopens the main window in the other look, brand or macOS (macOS:
  Developer menu). Off its own OS a look has no vibrancy and no native caption buttons, so it matches
  the real chrome only on that OS.

## Electron traps

- The preload must be CommonJS (`electron/preload.cts` → `dist-electron/preload.cjs`). An ES-module
  preload in a sandboxed window fails silently: `window.sprint` is undefined and every view shows an
  empty state, not an error.
- The host log does not record commands, so a quiet log does not prove a command arrived.
- Host JSON uses C# names. The views read the `@sprint/types` mirror, which `parseHostFrame`
  (`packages/dashboard/src/hostFrame.ts`) makes once, in `bridge.ts`; views never see host shapes.
  The dash renderer is the exception: it reads the host's telemetry JSON as it is.

## Verifying the dash renderer

From `packages/dashboard/renderer`:

```sh
cargo run --release --example render -- --dash ../../../app/Sprint.Desktop.Host/presets/dash/default.json <out.png> [--page <id>] [--style panels|grid|bars] [--size 800x480]
```

It draws one page of a layout (the first, unless `--page`) against a fixed mid-race frame; the
style overrides the layout's own, so one layout can be checked in every style. Render at the panel
size and read the PNG. Check layout, alignment, clip direction, weights and color against
[dash rendering](../internals/dash-rendering.md) — not the telemetry values. `cargo test` covers the
display list; `--ops <case.json>` prints it for a case file.

## Hardware

USB screens cannot be verified without the panel. A fake-driver pass (`FakeScreenDriver`) is not
physical-screen verification; say which one you ran. Device traps are in
[screen protocols](../internals/screen-protocols.md).
