# Desktop Componentization PRD

## Context

Sprint's Avalonia desktop UI currently implements the Graphite direction through
small helper factories in `app/Sprint.Desktop.Client/Graphite.cs` and page-local
composition in `MainWindow.cs`. That kept the rebuild moving, but it does not
provide a real component system: core controls such as segmented controls,
labeled inputs, navigation items, alerts, chips, indicators, settings rows, and
confirmation modals are still hand-rolled in page code.

`docs/Sprint.fig` is now the maintainer-confirmed source of truth for visual
components and tokens. Its extracted component contract is recorded in
`docs/FIGMA_COMPONENTS.md`. Where `docs/DESIGN.md`, `packages/tokens`, or
`Graphite.cs` differ from that file, the Figma-derived values are the target.

The desktop shell also needs to follow Apple HIG-style component behavior:
controls should expose real hover, pressed, disabled, selected, focus, and
destructive-confirmation states; icon-only actions should have accessible names;
keyboard operation should match platform expectations; and screen-reader
metadata should be present for custom controls.

## Goals

- Establish `docs/FIGMA_COMPONENTS.md` as the durable component and token
  reference for the desktop Graphite implementation.
- Replace ad hoc Avalonia styling with a token-backed component layer that can
  render the Figma component states consistently.
- Move control styling out of local property assignments and into Avalonia
  `ControlTheme` resources so pseudo-classes such as hover, pressed, focus, and
  disabled can work.
- Rebuild the desktop shell and dash editor using reusable components instead of
  page-local one-offs.
- Sequence on-screen dash-widget redesign after app tokens are retargeted, so
  new widget goldens do not lock in stale colors or radii.
- Add tests that pin canonical tokens, component states, accessibility anchors,
  and visual smoke coverage.

## Non-Goals

- Do not redesign product information architecture beyond the shell and editor
  componentization needed for this work.
- Do not publish a new web design system in this slice unless token changes
  require shared package updates.
- Do not implement issue #106 before the app token layer has been retargeted to
  the Figma variables.
- Do not create pixel-perfect desktop screenshot baselines in the first pass;
  broad visual smoke checks are enough until the shell stabilizes.

## Required Decisions

The implementation can start with documentation and tests, but the maintainer
must confirm these before broad token and asset changes land:

- Adopt the Figma variables in `docs/FIGMA_COMPONENTS.md` across `Graphite.cs`,
  `docs/DESIGN.md`, `packages/tokens`, and affected consumers.
- Bundle Saira, Saira SemiCondensed, Inter Medium, and Inter SemiBold in the
  Avalonia client under the existing font asset convention.
- Vendor the needed Tabler and Remix glyphs as local geometry assets or an
  equivalent repo-local icon source with compatible licenses.
- Use explicit save behavior in the dash editor, matching the Figma toolbar, or
  intentionally preserve autosave and change the component contract.
- Choose the dash canvas background for issue #106: pure black `#000000` from
  #106 or Figma Surface/Screen `#050505`.

## User Stories

### US1: Figma Tokens Are The Implementation Target

As a contributor, I need the canonical component values in the repository, so
that I can align code with the maintainer-approved Figma file without relying on
temporary artifacts or stale docs.

Acceptance criteria:

- `docs/FIGMA_COMPONENTS.md` exists and records palette, radius, typography,
  component specs, and canonical variables extracted from `docs/Sprint.fig`.
- `docs/DESIGN.md` references `docs/FIGMA_COMPONENTS.md` as the current
  component-token contract.
- Token tests fail if `Graphite.cs` regresses to the old `docs/DESIGN.md` color,
  radius, titlebar, or sidebar values.

### US2: Graphite Tokens Are Structured For Components

As a desktop UI engineer, I need typed token primitives and semantic aliases, so
that component themes can share colors, spacing, radius, fonts, and state values
without duplicating literals.

Acceptance criteria:

- `Graphite.cs` exposes the Figma neutral ramp, semantic surface/text/border
  aliases, status colors, radius values, spacing values, and shell dimensions.
- `DashPalette.cs` derives app-aligned widget defaults from the same canonical
  token generation rather than stale duplicate values.
- Raw Graphite hex values outside approved token files are absent or justified by
  tests.

### US3: Controls Use Avalonia Themes For Interaction States

As a desktop user, I need controls to visibly respond to hover, press, focus,
  selected, and disabled states, so that the app behaves like a native desktop
  surface instead of static mockup layers.

Acceptance criteria:

- `App.cs` loads Sprint component theme resources in addition to the dark
  Avalonia base theme.
- Buttons, icon buttons, navigation items, inputs, segmented controls, chips,
  indicators, alerts, and modal actions use reusable styles or control classes.
- Local brush assignments no longer block Fluent/Avalonia pseudo-class state
  selectors for shared controls.
- Keyboard focus is visible on every keyboard-operable shared control.

### US4: The Shell Uses Real Components

As a desktop user, I need the shell to match the component contract, so that
navigation, window controls, titlebar controls, and body layout are consistent
throughout the app.

Acceptance criteria:

- The titlebar is 32px high with the Figma logo tile, breadcrumb text,
  icon-only history/sidebar actions, and window buttons.
- The sidebar is 220px wide, uses `NavigationItem` components, and pins
  Settings/Help to the bottom group.
