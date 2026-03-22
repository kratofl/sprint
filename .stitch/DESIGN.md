# Design System: Sprint
**Project:** Sprint — Sim Racing Telemetry Platform

## 1. Visual Theme & Atmosphere

Dark, minimal, and precise — like the cockpit instrumentation of a racing car translated into software. The aesthetic draws from Apple's visionOS glass layers and macOS Sonoma's frosted surfaces, applied to a data-dense engineering tool. Surfaces feel physical: they float above a deep, near-black background through frosted glass and soft layered shadows. Content is always the hero — no decorative chrome, no gradients for their own sake. The mood is focused, fast, and confident.

The app exists in two contexts: a **native desktop app** (Wails, used by the driver at their rig) and a **web app** (used for analysis and remote race engineering). Both share the same visual language.

Keywords: glassmorphism, dark mode, data-dense, minimal, frosted, precise, technical luxury, real-time, collaborative.

## 2. Color Palette & Roles

**Background — Void Black (#080809)**
Near-black with an almost imperceptible warm undertone. A subtle accent-tinted radial gradient at the top of the page gives depth for glass surfaces to blur against.

**Primary Accent — Burnt Sienna Orange (#EF8118)**
The driver's color. Primary buttons, active navigation, focus rings, important data highlights, and anything the driver controls or owns. Hover at (#F59132), active at (#D4700F).

**Secondary Accent — Deep Teal (#1EA58C)**
The engineer's color. Secondary actions, engineer-originated commands, comparison mode highlights, and the "compared" side in lap/driver comparisons. Hover at (#22BC9F), active at (#198A76). When a command or change originates from the race engineer, it appears in teal — consistently distinguishing engineer actions from driver actions throughout the UI.

**Primary Text — Soft White (#F2F2F3)**
Slightly off-white to reduce harshness against the dark background.

**Secondary Text — Slate Gray (#8A8A95)**
Labels, column headers, timestamps, metadata, and helper text.

**Disabled Text — Dim Gray (#52525C)**
Placeholders and inactive elements.

**Glass Border — Translucent White (rgba 255,255,255 at 8% opacity)**
All glass surface borders. Creates the subtle edge definition of frosted panels.

**Solid Border — Dark Charcoal (#27272D)**
Non-glass borders: table rows, inputs, dividers inside data-dense surfaces.

**Success — Emerald Green (#34D399)**
Personal bests, improvements, live session indicators, positive deltas.

**Warning — Amber (#FBBF24)**
Caution states, yellow flags, values approaching limits.

**Danger — Coral Red (#F87171)**
Errors, time losses, deleted items, sector regressions.

**Data Series Colors (chart/comparison use only — never for UI chrome):**
- Series 1: Sky Blue (#60A5FA) — Lap 1 / Driver A / Reference
- Series 2: Violet (#A78BFA) — Lap 2 / Driver B
- Series 3: Emerald (#34D399) — Lap 3 / Driver C / Best
- Series 4: Amber (#FBBF24) — Lap 4 / Driver D
- Series 5: Pink (#F472B6) — Lap 5 / Driver E
- Series 6: Cyan (#22D3EE) — Lap 6 / Driver F

## 3. Typography Rules

**Primary Typeface: Inter (variable weight 100–900)**
Clean, neutral, and extremely legible at small sizes — ideal for data tables and dashboards.

**Monospaced Typeface: Inter Mono (or system monospace fallback)**
All numeric telemetry values — lap times, sector times, speed, g-force, deltas — must use the monospaced variant with tabular figures. Prevents layout shift as values update in real time.

**Scale:**
- Extra small (12px): axis labels, fine metadata, timestamps
- Small (14px): body text, table rows, descriptions — the workhorse size
- Base (16px): default prose and form labels
- Large (18px, medium weight): section subheadings
- XL (20px, semibold): card titles, panel headers
- 2XL (24px, semibold): page-level headings
- 3XL (30px, bold, monospaced): hero stat values like best lap time displayed prominently

**Hierarchy principle:** Vary color (foreground vs muted) to create hierarchy, not font weight alone.

## 4. Component Stylings

**Buttons:**
Pill-curved corners (12px radius). Primary buttons are filled Burnt Sienna Orange with near-black text — driver actions. Secondary buttons are filled Deep Teal with soft white text — engineer or comparison actions. Ghost buttons have no background. Minimum height 36px.

**Cards and Panels:**
Frosted glass surfaces — semi-transparent white fill at very low opacity (4%), medium backdrop blur (12px), subtle inset top highlight (simulates light refraction), generous curves (16px radius), soft layered drop shadow. Cards feel like they hover just above the background.

**Dropdowns, Popovers, Tooltips:**
Elevated glass — slightly more opaque (7% fill, 20px blur). Rounded at 12px.

**Modals and Sheets:**
Overlay glass — most opaque level (10% fill, 32px blur). Large rounded corners (20px). Deep shadow.

**Tables:**
Solid, non-glass surfaces for data legibility. Dark charcoal borders between rows. All numeric columns use monospaced tabular figures.

**Engineer Command Toasts:**
Glass surface with a teal left border or teal dot indicator. Always in teal — the engineer's color — so the driver immediately recognizes the source.

**Target Lap Indicator:**
Prominent glass card showing the current delta reference lap. Displays lap number, time, and who set it (driver via wheel button = orange label, engineer = teal label).

**Race Engineer Status Bar:**
Fixed to the bottom of the desktop app window when an engineer session is active. Thin glass strip (36px) with a pulsing teal dot, engineer name, and connection latency.

## 5. Layout Principles

**Sidebar-first layout.** A fixed 240px sidebar holds navigation. Collapses to 64px (icon-only) in compact mode. Main content capped at 1280px, padded 32px horizontally, 24px vertically.

**4px grid.** All spacing uses multiples of 4px.

**Glass panels separate concerns.** Each distinct data context lives inside its own glass card. Related metrics use solid-bordered stat rows for legibility.

**Data density over whitespace.** Compact table rows, tight label-value pairs, small supporting text.

**Comparison layout.** Side-by-side panels with a translucent divider. Left (reference) in orange, right (comparison) in teal. Consistent throughout any comparison view.

**Desktop compact mode.** Below 1280px window width, the sidebar collapses to icons and cards reduce padding. Supports use on secondary monitors at a rig.

**Engineer session layout.** A persistent 36px status bar anchors to the bottom of the desktop app when a race engineer is connected. It never overlaps content — the main layout accounts for its height.

