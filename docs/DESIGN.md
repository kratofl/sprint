# Sprint Graphite Design System

Sprint uses the Graphite product language for every desktop surface and every
future shared control. The design is a flat, layered, near-black interface for a
sim-racing telemetry and dashboard application. It is dense, calm, and precise:
solid fills, hairline borders, tabular numeric data, one warm ember accent, and
clear interaction cues.

## Source Of Truth

Canonical design direction:

1. `docs/DESIGN.md` - implementation contract for agents and contributors.
2. `packages/tokens` - runtime token implementation.
3. `packages/ui` - reusable React component implementation.
4. `app` - current native Avalonia desktop composition and runtime behavior.

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
| `--bg` | `#070707` | body tray and content backdrop |
| `--panel` | `#0D0D0D` | titlebar, sidebar, tiles |
| `--panel2` | `#131313` | inset rows and controls |
| `--panel3` | `#1B1B1B` | hover and raised inset state |
| `--line` | `#1A1A1A` | default hairline |
| `--line2` | `#232323` | stronger frame border |
| `--text` | `#ECECEC` | primary text and values |
| `--text2` | `#9A9A9A` | secondary labels and body |
| `--text3` | `#5C5C5C` | captions and idle metadata |
| `--accent` | `#FF6A00` | active, primary, focus, selection |

Status colors:

| Token | Value | Role |
|---|---:|---|
| `--green` | `#16B566` | connected, good, improving |
| `--red` | `#F5483D` | danger, destructive, slower |
| `--yellow` | `#F5C518` | caution |
| `--blue` | `#4F9CFF` | informational, advanced, comparison |
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

- UI font: `Inter`, with system fonts as fallback. Bundled in the Avalonia client
  under `app/Sprint.Desktop.Client/Assets/Fonts` and exposed via `Graphite.FontStack`.
- Display / brand font: `Space Grotesk` (wordmark, large headings), via
  `Graphite.DisplayFontStack`.
- Typography matches the maintainer's Figma (`docs/Sprint.fig`). (Earlier drafts
  used `IBM Plex Sans`; that has been retired in favor of the Figma identity.)
- Use `font-variant-numeric: tabular-nums` globally.
- Base UI size: `13px`.
- Page titles: `22px / 700`.
- Section labels: `10px / 700`, uppercase, `0.18em` letter spacing, `--text3`.
- Sidebar group labels: `8.5px / 700`, uppercase, `0.22em` letter spacing.
- Large telemetry values use heavier weight and tabular figures, but no viewport
  font scaling.

### Shape, Spacing, Motion

- Default radius: `--radius: 10px`; expose as `--r`.
- Nested controls use `calc(var(--r) - 2px)`.
- Borders are 1px hairlines. Dashed `1.5px --line2` marks drop targets and add
  affordances.
- Tiles pad `14px 16px`; page grids use `12px-14px` gaps.
- Transitions are functional and fast: `120ms-160ms`.
- Live dots may pulse. Data values update instantly.

## Shell

The desktop shell is fixed and shared:

- `40px` draggable titlebar with logo, sidebar collapse, history controls,
  breadcrumb, sim-link pill, tick rate, and native window controls.
- `208px` sidebar, collapsible to `62px`, with grouped primary navigation.
- Body tray inset from the shell by `10px`, framed by `--line2`, filled with
  `--bg`, and rounded by `calc(var(--r) + 2px)`.

Navigation model:

- Telemetry: Live, Engineer, Setup.
- Dash Studio: Dashes, Devices.
- Footer: Settings, Help.

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
- Use segmented controls only for local state/view changes inside one context.
- Use tabs for closely related categories, not global navigation.
- Use modals only for blocking creation/confirmation flows.

## Page Layouts

All current desktop pages use Graphite:

- Live: telemetry grid, track map, timing/delta, speed/gear/pedals, tyres,
  sectors, vitals.
- Engineer: car setting controls, quick messages, race/radio log, comparison
  cues.
- Setup: setup program list, grouped field editor, A/B comparison table.
- Dashes: card grid with live mini previews, edit/duplicate/delete actions, and
  a dashed create card.
- Editor: layout canvas, widget palette, inspector, alerts, and settings views.
- Devices: 240px picker plus binding detail panel and add-device modal.
- Settings: global defaults only.
- Help: reference cards and shortcuts.

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
