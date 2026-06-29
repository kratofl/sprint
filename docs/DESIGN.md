# Sprint Design System

Sprint's desktop UI is defined by the Figma file **`docs/Sprint.fig`**. It is a
flat, dark, single-mode interface for a sim-racing telemetry and dashboard app:
solid fills, 1px hairline borders, pill-heavy controls, tabular numeric data, and
one warm ember accent. No glass, blur, glow, gradients (gradients appear only in
the brand mark), or neumorphism.

## Source of truth

In priority order:

1. **`docs/Sprint.fig`** — the visual source of truth (a binary Figma file; not
   directly readable by agents). Tokens, fonts, component anatomy, and shapes are
   reproduced exactly. The decoded, **agent-readable** spec is committed at
   **`docs/figma-spec/SPEC.md`** (+ `components.txt`, `layout.txt`, `tokens.txt`) —
   use that. (`tmp/figma-extract/` is the gitignored re-extraction scratch;
   re-extraction is recorded in the `decode-sprint-fig-file` memory.)
2. `packages/tokens` — the runtime token implementation (must equal the Figma).
3. `packages/ui` — the reusable React components (must equal the Figma anatomy).
4. `app/frontend` — desktop composition and runtime behavior.

The **Figma "Components" page** is the component library, used app-wide exactly.
The **Figma "Layout" page** is the reference for the **Dash Studio / Dash Editor
screen only** (its car photo is just a background reference). All other screens
have no Figma template — they are designed from the Components library, an
Apple-style decluttered approach, and macOS HIG placement.