- Selection is represented as raised surface + hairline border + ember outline
  + ember text/icon, not as a solid ember action slab.
- History controls either navigate a real stack or are not presented as fake
  back/forward controls.

### US5: The Dash Editor Uses Reusable Controls

As a dashboard author, I need the editor toolbar, page tabs, palette, search,
and actions to use the same component library as the shell, so that editor work
does not create a second visual language.

Acceptance criteria:

- The editor toolbar uses reusable icon buttons, segmented page tabs, and
  primary/secondary buttons.
- Protected and removable page affordances use icons with accessible names.
- Widget palette search uses the labeled input component.
- Destructive actions such as deleting pages, widgets, layouts, or devices
  require confirmation before persistence.

### US6: Dash Widgets Follow The Same Component Concept

As a sim racer using an on-wheel dash, I need widgets to look like deliberate
instrument components, so that dashboards feel coherent with the desktop editor
while preserving runtime readability.

Acceptance criteria:

- Issue #106 starts only after app tokens and dash palette defaults are
  retargeted.
- Widgets use rounded instrument surfaces, type-specific default borders,
  icon/status badges, and token-backed alert/status colors.
- Widget themes override only accent/status/domain colors, not the core stale
  app palette.
- Alert rendering supports Full/Middle and Normal/Inverted variants without
  hard-coded stale overlays.

### US7: Accessibility And HIG Gaps Are Closed

As a keyboard or assistive-technology user, I need custom desktop controls to be
operable and identifiable, so that the app is not visually complete but
functionally opaque.

Acceptance criteria:

- Reusable controls set `AutomationProperties.Name` or a clear equivalent for
  icon-only and custom controls.
- Binding-capture mode does not trap Tab; Escape exits capture mode.
- Confirm dialogs support Enter/Space activation, Escape cancellation, and a
  visible default action.
- Tests use AutomationId or semantic anchors instead of string-content finders
  that break on harmless label copy edits.

## Implementation Phases

### Phase 0: Durable Spec And Maintainer Decisions

- Add `docs/FIGMA_COMPONENTS.md` from the extracted Figma component spec.
- Update `docs/DESIGN.md` to point at the Figma component spec as the current
  token and component contract.
- Record the five required decisions in the implementation issue or PR before
  changing broad token behavior.

### Phase 1: Token Layer And Theme Entry Point

- Rewrite `Graphite.cs` into primitive, semantic, and component sections that
  mirror `docs/FIGMA_COMPONENTS.md`.
- Add token-pinning tests for Figma colors, radii, spacing, titlebar height, and
  sidebar width.
- Add Sprint `ControlTheme` resources and load them from `App.cs`.
- Re-derive `DashPalette.cs` from the updated token layer.

### Phase 2: Desktop Control Library

- Build reusable Button, IconButton, SegmentedControl, InputWithLabel,
  NavigationItem, SettingsRow, Chip, Indicator, Alert, ConfirmDialog, and Modal
  components in dependency order.
- Add state tests and accessibility anchors for each reusable control.
- Replace page-local repeated settings rows, tabs, pills, and destructive action
  patterns with shared controls.

### Phase 3: Shell Componentization

- Retarget the titlebar to 32px and sidebar to 220px.
- Replace fake history chevrons with real navigation-stack behavior or remove
  disabled affordances.
- Replace solid-ember selected states with the Figma selected component state.
- Verify shell views at desktop and constrained viewport sizes with visual smoke
  artifacts.

### Phase 4: Editor And Dash Widgets

- Rebuild the dash editor toolbar, page tabs, palette, search, and actions from
  shared controls.
- Add confirmation flows for destructive editor actions.
- Start issue #106 after token retargeting and update dash widget painter tests
  against the new instrument-grade defaults.

### Phase 5: Verification Hardening

- Replace brittle string-content button finders with AutomationId anchors.
- Keep broad visual smoke tests for primary views and add focused component
  state tests where pixel-perfect screenshots would be too brittle.
- Update stale geometry tests that currently pin old titlebar/sidebar dimensions.
- Upload or preserve visual artifacts for review when UI tests fail.

## Verification

Run the smallest relevant checks for each slice. For desktop UI, Graphite,
layout, or shell changes, run:

```powershell
& 'C:\Program Files (x86)\dotnet\dotnet.exe' test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter VisualSmokeTests
```

For token or component-library slices, also run focused tests that cover the
changed files, then the broader desktop suite when the slice stabilizes:

```powershell
& 'C:\Program Files (x86)\dotnet\dotnet.exe' test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj
```

Do not claim visual completion without inspecting generated PNG artifacts under
`app/Sprint.Desktop.Tests/artifacts/visual/` when visual smoke tests fail.

## Open Questions

- Should the componentization PRD be opened as a GitHub issue linked to #88,
  #106, #107, and #116, or remain as a local repo spec until Phase 0 decisions
  are answered?
- Should `docs/DESIGN.md` be fully rewritten in Phase 0 or reduced to a short
  overview that delegates concrete token/component values to
  `docs/FIGMA_COMPONENTS.md`?
- Which icon vendoring path is preferred for Avalonia: checked-in
  `StreamGeometry` helpers, resource dictionaries, or a small internal icon
  control?
