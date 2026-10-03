# Web desktop cutover

## Accepted direction

Replace the Avalonia desktop UI and Skia dashboard painter with a bundled React
application and shared HTML/CSS/SVG dashboard renderer. Household's
`feature/complete-budget-slice` branch is the visual reference. Keep Sprint's
colors. Compatibility with previous branch data and the retired UI is not a
requirement. Do not publish or commit without Luca's instruction.

The USB dashboard must be browser-rendered pixels, not a native imitation of the
web preview. The same dashboard component drives the editor, browser display,
and offscreen browser output.

## Architecture

- `app/desktop`: Electron owns windows, a bundled Vite/React frontend, native host
  lifetime, and one offscreen browser per active dashboard output.
- `packages/dashboard`: host-independent HTML/CSS/SVG widgets, layout editing,
  presentation bindings, and serialized render inputs.
- `app/Sprint.Desktop.Core`: native game telemetry, persistence, planning,
  analysis, command handling, input, RGB565 conversion, and USB transport.
- `app/Sprint.Desktop.Host`: headless loopback HTTP adapter for native services.

Electron launches the native host with a random bearer token. The host binds an
ephemeral loopback port and emits a readiness record on stdout. Credentials stay
in the main process. Sandboxed renderer windows use a restricted preload bridge.
All UI assets and fonts ship locally; the app works offline.

The render path is telemetry -> shared dashboard DOM -> Electron offscreen paint
-> raw BGRA bytes -> bounded native frame exchange -> orientation/RGB565 -> USB.
Do not encode PNG/JPEG or base64 on the live path. A busy consumer retains only
the latest frame. Dashboard rendering continues when the main window is hidden
or minimized. Native desktop-capture output stays independent of dashboard DOM.

## Work order and ownership

1. Native host agent: extract headless services, state/commands, native frame
   reception, device reconciliation, clean shutdown, focused native tests.
2. Web shell agent: reproduce Household's shell and component geometry, wire
   native state and commands, implement every current feature page.
3. Dashboard agent: shared renderer, all catalog widgets and bindings, pages,
   idle/alerts/themes, layout editing, focused state and binding tests.
4. Parent: Electron launch/preload/offscreen output, dependency/build integration,
   packaging, cross-process checks, visual review, documentation and final audit.

Implementation agents use GPT-5.6 Luna at low effort at Luca's request. Existing
Astra investigations made no changes and started no processes. The only
pre-existing untracked work at start was `.claude/`; leave it untouched.

## Required workflow coverage

- Home/live telemetry, connection/stale states, targets and session status.
- Session planning: create/edit/save/delete/select plans and activate/deactivate.
- Analysis: history, trace selection/comparison, imported and shared laps.
- Dashes: create/edit/duplicate/delete/default, screen profiles, pages including
  idle, widget properties and stacks, alerts, preview, save and discard.
- Devices: catalog/add/remove, enable/disable, purpose, layout, orientation,
  dimensions, offsets/margins, refresh rate, capture region, test pattern,
  reconnect and duplicate physical-device handling.
- Setups, engineer staging/push/revert, quick messages and sharing/auth flows.
- Settings, input bindings and capture, keyboard commands, updates and diagnostics.
- Window controls, close/shutdown and error recovery.

Inspect current source for authoritative behavior. Older migration inventories
and README summaries omit recent planning, analysis, sharing, and input work.
Record a missing function as unfinished; do not replace it with a decorative UI.

## Verification and cutover gates

1. Native and TypeScript builds pass; test protocol validation and bounded frame
   delivery, dashboard bindings/layout mutations, and real command behavior.
2. Inspect rendered Household-style pages at expanded/collapsed sidebar widths,
   relevant states, and keyboard focus. Use Playwright interaction checks and
   saved screenshots for the new UI.
3. Feed a real browser-rendered frame through the native RGB565 path into a fake
   driver; verify size, colors, rotation and latest-frame behavior.
4. Measure frame cadence, latency, CPU/GPU/memory and backlog under sustained
   telemetry. Exercise main-window minimize, multiple outputs, reconnect and
   renderer/host failures. Do not promise negligible overhead without measurement.
5. Verify actual USB output when hardware is available. Fake-driver success is
   not physical-screen verification.
6. Update run/build/test/release entry points, package the browser + self-contained
   native host + fonts/presets, and verify the packaged launch path.
7. Retire old presentation code and obsolete visual tests after replacement
   coverage is demonstrated. Keep native behavioral tests.

