# Desktop Manual Smoke Script (WS11 / US41)

A fast, human-run pass to confirm the Avalonia desktop app launches and the
migrated surfaces behave, complementing the automated `dotnet test` suite. Run
before cutting a release (see `docs/RELEASE.md`).

> SDK note: use the x86 host — `& 'C:\Program Files (x86)\dotnet\dotnet.exe'` — per
> `CLAUDE.md`. `make dev-app` runs the client; `make build-app` publishes it.

## 1. Launch & shell
- [ ] `make dev-app` opens the window without an error dialog.
- [ ] Custom 32px titlebar: minimize, maximize/restore, and **close** all work and
      do not throw on click (US12). Dragging the titlebar moves the window; dragging
      a button/combo does not.
- [ ] Sidebar collapse/expand toggles; collapsed nav buttons show a tooltip.
- [ ] `Alt+1`…`Alt+7` jump between the seven views; visible focus ring on tab.

## 2. Live telemetry
- [ ] Live page streams the demo source: Speed/Gear/RPM/Delta/Fuel/Sector tiles
      and pedal bars update; the titlebar pill shows a live tone + a measured Hz.
- [ ] (If a real link is unavailable) the Live page shows a shared state panel
      (Not connected / Reconnecting / Signal stale) rather than fake green.

## 3. Dashes (render + editor)
- [ ] Dashes page shows each layout with a **real** painter-rendered preview
      (widgets, not labelled boxes) and a Default/Custom badge.
- [ ] Create dash → a new card appears with a thumbnail.
- [ ] Edit → the three-pane editor opens: add a widget from the palette; it lands
      in a free grid slot; drag it to move; drag the corner grip to resize; the
      inspector steppers change position/size; Delete removes it.
- [ ] Page tabs: add a page, rename, switch, delete; Idle tab is present + locked.
- [ ] Done returns to the list; reopening the layout shows the persisted edits.

## 4. Devices (hardware)
- [ ] Add a screen from the catalog → a saved-device card with a status pill.
- [ ] Rotate / X / Y offset / dash-assignment controls persist across relaunch.
- [ ] Add device → Generic → Custom wheel: a name plus "With screen"/"No screen"
      creates the wheel and opens its detail; an empty name is rejected inline. A
      screenless wheel has no resolution chip and no screen section (issue #49).
- [ ] Device detail → Purpose: switching a screen away from Dash replaces the dash
      controls with a "not built yet" panel, the pill reads "Idle", output stops, and
      switching back to Dash resumes it — all surviving relaunch (issue #53).
- [ ] With no physical screen, status explains the actual state ("Setup needed", "Not found", "In use", "Duplicate target", or "USB access failed") and exposes technical detail (never a crash or generic driver-install demand).

## 5. Bindings & Engineer & Setup
- [ ] Devices → Command Bindings: Listen, press a key, the binding shows + persists;
      Clear removes it.
- [ ] Engineer: step a control → "Staged Changes" shows car→staged; Push applies +
      logs to the radio; Revert clears.
- [ ] Setup: Duplicate/Delete programs; A/B compare shows a predicted-delta cue.

## 6. Settings & updates
- [ ] Settings: driver name/number + channel Save and survive relaunch.
- [ ] About shows the version badge + channel; "Check for updates" reports a result
      (or "Check failed" offline) without crashing.

## 7. Published artifact
- [ ] `make build-app` → `app/build/bin/Sprint.Desktop.Client.exe` launches.
- [ ] Output includes `presets/`, `Assets/Fonts/`, and `build/appicon.png`.
