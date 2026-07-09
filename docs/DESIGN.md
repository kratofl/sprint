# Sprint Graphite Design System

Sprint uses the Graphite product language for every desktop surface and every
future shared control. The design is a flat, layered, near-black interface for a
sim-racing telemetry and dashboard application. It is dense, calm, and precise:
solid fills, hairline borders, tabular numeric data, one warm ember accent, and
clear interaction cues.

## Source Of Truth

Canonical design direction:

1. `docs/design/figma/whole_application.png`, `docs/design/figma/sidebar.png`,
   and `docs/design/figma/components/*.png` - screenshot source of truth for
   whole-app surfaces, component shape, state, and density.
2. `docs/FIGMA_COMPONENTS.md` - extracted component and token contract from
   `docs/Sprint.fig`.
3. `packages/tokens` - runtime token implementation.
4. `packages/ui` - reusable React component implementation.
5. `app` - current native Avalonia desktop composition and runtime behavior.

When this document, `docs/FIGMA_COMPONENTS.md`, and existing code disagree with
the screenshots, use the screenshots.

Do not revive previous non-Graphite design directions. Graphite replaces them.

## Ownership

`packages/tokens` owns all visual primitives and semantic aliases:

- color, surfaces, text, status colors, data colors;
- typography, numeric formatting, spacing, radius, border, and motion;
- CSS variables consumed by desktop and future web surfaces.

`packages/ui` owns reusable UI:

- shell primitives: app shell, titlebar pieces, nav rail, body tray, status
  indicators;
- controls: buttons, icon buttons, inputs, selects, segmented controls, tabs,
  switches, steppers, tooltips, modals;
- data layout primitives: tiles, cards, setting rows, page headers, badges,
  status pills, binding rows, preview frames;
- editor primitives that are reusable outside one desktop-only screen.

`app` owns native desktop composition and runtime behavior:

- Avalonia shell, page-level state, and window controls;
- preset loading, local persistence, and desktop orchestration;
- local controls only when they are genuinely desktop-only or hardware-bound.

No web page may introduce a reusable visual control locally when it belongs in
`packages/ui`. Native Avalonia controls should stay aligned with the same
Graphite tokens and interaction contracts.

## Foundations

### Color

Graphite default tokens:

| Token | Value | Role |
|---|---:|---|
| `--bg` | `#0A0A0A` | body tray and content backdrop |
| `--panel` | `#0F0F0F` | titlebar, sidebar, panels, cards |
| `--panel2` | `#141414` | inset rows, controls, secondary buttons |
| `--panel3` | `#1A1A1A` | raised and selected state |
| `--line` | `#2E2E2E` | default hairline |
| `--line2` | `#424242` | stronger frame and widget-card border |
| `--text` | `#F6F6F6` | primary text and values |
| `--text2` | `#7A7A7A` | secondary labels and body |
| `--text3` | `#5A5A5A` | captions and idle metadata |
| `--accent` | `#FF6A00` | active, primary, focus, selection |

Status colors:

| Token | Value | Role |
|---|---:|---|
| `--green` | `#16B566` | connected, good, improving |
| `--red` | `#F02744` | danger, destructive, slower |
| `--yellow` | `#E0A30C` | caution |
| `--blue` | `#1F7FE6` | informational, advanced, comparison |
| `--purple` | `#A06BFF` | special states and personal best |

Rules:

- Use `#FF6A00` ember as the app accent.
- On-wheel dashes may define their own `--dash-accent`; it is independent from
  the app accent.
- Do not use gradients, glass blur, glow, or neumorphic effects.
- Depth comes from the surface step `bg -> panel -> panel2 -> panel3` plus a
  1px border.
- Shadows are reserved for modals, alert popups, and the canvas stage.

### Typography

- UI font: `Inter`, with system fonts as fallback. Bundled in the Avalonia
  client under `app/Sprint.Desktop.Client/Assets/Fonts` and exposed via
  `Graphite.FontStack`. Figma requires Regular, Medium, SemiBold, and Bold.
- Motorsport control fonts: `Saira` and `Saira SemiCondensed` for sidebar
  section labels, toolbar document titles, segmented controls, chips, and compact
  counters.
- Display / brand font: `Space Grotesk` (wordmark, large headings), via
  `Graphite.DisplayFontStack`.
- Typography matches the maintainer's Figma (`docs/Sprint.fig`).
- Use `font-variant-numeric: tabular-nums` globally.
- Base UI size: `13px`.
- Page titles: `22px / 700`.
- Section labels: `10px / 700`, uppercase, `0.18em` letter spacing, `--text3`.
- Sidebar group labels: `8.5px / 700`, uppercase, `0.22em` letter spacing.
- Large telemetry values use heavier weight and tabular figures, but no viewport
  font scaling.