## Status

Updated 2026-09-23. The Avalonia client is deleted; `app/` has no Avalonia or
SkiaSharp reference. Everything marked done was verified by running it.

### Done and verified

- Solution builds with `-warnaserror`; `Sprint.Desktop.Tests` 855/855,
  `Sprint.Desktop.Host.Tests` 74/74; `packages/dashboard` 78/78;
  `@sprint/desktop` 30/30 (renderer tests run from `src/**/*.test.ts`).
- All native logic lives in `Sprint.Desktop.Core`; the host is an HTTP adapter.
- Dev environment: `make dev-app`, `dev-host`, `build-app`, `test-app`,
  `lint-app`, `types`; release workflow rebuilt for the Electron package.
- Frameless window with native caption overlay (Snap Layouts kept), real app
  icon and name, no OS menu.
- Telemetry status end to end: all 8 link states + the source's reason; the
  host applies freshness so `Stale` reaches the client.
- Dash renderer: 22/22 widgets, shrink-to-fit and clip direction checked against
  the old renderer's PNGs in `docs/design/dash-reference/`.
- USB output: browser frame -> host -> RGB565 -> WinUSB driver, latest-frame
  wins, reconcile on device changes. Fake-driver tested; the real driver reports
  "not found" cleanly with no panel. Physical output not yet seen.

### Resume here

Paused 2026-09-23 at Luca's request. The host agent for "persistence safety +
screen purposes" was interrupted mid-task: concurrency-safe `SaveJson` (lock +
atomic replace), flag-display / lap-timer output, rear-view capture output
(`screens[].source`), `dash.page.next`/`prev`, and the devices view-mode
settings field. Its edits in `app/Sprint.Desktop.Core` / `Host` may be partial.
First step on resume: build and test to see what landed, then finish it. Run one
building agent at a time and shut build servers down afterwards.

### Parity checklist (from the audit against the deleted app)

Background behaviour the old MainWindow wired and the host does not yet:
- [ ] Lap history recording from live telemetry (`LapHistoryRecorder`)
- [ ] Plan auto-start and segment tracking (`SessionPlannerService.Ingest`)
- [ ] Remember last-seen game/car/track for plan prefill
- [ ] Plan target delivery to the wheel delta and dash (`PlanTargetDelivery`)
- [ ] Trace disk-budget pruning at startup (`LapTraceRetention`)
- [ ] LMU results import (startup offer + manual)
- [x] Crash reporting (`AppDiagnostics.Install`)
- [ ] Hardware input: wheel buttons -> commands; keyboard `key:X` bindings

Screen output:
- [ ] Flag-display and lap-timer purposes produce output (currently blank)
- [ ] Rear-view mirror output from desktop capture
- [ ] Dash page cycling (`dash.page.next`/`prev`); today only page 1 shows
- [ ] Set-delta-reference from a button
- [x] Parameter-change alerts on the wheel
- [x] Driver name/number on the wheel
- [x] Adopt detected panel resolution
- [ ] Guard against two devices driving one USB screen
- [ ] Rotation re-orients the capture region

UI:
- [x] Command palette (Ctrl+K), Alt+1..7, toasts, sidebar persistence,
      update notices, external links, account row (always "Sign in": the host
      publishes no signed-in state)
- [x] Devices: status pill + performance, live preview, custom wheel form,
      gallery view, aspect-locked capture region
- [ ] Devices gallery/list choice persists (needs a `settings.update` field)
- [x] Dash editor: drag/resize, grid, zoom, keyboard, theme presets, preview
      states, duplicate-to-size, assigned-to
- [x] Analysis: hover crosshair + readout
- [x] Home launchpad, setup delete + undo, Help status fix
- [ ] Home deep links to a specific dash/device/plan
- [x] One-click update install (packaged app only; refused in dev)
- [ ] Live Compare HUD overlay windows + target picker
- [ ] Plan targets editable (`plan.setTarget` / `plan.clearTarget`)
- [ ] Planner: prefill, suggestions, Quick detection, planner settings
- [ ] Analysis: game filter, date range, track search, artwork
- [ ] Lap file import/export
- [ ] Per-device input bindings with listen/capture
- [ ] Setup A/B compare (needs a host command)
- [ ] Dash defaults

### Not gaps

Debug-only tools (`#if DEBUG` DiagnosticsWindow, debug pages), Avalonia-specific
visuals (Mica), and window-position persistence (the old app never had it).