> This supersedes the previous "Graphite / IBM Plex" direction entirely. That
> document used wrong values (IBM Plex Sans, a #070707 ramp, radius 10, red
> #F5483D, blue #4F9CFF, a 40px titlebar with breadcrumb). Do not revive it.

## Foundations

### Color

Dark-only. The neutral ramp and the accent/status families come straight from the
Figma primitives.

**Neutral ramp**

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| Neutral/50 | `#F6F6F6` | | Neutral/600 | `#424242` |
| Neutral/100 | `#E4E4E4` | | Neutral/700 | `#2E2E2E` |
| Neutral/200 | `#C6C6C6` | | Neutral/800 | `#1F1F1F` |
| Neutral/300 | `#A0A0A0` | | Neutral/850 | `#1A1A1A` |
| Neutral/400 | `#7A7A7A` | | Neutral/900 | `#141414` |
| Neutral/500 | `#5A5A5A` | | Neutral/925 | `#0F0F0F` |
| | | | Neutral/950 · 990 | `#0A0A0A` · `#050505` |

**Accent + status anchors**

| Family | Key stops |
|---|---|
| Orange (accent) | 400 `#FF8636` · **500 `#FF6A00`** · 700 `#BF4D00` · 950 `#421A02` |
| Green | **500 `#16B566`** · 700 `#0E7445` · 800 `#0F5B38` · 950 `#05281A` |
| Red | **500 `#F02744`** · 700 `#A4172C` · 800 `#851727` · 950 `#3A0A10` |
| Yellow | **500 `#E0A30C`** · 700 `#8F6406` · 950 `#2E2002` |
| Blue | **500 `#1F7FE6`** · 700 `#114F99` · 950 `#091D38` |
| Purple | 500 `#8F76FF` |

**Semantic surfaces** (compact app variables in `globals.css`)

| Semantic | Variable | Hex | Role |
|---|---|---|---|
| Surface/Screen | `--bg-deep` | `#050505` | dash canvas (darkest) |
| Surface/App | `--bg` | `#0F0F0F` | app window body |
| Surface/Panel | `--panel` | `#141414` | sidebar, side panels |
| Surface/Tile | `--panel2` | `#1F1F1F` | controls, inputs, tiles |
| Surface/Tile 2 | `--panel3` | `#2E2E2E` | hover / selected |
| Surface/Tile 3 | — | `#424242` | — |
| Text/Default | `--text` | `#F6F6F6` | primary text + values |
| Text/Muted | `--text2` | `#A0A0A0` | secondary labels |
| Text/Subtle | `--text3` | `#7A7A7A` | captions / overlines |
| Border/Default | `--line` | `#2E2E2E` | default hairline |
| Border/Strong | `--line2` | `#424242` | stronger frame border |
| Primary | `--accent` | `#FF6A00` | active / primary / focus (text-on-accent = `#141414`) |

Status families map to `{500 text, 700 border, 950 soft-bg}`. Text on accent/light
fills is `#141414` (Text/Dark). Depth comes from the surface step plus a 1px
border — shadows are reserved for modals, alert popups, and the canvas stage.

### Typography

Self-hosted via `@fontsource` (the offline Wails app cannot use a CDN). Base UI
size 13px; tabular numerals for telemetry.

| Family | Use | Weights |
|---|---|---|
| **Inter** | primary UI text, labels, controls | 400 / 500 / 600 / 700 |
| **Space Grotesk** | the **SPRINT wordmark only** | 700 |
| **Saira** | tagline, input hints/counters, numeric values | 400 / 700 |
| **Saira SemiCondensed** | badges / chips (uppercase) | 500 / 700 |
| **Sora** | minor / incidental | 400 |

- Page titles: Space Grotesk-free — `22px / 700` (display) is acceptable for the
  in-body `PageHeader`, but controls/tabs/nav use **Inter**, title-case (never
  uppercase Space Grotesk).
- Section / overline labels: Inter Bold `10px`, uppercase, wide tracking, `--text3`.
- Chips/badges: Saira SemiCondensed Bold `12px`, uppercase.

### Shape, spacing, motion

- Radius scale: **xxs 4 · xs 6 · sm 8 · md 12 · lg 16 · xl 18 · pill 999**. Default
  control/panel radius is **18** (`--r`); widget tiles use 12; badges use 4.
- Space scale: 2 · 4 · 6 · 8 · 10 · 14 · 16 · 18 · 20 · 22 · 36. Panels pad 14;
  page grids/gaps use 6–14.
- Borders are 1px hairlines. Dashed `--line2` marks drop targets.
- Functional transitions are fast: `120–160ms`. The segmented-control active pill
  slides between segments and the primary button "pops" on a fill-color change
  (orange→green/red) with a gentle overshoot, `cubic-bezier(0.34, 1.56, 0.64, 1)`.
  All motion respects `prefers-reduced-motion`.

## Shell (Figma "Layout")

Frameless Wails window (opaque), drawn as flat surfaces flush to the window edges:

- **Sidebar** — 220px (collapses to 72px), `#141414`, 1px `#2E2E2E` border, flush
  to the left/top/bottom edges with only the inner (right) corners rounded (r18),
  pad 14, gap 14. Leads with the **SPRINT wordmark** (ember icon 24 + "SPRINT"
  Space Grotesk Bold 28 `#FF6A00` over a Saira "TELEMETRY SYSTEM" tagline with a
  gradient underline) and a collapse control. Nav uses the `NavigationItem`
  anatomy (h32, pad 8×10, pill; selected = `#2E2E2E` r18 + accent text); section
  overlines are Inter Bold 10 uppercase `#7A7A7A`.
- **Content header** — a single bar (h45) at the top of the content column. It is
  the Wails drag region and hosts the window controls (minimise/maximise/close,
  Tabler 16) at the top-right corner. Each view injects its own toolbar into this
  one header via a portal — there is **no** full-width titlebar or breadcrumb, and
  **no** global previous/next history buttons (navigation is the sidebar).
- **Body** — view content fills the rest, on the `#0F0F0F` app surface.

## Components

Every reusable control lives in `packages/ui` and is token-backed. Icons are
`@tabler/icons-react` (the Figma uses Tabler glyphs); `lucide-react` is not used.

- **Button** — pill (r18), pad 6×16, Inter Medium 13. Primary `#FF6A00`/`#141414`;
  Secondary `#1F1F1F`/`#F6F6F6`; Destructive `#1F1F1F`/`#F02744`; Disabled
  `#141414`/`#7A7A7A`; Success/Error solid fills. Icon size = 32 circle (primary
  inner border `#FF8636`).
- **IconButton** — 32 circle, Tile bg + `#2E2E2E` inner border (primary save =
  `#FF6A00`/`#FF8636`). Requires an accessible name.
- **Input** (+ Field) — `#1F1F1F`, border `#2E2E2E`, r18, h32, pad 8×10; focus
  border accent; error border `#F02744`; hint Saira `#7A7A7A`.
- **Badge / Chip** — transparent, 1px colored inner border, r4, Saira
  SemiCondensed Bold 12 uppercase.
- **StatusPill / Indicator** — 32 circle, tinted bg + 1px colored border, 24 icon.
- **Switch** — pill track; on `#16B566` (knob right), off `#1F1F1F` (knob left).
- **SegmentedControl** — pill container `#1F1F1F`, pad 4, items pad 6×18, Inter
  Medium 13; a single active pill slides between segments (the "drop"). Active:
  accent `#FF6A00`/`#141414`, or light `#F6F6F6`/`#141414`.
- **Tab View** (`Tabs`) — bordered pill container `#1F1F1F` / `#2E2E2E`, r18, pad 4,
  1px `#2E2E2E` dividers between items; Inter Medium 13, title-case, accent active.
- **Progress / Segments** — track `#1F1F1F` pill h8, fill `#FF6A00`.
- **Toast / Alert** — Toast pill `#1F1F1F` with leading Indicator; Alert tinted bg
  r12. Title Inter Bold 13 / Message Inter Regular 11 `#A0A0A0`.
- **Tile / Card / SettingsCard / SettingsRow** — Tile `#1F1F1F` r12 (widget tiles)
  / panels r18, border `#2E2E2E`.
- **Modal / Dialog / Popover / Select / Tooltip / Stepper / KeyChip / Separator /
  Checkbox / Textarea** — re-token to the above; accent focus; modals carry the
  only allowed shadows.

Usage (macOS HIG): one primary action per region; switches for instant settings;
segmented controls for mutually-exclusive in-context view switches; tabs for peer
categories; primary navigation only in the sidebar; destructive actions confirmed.

## Page layouts

- **Dash Editor** (1:1 with the Figma Layout) — three columns: left palette 248px
  (`#141414` r18: Pages/Widgets segmented + search + category groups + widget
  tiles 107×46 `#1F1F1F` r12), center canvas (`Container` 800×480 `#050505` r18,
  1px `#2E2E2E`), right Properties (`#141414` r18, "PROPERTIES" title). The
  Layout/Alerts/Settings switch is the **Tab View**; the editor toolbar (back +
  dash name + status chips + Tab View + save icon) is portaled into the shell
  header.
- **Home** — Live / Engineer / Setup as local segmented sections. The Live view
  shows a centered "no sim connected / waiting for telemetry" empty state when no
  game is running — never demo or placeholder telemetry.
- **Engineer / Setup / Devices / Settings / Help / Dash list** — designed fresh
  from the component library; decluttered, content-first, calm density.

## On-wheel dashboard renderer (technically separate, shared philosophy)

`app/internal/core/dashboard/*` and the `WidgetPreview` / `WidgetProperties` /
`AdditionalSettingsPanel` renderer target the physical wheel display (VoCore) and
use their own fonts (Bahnschrift / IBM Plex) and a separate Go painter. The
renderer remains **technically separate** from this desktop design system — do not
apply desktop tokens/fonts to it. It is **no longer visually independent**: it now
shares Sprint's flat product philosophy as a purpose-built instrument cluster —
pure black, calm, legible, rounded, materially flat (Luce/LoveFrom-inspired
*principles*, not a copy). See PRD #106.

**Fixed-background contract.** The dashboard canvas and every standard widget
surface are fixed to opaque `#000000` (`widgets.FixedCanvasBackground`). This is
**not** theme-driven and cannot create surface elevation. The only sanctioned
exception is an explicit per-widget background override (`WidgetStyle.Background`).
"Pure black" means `#000000`, not the desktop `Surface/Screen` token.

**Borders & geometry.** Each widget type owns a default border state in its
metadata; `WidgetStyle.Border` overrides it per instance (enable or disable).
Standard surfaces use rounded-rectangle instrument geometry by default
(`defaultPanelCornerRadius`) — no glass, blur, glow, gradient, or shadow.

**Alerts.** One shared dashboard-level `AlertConfig` (display `full`/`middle`,
color `normal`/`inverted`, shared duration) plus a set of enabled alert types —
not per-instance placement. Legacy per-instance alerts migrate via
`alerts.MigrateAlertConfig` (and `lib/dash/alertConfig.ts` on the frontend).

**Editor validation.** The editor permits temporary overlap while arranging, marks
every colliding region, and gates Save on layout validity
(`lib/dash/layoutValidation.ts`); the Go `ValidateLayout` backstop ensures an
invalid layout is never persisted or promoted to the live hardware layout.

**Theming.** Dashboards are coloured by a `DashTheme` + `DomainPalette` (6
racing-domain colours) + typography, resolved per widget as
`default → base → per-layout override → per-widget style`. Themes now affect
**accent, status, RPM, and racing-domain colours only** — the `bg`/`surface`
colour refs resolve to fixed system values (see the fixed-background contract
above), so choosing a theme can never alter the canvas, standard widget surface,
geometry, spacing, or typography. The *base* is either a
referenced **theme preset** (when a layout sets `themeId`) or the global default
(`GlobalDashSettings`). Theme presets form a **library** — predefined, read-only
built-ins (Sprint, Ice, Mono, Le Mans, Crimson, High Contrast) plus user presets
(create / duplicate / edit / delete) managed in the dashboard **Global settings**.
A dashboard selects a preset **by reference** in its editor Settings tab, so
editing a preset updates every dashboard using it (selection never copies or
overwrites the layout). The renderer default mirrors the compile-time tokens in
`widgets/palette.go` (frontend mirror: `app/frontend/src/lib/dash/defaults.ts`) —
these palette values are the renderer's own and are intentionally not part of the
desktop colour tables above.

## Accessibility

Keyboard-operable and screen-reader navigable: a visible `#FF6A00` focus ring on
every control; focus never obscured; semantic headings/landmarks; predictable tab
order; Enter/Space activate, Escape cancels; color is never the only status
signal; `prefers-reduced-motion` respected.

## Verification

- Type/test gates: `pnpm --filter @sprint/tokens test`, `@sprint/ui test` +
  `type-check`, `@sprint/desktop type-check`, and `pnpm --filter @sprint/desktop
  build` (Go embeds `dist/`; fonts must emit as woff2).
- Visual: `cd app; wails dev` then drive `http://localhost:5173/` with Playwright
  (the browser fallback can mock `window.go` to render desktop-runtime screens).
- Grep gates: no raw Figma hex outside `packages/tokens`; no `lucide-react` in
  `packages/ui`; no IBM Plex / CDN font imports in the desktop UI.