### Shape, Spacing, Motion

- Radius scale: xs `4px`, sm `6px`, md `8px`, lg `10px`, xl `14px`, pill `999px`.
- Inputs and standard buttons use the screenshot component radius; navigation
  items use the compact raised-pill treatment from `navigation_item.png`;
  segmented controls use a pill container with an ember-filled selected item;
  tab views use a dark capsule with a neutral selected pill.
- Borders are 1px hairlines. Dashed `1.5px --line2` marks drop targets and add
  affordances.
- Tiles pad `14px 16px`; page grids use `12px-14px` gaps.
- Transitions are functional and fast: `120ms-160ms`.
- Hover changes cursor and applies a 10% brightness lift only. Do not add hover
  glows, outlines, scale, fill swaps, or layout movement.
- Live dots may pulse. Data values update instantly.

## Shell

The desktop shell is fixed and shared:

- `32px` draggable titlebar with logo, sidebar collapse, history controls,
  breadcrumb, sim-link pill, tick rate, and native window controls.
- `220px` sidebar, collapsible to `62px`, with grouped primary navigation.
- Body tray inset from the shell by `10px`, framed by `--line2`, filled with
  `--bg`, and rounded by `calc(var(--r) + 2px)`.

Production navigation model:

- Home.
- Devices.
- Dash Editor.
- Setups.
- Footer: Settings, Help.

Production desktop navigation is Home, Devices, Dash Editor, Setups, Settings,
and Help. Live Debug, Engineer Debug, and Setup Debug are debug-only surfaces and
must not appear in normal production navigation.

Primary navigation belongs in the sidebar. Local view switching belongs inside
the page via tabs or segmented controls. Actions belong in buttons.

## Components

Every reusable component must exist in `packages/ui` and be token-backed.

Required component families:

- `Button`, `IconButton`, `ToolbarButton`.
- `Input`, `Select`, `SegmentedControl`, `Tabs`, `Switch`, `Stepper`.
- `Badge`, `StatusPill`, `KeyChip`, `Tooltip`.
- `Tile`, `Card`, `SettingsCard`, `SettingsRow`, `PageHeader`.
- `AppShell`, `Titlebar`, `NavRail`, `BodyTray`.
- `Modal`, `ConfirmDialog`, `Toast`.
- `PreviewFrame`, `DashPreviewFrame`, `BindingRow`, `DevicePickerItem`.

Component rules:

- Icon-only controls require an accessible name and tooltip where meaning is not
  obvious.
- Use icons for compact tools when a familiar symbol exists.
- Use text buttons for clear commands and destructive actions.
- Use segmented controls only for local state/view changes inside one context;
  selected segmented items are ember-filled.
- Use tab views for closely related categories, not global navigation; selected
  tab-view items are neutral filled pills.
- Use modals only for blocking creation/confirmation flows.

## Page Layouts

Production desktop pages use Graphite:

- Home: compact entry into dash and device workflows.
- Dash Editor: layout canvas, compact widget palette, properties panel, alerts,
  and settings views.
- Devices: picker plus binding/detail panel and add-device modal.
- Settings: global defaults only.
- Help: reference cards and shortcuts.

Development/debug pages may expose live telemetry, engineer, or setup tooling,
but they are not part of the production navigation model.

Desktop pages must render persisted or current runtime state. Empty states are
allowed when the runtime has no data. Mock rows, sample devices, sample setups,
and demo-only metrics are not allowed in production pages.

Keep layouts dense but scannable. Each screen must expose the next useful action
without adding explanatory marketing text.

## Data And Runtime Contracts

No backward compatibility is required for this rebuild.

Use cleaner contracts when the Graphite UI needs them:

- typed C# services own desktop persistence and native runtime orchestration;
- desktop adapters normalize only unavoidable transport shape differences;
- shared DTOs live in `Sprint.Desktop.Api` (desktop) or `packages/types` (web)
  when multiple apps need them.

## Accessibility

The UI must be keyboard-operable and screen-reader navigable:

- visible focus on every keyboard-operable control;
- focus must not be obscured by sticky bars, modals, or overlays;
- semantic headings and landmarks for major panes;
- predictable tab order matching visual order;
- Enter/Space activates buttons; Escape cancels modal/listen/selection modes;
- color is never the only signal for status or destructive intent.

## Verification

Before claiming a page is done:

- run the smallest relevant type/test checks;
- visually inspect the native Avalonia desktop surface;
- verify focus, hover, selected, disabled, empty, loading, and destructive states;
- check that Avalonia controls follow the shared Graphite control contract;
- scan for raw Graphite hex values outside `packages/tokens`.
