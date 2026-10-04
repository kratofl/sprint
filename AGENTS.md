# Sprint Agent Guide

This is the neutral, agent-facing entrypoint for the Sprint repository. Keep it
short, current, and tool-agnostic. Deeper material lives in `docs/` (index:
`docs/README.md`) or package-local READMEs instead of expanding this file.

## Scope

- Stay inside this repository. Do not read, write, execute, or otherwise operate
  outside the project folder unless the user explicitly asks. This includes the
  user's home directory, global tool caches, shell profiles, credential stores,
  browser profiles, and system configuration.
- Do not install tools, CLIs, language servers, or other system-wide software.
  Do not run `make setup` unless the user explicitly asks for full dependency
  restore.
- Only install project dependencies through the project's package managers when
  needed for the apps, such as `pnpm install` or `dotnet restore`.
- Prefer targeted fixes over broad refactors unless the task requires structural
  change.
- Work with existing user changes. Do not revert unrelated edits or deleted
  files unless the user explicitly requests it.

## Local Machine Safety

- Treat the developer machine as out of scope. Do not inspect user home
  directories, shell history, SSH keys, cloud credentials, password stores,
  browser profiles, desktop files, downloads, or other personal/system
  locations.
- Do not read or print environment variables wholesale. Only inspect a specific
  variable when it is directly required for the task.
- Do not modify global shell profiles, PATH, registry settings, services,
  scheduled tasks, startup entries, certificate stores, Docker daemon settings,
  Git global config, npm/pnpm global config, or system package manager state
  unless the user explicitly asks.
- Do not run commands that contact production systems, deploy, publish packages,
  rotate secrets, send emails/messages, charge money, or mutate external
  services unless the user explicitly asks and the target is confirmed.
- Do not run destructive filesystem commands outside this repository. Inside the
  repo, prefer targeted deletes and explain them first unless they are routine
  generated artifacts.
- Do not use recursive deletes, force flags, or cleanup commands against
  computed paths unless the resolved absolute path has been checked and is
  inside the repo.
- Do not start background daemons, local servers, watchers, or GUI applications
  without telling the user what will run and how it will be stopped.
- Clean up every process started by an agent before finishing or after a failed,
  timed-out, or interrupted command. This includes child and orphaned `dotnet`,
  `testhost`, Node, browser, shell/helper, local server, watcher, and GUI
  processes. Verify that no task-owned hosts remain; only stop processes that
  can be tied to this repository and the current task, never unrelated user
  processes. If the user explicitly asked to leave a process running, name it
  and provide the exact stop command in the handoff.
- Do not download or execute scripts from the internet, including install
  snippets such as `irm ... | iex`, `curl ... | sh`, or remote PowerShell,
  unless the user explicitly approves that exact source and purpose.
- Do not commit, push, create PRs, publish releases, or comment on GitHub unless
  the user asks or the task explicitly involves GitHub collaboration.
- If a command needs elevated privileges, network access, system locations, or
  credentials, ask first and state the concrete reason.

## Default Focus

- Prioritize work in `app/`, especially the desktop app.
- Only change `api/` or `web/` when the user asks, or when a shared contract
  requires corresponding consumer updates.
- When shared DTOs, shared TypeScript types, or shared tokens change,
  update affected consumers or call out the follow-up explicitly.

## Repo Layout

- `app/desktop/`: the desktop app — Electron main process + a Vite/React
  renderer. Owns windows, the frameless title bar, native-host lifetime, and one
  offscreen browser per active dash output.
- `app/Sprint.Desktop.Host/`: headless .NET host the desktop app launches as a
  child process. Loopback HTTP with a per-launch bearer token; ships the presets.
- `app/Sprint.Desktop.Core/`: all native desktop logic — runtime persistence,
  telemetry engine, session planning, analysis, dash layout model, devices,
  hardware/USB, input, diagnostics, updates.
- `app/Sprint.Desktop.Api`, `app/Sprint.Contracts`, `app/Sprint.Games`: shared
  contracts and game adapters (see Source Of Truth).
- There is no native desktop UI. The Avalonia app and the Go/Wails app before it
  are both retired — do not reintroduce either.
- `api/`: .NET 10 (ASP.NET Core + HotChocolate) GraphQL API server. Persists to
  Postgres (relational) and InfluxDB (time-series telemetry).
- `web/`: Next.js frontend.
- `packages/types/`: shared TypeScript contracts.
- `packages/tokens/`: design tokens — `windows.css` (desktop), `macos.css` (desktop
  on macOS, overlaid on `windows.css`) and `web.css` (web).
