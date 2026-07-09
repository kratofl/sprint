# Whole-App Figma UI Migration Design

## Status

Approved for implementation planning on 2026-07-06.

## Goal

Migrate the Avalonia desktop app to match the screenshot-backed Figma design
system across the whole production surface, not only the dash editor. The target
is the visual language captured in `docs/design/figma/` and described in
`docs/FIGMA_COMPONENTS.md`.

The current app still carries old Graphite approximations in the shell,
component states, hover behavior, dash editor, palette cards, and dash widgets.
This migration replaces those approximations with screenshot-faithful component
primitives and page composition.

## Source Of Truth

Use these files as the implementation target, in this order:

1. `docs/design/figma/whole_application.png`
2. `docs/design/figma/sidebar.png`
3. `docs/design/figma/components/*.png`
4. `docs/FIGMA_COMPONENTS.md`

`docs/DESIGN.md` is known to contain stale material. It may be used only as
historical context until this migration updates it. When the code,
`docs/DESIGN.md`, or existing smoke artifacts disagree with the screenshots, the
screenshots win.

## Scope

This is a whole desktop UI pass for `app/Sprint.Desktop.Client`.

Included:

- shared Graphite tokens and native Avalonia component styling;
- shell frame, sidebar, titlebar/topbar, production navigation, and content
  surfaces;
- button, icon button, input, navigation item, tab view, segmented control,
  chip, badge, indicator, alert, toast, toggle, and card primitives;
- dash editor toolbar, palette, stage, properties panel, page/widget switching,
  and editor states;
- dash list cards and preview framing;
- widget palette cards and on-dash widget surfaces;
- reconciliation of stale `docs/DESIGN.md` sections after the implementation
  direction is finalized;
- visual smoke tests and targeted component tests for the new state contract.

Out of scope for this pass:

- changing telemetry contracts, dash persistence schema, hardware rendering
  transport, or API/web surfaces;
- creating new product workflows beyond what is needed to remove old production
  navigation and expose the existing dash/device flows cleanly;
- replacing Tabler/Remix-equivalent icons with a new icon package unless the
  current icon helper cannot render the required screenshot shapes closely
  enough.

## Product Navigation

The production application should no longer embed `Live` as a main page.
Telemetry/debug screens are development-only surfaces.

Production navigation should match the screenshot direction:

- Home
- Devices
- Dash Editor
- Settings
- Help

Engineer, Setup, and Live-style telemetry views may remain in code as debug
tools, but they must not appear in normal production navigation. If retained,
they should be reachable only through an explicit debug affordance or build-time
development condition.

## Visual System

### Surfaces

The whole app uses flat near-black surfaces with 1px borders:

- app/content background: `#0A0A0A`
- shell/sidebar/panels: `#0F0F0F`
- controls/insets: `#141414` to screenshot-matched dark control fills
- selected/raised surfaces: `#1A1A1A` or the darker raised values visible in
  the component screenshots
- default border: `#2E2E2E`
- strong/widget border: `#424242`
- primary text: `#F6F6F6`
- muted text: `#7A7A7A`
- subtle text: `#5A5A5A`
- accent: `#FF6A00`

Do not introduce gradients, glass effects, glow, neumorphism, or broad shadows.
Only the outer window/modal-like surfaces may use the subtle screenshot shadow.

### Hover

Hover is intentionally minimal:

- cursor changes to pointer for clickable controls;
- visual brightness increases by 10%;
- no extra border, glow, fill swap, outline, scale, or layout movement.

Selected, focused, disabled, destructive, and error states are separate from
hover and should follow the component screenshots.

### Components

Shared component helpers in `Graphite.cs` and app-wide resources in
`SprintComponentTheme.cs` must become the only default path for reusable native
controls.

Required state contracts:

- **Button:** screenshot-pill style variants, correct primary/secondary/danger/
  disabled fills, radius, padding, and label weight.
- **Icon button:** compact square/circle forms from the screenshots, with
  tooltip/accessibility text where meaning is not obvious.
- **Input:** label, field, hint counter, focus border, error border/message, and
  disabled state from `input.png`.
- **Navigation item:** muted default and raised active item from
  `navigation_item.png`, without the current extra active outline treatment.
- **Segmented control:** ember-filled selected item for controls like
  Pages/Widgets.
- **Tab view:** neutral selected pill inside a dark capsule for Layout/Alerts/
  Settings.
- **Toggle:** screenshot pill/knob behavior and disabled opacity.
- **Alerts, toasts, indicators, chips/badges:** color triples and dimensions
  from their component screenshots.

Page code should not hand-style these states repeatedly. If a page needs a
control that matches a screenshot component, it should call the shared Graphite
helper or use the app-wide theme.

## Shell And Layout

The production shell should be closer to `whole_application.png` and
`sidebar.png` than the current wide desktop app shell.

Key changes:

- Use the screenshot sidebar structure and density.
- Remove Live/Engineer/Setup from normal production nav.
- Keep settings/help pinned low in the sidebar.
- Use screenshot-like title/topbar controls: back/navigation, document title,
  scale control, primary save/check action, and window controls.
- Keep the body flat and dark. Avoid card-heavy page wrappers.

## Dash Editor

The dash editor is the primary production surface and must match the screenshot
direction.

Toolbar:

- compact HIG-style zones;
- document navigation/title on the left;
- Layout/Alerts/Settings as the Tab View component;
- Pages/Widgets as the ember-selected Segmented Control where relevant;
- Save/check as the primary action.

Palette:

- screenshot-sized widget cards;
- dark raised fill, strong hairline border, compact icon and label;
- no large Skia preview thumbnails inside the palette cards;
- search/input follows the shared input component.

Stage:

- dark canvas surface with dotted grid;
- widgets drawn as on-dash surfaces, not app cards;
- selection, resize, drag ghost, and invalid placement states must use the
  screenshot visual language.

Properties:

- narrow panel matching the screenshot density;
- selected widget row and controls use shared component primitives;
- inspector controls should not use old cards or old hover styles.

## Dashes And Devices Pages

Dashes and devices should be adapted to the same shell and component system:

- cards should use screenshot surfaces and borders;
- dash previews remain real painter output, but preview framing must match the
  design system;
- actions use the shared button/icon-button helpers;
- empty/loading/error states use shared alert/state primitives and screenshot
  colors.

## Testing And Verification

Implementation should be test-first where behavior changes can be represented in
unit tests. Visual-only changes should add or update focused visual smoke
coverage.

Required verification before completion:

- run focused desktop unit tests for changed components/controllers;
- run `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter VisualSmokeTests`
  after visual/layout changes;
- inspect generated visual artifacts under
  `app/Sprint.Desktop.Tests/artifacts/visual/`;
- compare shell, sidebar, editor, and component gallery artifacts to the Figma
  screenshots;
- call out any screenshot deltas that cannot be solved in the pass.

## Implementation Notes

Start token-first:

1. update `Graphite.cs` primitives and helper controls;
2. update `SprintComponentTheme.cs` so templated Avalonia controls stop leaking
   old hover/focus states;
3. migrate shell and navigation;
4. migrate dash editor composition;
5. migrate dashes/devices page surfaces;
6. update `docs/DESIGN.md` so it no longer contradicts the screenshot-backed
   system;
7. update tests and visual smoke baselines.

Do not make broad runtime or persistence refactors while migrating the UI.
