---
name: test-sprint-desktop
description: Use when verifying a desktop UI change, before calling desktop work done, or before a release — walks every view and state through the preview harness, then once through real Electron.
---

## Test the Sprint desktop app

Two passes. The preview harness is fast and covers layout and states; it stubs `window.sprint`, so it
cannot catch a broken bridge, preload or host command. Run the real-Electron pass at least once for
any change that sends a command or touches `electron/`, `bridge.ts` or the host.

How to run each: `app/desktop/scripts/preview/README.md` and `docs/operations/development.md`.
Read every screenshot you take. Rules to check against: `docs/design/DESIGN.md`.

### 1. Preview pass (every touched view, light and dark)

For each view you changed — `Home`, `SessionPlanner`, `Analysis`, `Dashes`, `Devices`, `Setups`,
`RaceEngineer`, `Settings`, `Help` — screenshot:

- light and dark, expanded and `collapsed=1` navigation;
- the empty state (`frame=none`, and a state with no records) and the populated state;
- every dialog the view opens (`click=` the trigger), including destructive confirms;
- keyboard: Tab order reaches every control with a visible focus ring; Esc closes dialogs.

Check: at most one primary button per view; status is dot + word; no redundant caption under the
title bar; tokens only, no hardcoded hex; tabular figures on changing numbers; empty states explain
what to do next instead of showing a blank list.

### 2. Real Electron pass

On a copy of the data (`SPRINT_DESKTOP_DATA_ROOT`, no `devices.json`), driven over CDP:

- the window opens with the 48px title bar and native caption buttons; telemetry status shows the
  real link state, never fake live data;
- every navigation item and Alt+1…7 opens its view; Ctrl+K opens the command palette;
- each action you touched round-trips: send it, then confirm `/api/state` changed and the view shows
  it — create/edit/delete a plan, arm and stop it; create, edit and delete a dash; add, disable and
  remove a device; duplicate a setup template and edit it; stage, push and revert an engineer change;
- destructive actions confirm first; reversible deletes offer undo;
- Settings and device fields survive a restart of the app.

### 3. Release pass (packaged build)

After `make build-app`, launch `app/build/bin/Sprint-<platform>-<arch>/Sprint.exe`: the same shell
renders, `resources/host/presets/` shipped, Settings shows the stamped version, and "Check for
updates" answers without crashing.

### Report

Say which passes ran and which did not. A preview-only pass is not a real-app check; a fake screen
driver is not a physical-screen check. Stop every process you started, by PID.