- `packages/dashboard/`: the HTML/CSS/SVG dash renderer. One component drives
  the editor preview, the on-screen display, and the USB panel output.

## Source Of Truth

- `app/Sprint.Desktop.Api`: telemetry + engineer data contracts (`TelemetryFrame`, `ITelemetrySource`).
- `app/Sprint.Contracts`: shared cloud DTOs (auth/invite/session/setup/layout) used by
  both the API server and the desktop client; references `Sprint.Desktop.Api`.
- `app/Sprint.Games`: game adapter implementations against the desktop contract.
- `packages/types`: shared TypeScript contracts (desktop-mirror telemetry/engineer types).
- `packages/tokens`: design tokens (`windows.css`, `macos.css`, `web.css`).
- `api/Sprint.Api/Data` (`SprintDbContext`) + `api/Sprint.Api/Services`: API
  persistence ownership (Postgres relational; InfluxDB time-series).
- `web/schema.graphql`: committed GraphQL schema; source for web codegen (`make schema`).
- `app/Sprint.Desktop.Core/DesktopRuntime.cs`: desktop preset loading and local persistence.
- `app/Sprint.Desktop.Core/RuntimeCoordinator.cs`: the command surface the desktop
  UI drives. Every user action is a validated command here; the host serves it.
- `app/Sprint.Desktop.Host/Program.cs`: the HTTP surface (`/api/state`,
  `/api/commands`, frame intake, traces, logs, update checks).
- `app/desktop/src/bridge.ts`: the renderer's only data access. Narrows host
  JSON once; views never fetch.
- `packages/dashboard`: dash widget catalog, bindings, formatting, palette,
  alert types. The desktop editor reads these; it keeps no copies.

## Platform

- Develop on Windows or macOS. The `Makefile` runs recipes through PowerShell on
  Windows and `sh` elsewhere, so a recipe is one line both shells accept;
  anything shell-specific goes into `scripts/make-tasks.mjs`.
- Write local automation as Node scripts (`.mjs`). Shell examples run in both
  shells or name the one they need.
- The product is Windows-only where it touches the game or hardware: LMU
  telemetry, USB screens, raw input, desktop capture, the HUD overlay and the
  self-update script. On macOS the host builds, tests and runs; telemetry and
  USB screens report `Unsupported`. See `docs/operations/development.md`.
- Do not set NuGet/dotnet caches to repo-local paths. Use the normal user-level caches.
- Windows only: if `dotnet` resolves to `C:\Program Files\dotnet\dotnet.exe` and
  reports no SDKs, use the installed x86 SDK at
  `C:\Program Files (x86)\dotnet\dotnet.exe` for desktop test/build commands.

## Commands

- Install JS deps: `pnpm install`
- List targets: `make help`
- Start API: `make dev-api`
- Start web: `make dev-web`
- Start desktop: `make dev-app` (Vite + Electron; Electron launches the native host)
- Start the native host alone: `make dev-host` (no UI)
- Build API: `make build-api`
- Build web: `make build-web`
- Build desktop: `make build-app`
- Test API and desktop: `make test`
- Test API only: `make test-api`
- Test desktop only: `make test-app`
- Build desktop solution: `dotnet build app/Sprint.Desktop.slnx`
- Build desktop solution with warnings as errors:
  `dotnet build app/Sprint.Desktop.slnx -warnaserror`
- Build API solution: `dotnet build api/Sprint.Api.slnx`
- Export GraphQL schema: `make schema`
- Type-check / test the desktop app: `pnpm --filter @sprint/desktop type-check`,
  `pnpm --filter @sprint/desktop test`
- Preview / screenshot a desktop view without the app or host (from `app/desktop`):
  `node scripts/preview/build-preview.mjs`, then
  `node scripts/preview/screenshot.mjs --view Devices --theme dark --out <abs.png>`
- Type-check / test the dash renderer: `pnpm --filter @sprint/dashboard type-check`,
  `pnpm --filter @sprint/dashboard test`
- Native host tests: `dotnet test app/Sprint.Desktop.Host/Tests/Sprint.Desktop.Host.Tests.csproj`
- Lint: `make lint`
- Format: `make fmt`

Run the smallest relevant checks for your change set. Do not claim checks you
did not run.

`make lint-app` builds the desktop solution with warnings as errors and
type-checks both desktop TypeScript packages.

## Browser And Desktop Checks

- For frontend/browser testing and UI-flow debugging, use Playwright MCP.
- Do not claim desktop UI work is complete until you have looked at it rendered.
  The preview harness in `app/desktop/scripts/preview/` renders any view from a
  stubbed `window.sprint` (real or sample state), light or dark, in the Windows
  or the macOS look (`platform=mac`), and screenshots it with Electron (see its
  `README.md`).
