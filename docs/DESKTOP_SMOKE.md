# Desktop Manual Smoke Script

A fast, human-run pass to confirm the desktop app launches and its surfaces
behave, complementing the automated `dotnet test`/`pnpm test` suites. Run before
cutting a release (see `docs/RELEASE.md`).

> SDK note: use the x86 host — `& 'C:\Program Files (x86)\dotnet\dotnet.exe'` —
> per `AGENTS.md`. `make dev-app` runs Vite + Electron + the native host together;
> `make build-app` publishes and packages the app.

## 1. Launch & shell
- [ ] `make dev-app` opens the window without an error dialog.
- [ ] The `44px` toolbar shows the Sprint mark, the sidebar toggle, the current
      page title, and a telemetry badge; the native Windows minimize,
      snap/maximize, and close buttons work (overlaid via Electron's title bar
      overlay) and dragging the toolbar moves the window.
- [ ] Sidebar collapse/expand toggles between `184px` and `52px`; collapsed nav
      buttons show a tooltip with their label.
- [ ] Every sidebar item (Overview, Session planner, Analysis, Dashes, Devices,
      Setups, Race engineer, Settings, Help & diagnostics) navigates and shows
      the matching title in the toolbar.

## 2. Home
- [ ] The telemetry card shows the current connection state; with no game
      running it explains that Sprint connects on its own once the game is
      running rather than showing fake live data.
- [ ] Devices / Dashes / Session plans summary tiles show a live count and up to
      three rows each, or "None yet."; "Open <section>" navigates there.

## 3. Session planner
- [ ] With no plans, an empty state explains the feature and offers "New plan."
- [ ] Create a plan → it appears in the list; edit, arm, start, and stop it and
      confirm the state changes are reflected immediately.
- [ ] Delete a plan asks for confirmation before removing it.

## 4. Analysis
- [ ] With no recorded laps, an empty state is shown instead of a blank list.
- [ ] Filter by game/track/class/car/day; select a lap as primary and a second
      lap (optionally from a different session) as comparison; the chart stack
      overlays both traces. "Clear lap" removes a selection.

## 5. Dashes (render + editor)
- [ ] Dashes page shows each layout as a real rendered preview (via
      `@sprint/dashboard`), not a placeholder box.
- [ ] "New dash" opens a create dialog with a screen-profile choice; the new
      layout appears as a card.
- [ ] Opening a dash opens the editor: add a widget, drag/resize it, rename the
      dash and its pages, add/rename/delete a page, and add/rename/delete a
      widget stack and its layers.
- [ ] Closing the editor returns to the list; reopening the layout shows the
      persisted edits.

## 6. Devices (hardware)
- [ ] With no device selected, a placeholder explains how to add one.
- [ ] "Add device" opens the catalog dialog (Escape closes it); adding a device
      creates a card and opens its detail.
- [ ] Device detail fields (name, orientation, offsets, dash assignment, screen
      purpose) persist across a relaunch.

## 7. Setups
- [ ] Setup templates (read-only) and user setups are listed separately; with no
      user setups, the empty state suggests duplicating a template.
- [ ] Duplicate a template → the copy appears under "User setups" and its
      parameter steppers save edits immediately.

## 8. Race engineer
- [ ] Car controls show current vs. staged values with working +/- steppers.
- [ ] Staging a change shows it under "Staged changes"; a quick message button
      appends to the radio log; "Revert" asks for confirmation before clearing
      staged changes.
- [ ] The push state (idle/pending/confirmed/failed) is visible rather than
      claiming success before it is acknowledged.

## 9. Settings & Help
- [ ] Settings → Profile: driver name/number save on commit and survive a
      relaunch.
- [ ] Settings → About: shows the running version, the update channel selector
      (switching to pre-release requires confirming the warning), and "Check for
      updates" reports up-to-date / available / failed without crashing.
- [ ] Settings → Reset settings to defaults asks for confirmation and does not
      remove dashes, devices, or setups.
- [ ] Help & diagnostics: search filters the topic list; "Runtime status" shows
      telemetry state and any reporting screens; the log viewer's level/text
      filters and Refresh work, and the resolved log directory is shown.

## 10. Published artifact
- [ ] `make build-app` → the packaged app under
      `app/build/bin/Sprint-<platform>-<arch>/` (e.g. `Sprint.exe` on Windows)
      launches and renders the same shell as `make dev-app`.
- [ ] The package includes `resources/host/presets/` alongside the app.
