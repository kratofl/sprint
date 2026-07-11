# Sprint Graphite Design System

Graphite is Sprint's canonical product language: the precision and density of a
professional motorsport instrument expressed with calm, material restraint. The
application is designed as one coherent object, not assembled from cards.

This document and the native Avalonia review captures are authoritative. The
older `docs/Sprint.fig`, `docs/design/figma/`, and extracted component images are
historical references only.

## Principles

- Reduce visible complexity without reducing capability.
- Use typography, alignment, spacing, and surface tone before adding containers.
- Keep the interface quiet at rest and expressive only when state needs attention.
- Use cards only for genuinely self-contained objects.
- Keep frequent actions close to their content and preserve keyboard workflows.
- Never add decoration solely to imply technology, speed, or luxury.

## Foundations

### Color

| Role | Value | Use |
|---|---:|---|
| Canvas | `#0B0B0D` | Stable content backdrop |
| Chrome | `#101012` | Toolbar/sidebar fallback |
| Content surface | `#141416` | Continuous content objects and panes |
| Raised/selected | `#1B1B1E` | Selection and real elevation |
| Hover/pressed | `#232327` | Transient interaction |
| Subtle edge | `rgba(255,255,255,.07)` | Real internal boundaries |
| Strong edge | `rgba(255,255,255,.12)` | Popovers and focus-adjacent edges |
| Primary text | `#F5F5F7` | Titles and important values |
| Secondary text | `#A1A1AA` | Body and labels |
| Tertiary text | `#6F6F78` | Metadata and inactive state |
| Accent | `#FF6A00` | Primary action, active state, focus, progress |

Green, yellow, red, and blue communicate success, caution, danger, and
information. They are never decorative. Orange should occupy little visual area.

### Typography

Inter is the only application face. Brand artwork may retain its lettering.
Frequently changing values use tabular figures.

| Style | Size / line | Weight |
|---|---:|---:|
| Page title | 24 / 29 | 600 |
| Section heading | 14 / 20 | 500 |
| Body/data | 13 / 18 | 400 |
| Metadata | 12 / 16 | 400 |
| Compact label | 11 / 14 | 500 |
| Primary telemetry | 28–36 | 500 |

Prefer size, placement, and contrast over heavy weight, uppercase, or tracking.

### Geometry and spacing

- Spacing follows a 4px foundation: 4, 8, 12, 16, 20, 24, 32.
- Controls use 7px corners; content objects use 10px; overlays use 12px.
- Pills are reserved for statuses, switches, and intrinsically pill-like selectors.
- Borders mark actual boundaries, not every row.
- Shadows are reserved for popovers, dialogs, menus, and overlapping editor layers.

### Motion

Use 120–180ms ease-out transitions for selection, pane reveal, and overlays.
Telemetry values update instantly. Motion explains origin and destination; it
must not decorate or delay work.

## Shell

The 44px unified toolbar occupies the native title-bar region and owns the Sprint
mark, sidebar control, current location, contextual tools, command search,
telemetry health, and rate. The duplicate drawn title and fullscreen control are
suppressed. Exactly three full-height, Avalonia-drawn caption controls with
system window roles occupy the right edge for minimize, snap/maximize, and close.
Page titles do not repeat in content.

The sidebar is 184px expanded and 52px collapsed. It contains Home, Dashes,
Devices, Setups, Settings, and Help. Unavailable roadmap areas and debug tools do
not appear in production navigation. The active item uses a quiet tonal fill,
primary text, and a narrow orange indicator.

Persistent chrome may request the Windows native backdrop. Content stays opaque.
Linux, headless, remote, and unsupported environments use the `#101012` fallback.

`Ctrl+K` opens command search. `Alt+1` through `Alt+6` follow sidebar order.

## Production layouts

- Home is an operational session overview followed by quiet dash and screen rows.
- Dashes is a continuous preview library; the editor canvas remains dominant.
- Devices is a stable list/detail split view with explicit binding-listen state.
- Setups is a list/editor split view with read-only templates and immediate user edits.
- Settings is one continuous preference column and saves values on commit.
- Help is a searchable reference list written in product language.

Edge panes in the dash editor use tone rather than rounded floating frames. The
widget palette uses compact list rows inside disclosure groups, with one group
expanded by default. The inspector aligns properties and adds
dividers only between semantic groups. Applying a dash to hardware remains explicit.

Page navigation appears once in the compact strip above the canvas; do not add a
second Pages/Widgets switch to the toolbar. The toolbar is limited to editor mode,
target profile, preview state, and Apply.

The rendered wheel dash uses a pure black canvas. Complex instruments use compact,
rounded outlines without a panel fill; simple readouts remain open unless a layout
groups them into explicit control cells. `Border: false` removes a default outline
and `Border: true` adds one. Fills are reserved for semantic alerts. The default
800×480 hierarchy places RPM across the top, a compact control strip directly below
it, gear and speed at the visual center, lap timing left, sector state right, and
delta plus live input traces adjacent to the focal value.

## Components and state

Reusable controls must define rest, hover, pressed, selected, focus, disabled,
loading/listening, and destructive states. Icon-only controls require an accessible
name and tooltip. Color is never the sole status signal. Enter/Space activate;
Escape cancels transient modes; tab order follows visual order.

## Verification

Review every production journey at 1440×900 and 1120×720 through the native
Avalonia harness. At a distance the primary content must be obvious; at normal
distance hierarchy must be calm; close inspection must show precise baselines,
spacing, icon weight, borders, and corner geometry.

Run the smallest functional tests during implementation, then the complete desktop
suite, `AgentUiReview`, `VisualSmokeTests`, token tests, and shared UI checks. Inspect
the resulting PNGs before claiming visual completion.