- For dash rendering changes, render a preset with
  `packages/dashboard/scripts/render-check.tsx` at the panel size, screenshot it,
  and check it against `docs/internals/dash-rendering.md`: layout, alignment,
  clip direction, weights and colour — not the telemetry values.
- Before calling desktop UI work done, run the `test-sprint-desktop` skill
  (`.agents/skills/test-sprint-desktop/`). Real-app traps are in
  `docs/operations/development.md`.
- Launching the full app (`make dev-app`) starts Electron, Vite and the .NET host.
  Say so before running it, and make sure every one of those processes is gone
  afterwards.

## Module Boundaries

- `app/Sprint.Desktop.Api` owns shared desktop/game contracts: `TelemetryFrame`,
  `ITelemetrySource`, telemetry health/freshness, and engineer command shapes. It
  must not reference UI or game-specific implementation.
- `app/Sprint.Games` owns game-specific paths, shared-memory names, binary
  layouts, parsers, and telemetry adapters. Le Mans Ultimate is implemented
  through parser, mapper, shared-memory provider, and `ITelemetrySource`.
- `app/Sprint.Desktop.Core` owns native behaviour and must not reference any UI
  framework. It has no Avalonia or SkiaSharp dependency; keep it that way.
- `app/Sprint.Desktop.Host` is an adapter: HTTP in, Core calls, JSON out. Input
  validation lives at this boundary and in `RuntimeCoordinator`; code inward of
  it assumes clean data.
- `app/desktop` owns presentation only. Views render state and raise intent via
  `send(command)`; they hold local UI state (selection, drafts, open dialogs) but
  no business rules, and they never fetch. State arrives from one subscription
  in `App.tsx`.
- `packages/dashboard` is host-independent. It renders at an explicit pixel size
  (no viewport units), with HTML/CSS/SVG only (no canvas), and no continuously
  repainting animation — its output is captured and pushed to USB hardware.
- `app/Sprint.Desktop.Tests` owns behaviour tests at stable seams: contracts,
  runtime persistence, LMU parsing/mapping/source, telemetry engine, dash layout
  model, hardware fakes/RGB565, input binding, updates, session planning and
  analysis. `app/Sprint.Desktop.Host/Tests` covers the command surface and
  screen outputs.

## Architecture Notes

- The unified telemetry contract is the spine of the desktop app. Game-specific
  data is mapped into `Sprint.Desktop.Api`'s `TelemetryFrame` at the edge;
  downstream dash render, hardware, engineer, and UI consumers depend on that
  shared contract. Web surfaces use `packages/types`.
- Add a game by implementing a telemetry source in `app/Sprint.Games` against
  the `Sprint.Desktop.Api` contract and registering it in `GameProviders`.
- A new user-facing capability is usually three edits in this order: the Core
  behaviour, a validated `RuntimeCoordinator` command (or a focused host endpoint
  for large or async payloads), then the view that sends it. A button whose
  command the host does not handle is a bug, not a placeholder.
- The frame path is telemetry → dash DOM → Electron offscreen paint → raw BGRA →
  host → RGB565 → USB. No PNG/JPEG/base64 on that path; a busy consumer keeps
  only the latest frame.
- Enums cross the wire as names. When a host enum gains a member, the matching
  TypeScript union in `app/desktop/src/bridge.ts` must gain it too.

## UI Rules

- `docs/design/DESIGN.md` is the product design system; its MUST/NEVER rules
  are binding. The wheel dash rules are in `docs/internals/dash-rendering.md`.
- The desktop app wears the look of the OS it runs on. Windows (and Linux):
  Fluent (Mica window, 48px title bar, NavigationView, content layer,
  CommandBar, ContentDialog, acrylic flyouts; 4px controls, 8px cards), tokens
  `@sprint/tokens/windows.css`. macOS (macOS 27 HIG): full-height translucent
  sidebar, 52px toolbar carrying the page title and actions, 8px buttons, 14px
  cards, tokens `@sprint/tokens/macos.css` overlaid on `windows.css` under the
  same names. References: the Windows and macOS mockups in `docs/design/mockups/`.
- Electron passes the look as `?platform=mac|windows`; the renderer sets
  `<html data-platform>`. Mac-only shapes go in `app/desktop/src/styles.mac.css`,
  each rule under `:where([data-platform="mac"])`; views stay platform-neutral
  (on macOS the shell moves a `PageHeader`'s actions into the toolbar).
- The web app follows the web CI (Apple look, glass only on chrome) with
  `@sprint/tokens/web.css`.
- Only brand and status colors carry across platforms. Brand `#ff6a00` is
  `--brand-500`: the one primary button per view, the selection indicator,
  progress. Text on it is the dark `--on-brand`, never white. Buttons never glow.
- Light **and** dark ship everywhere and follow the OS (`prefers-color-scheme`,
  or `data-theme` on `<html>`).
- Use only the token custom properties (`--mica`, `--layer`, `--surface`,
  `--label*`, `--control-*`, `--brand-500`, …). Do not hardcode hex in
  `app/desktop` or `packages/dashboard`; a missing token goes into the token
  file for both themes, in `windows.css` and `macos.css` alike
  (`app/desktop/src/macTokens.test.ts` enforces parity). The Electron main
  process cannot read CSS, so it repeats `--mica`/`--label` (Windows caption
  buttons) and the solid `--sidebar` (macOS Reduce Transparency) in
  `app/desktop/electron/windowChrome.ts`.
- Desktop views use the shared primitives in `app/desktop/src/styles.css`
  (`.button` + `primary`/`subtle`/`destructive`, `.card`, `.kpi`, `.infobar`,
  `.list-row`, `.menu-flyout`, `.segmented`, `.meter`, `.empty-state`,
  `.content-dialog`, …) and `PageHeader` from `app/desktop/src/shell/` instead
  of restyling their own.
- `packages/dashboard` is hardware output, not app UI; it keeps its own palette.
- Keep screens dense, scannable, keyboard-operable, and explicit about focus,
  hover, selected, disabled, loading, empty, and destructive states.

### Typography

`docs/design/DESIGN.md` is the authority here; this is a summary of it, not a
second opinion. If the two ever disagree, `docs/design/DESIGN.md` wins.

- Desktop UI is the OS system font, nothing bundled (`--font-text`,
  `--font-display`): Segoe UI Variable from `windows.css`, SF from `macos.css`.
  13px/20px base, 24px Display page titles, 14px semibold card titles, 12px
  captions; on macOS the 17px toolbar title names the page and captions are 11px.
- Web UI uses the system stack from `web.css`.
- Inter is **not** an app UI face. The desktop bundles and declares it in
  `app/desktop/src/styles.css` only because the dash renderer names it for
  wheel labels.
- Saira Semi Condensed is used **only** for numeric values on the rendered wheel
  instrument.
- Brand lettering is artwork, not a font choice.
- Continuously changing values use tabular figures (`.tabular`).
- The dash faces live in `app/desktop/src/fonts/`; without their `@font-face`
  rules every dash readout silently falls back to `system-ui`.

## Docs

`docs/README.md` indexes everything. The repo is written by agents, so docs are
for agents first; human-facing docs stay at the root `README.md`.

- `docs/internals/` — decisions and their reasons, cross-component constraints,
  and traps the source does not reveal. Start with `overview.md` and
  `glossary.md`; read the note for the area you are changing.
- `docs/operations/` — development/verification, diagnostics, release,
  deployment runbooks.
- `docs/design/` — the design system, tokens, component previews, mockups.
- Package-local notes: `app/README.md`, `api/README.md`, and package
  `README.md` files when present.

Rules for writing them:

- Most changes need no doc change. Add to `docs/internals/` only what a
  maintainer would get wrong without it; link to source instead of copying it.
- No feature tours, field lists, control-flow narration, file catalogs or PR
  summaries.
- When a decision changes, rewrite or remove the old text — never append a
  second account.
- No plans, specs, checklists or status trackers in the repo. Work in progress
  lives in GitHub issues; settled decisions move into `docs/internals/`.
- Moving or renaming a doc means updating every reference to it, including code
  comments.

This file is the single source of truth for agent instructions in this repo.
Tool-specific companion files such as `CLAUDE.md` exist only to point here and
must stay free of rules, commands, conventions, and status — a second copy of
the guidance drifts, and then the stale copy gets followed. Put new instructions
here instead. Retired agent-doc trees and Copilot wrappers are not present in
the current working tree. Do not add references to them unless those files are
restored.

## GitHub Collaboration

- When working on a GitHub issue, add useful progress notes to the issue
  comments.
- Comment implementation decisions, open questions, blockers, assumptions, or
  other context that would help the next human or agent continue the work.
- If there is an assigned or active PR for the same work, add relevant notes
  there as well when they matter for review or merge decisions.
- Keep comments high-signal. Do not spam routine status updates that add no
  durable value.
- Use `gh` CLI for GitHub issue and PR comments unless the user requests a
  different tool.
