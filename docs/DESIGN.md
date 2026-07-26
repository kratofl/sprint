# Sprint Graphite Design System

Graphite is Sprint's canonical product language: a professional motorsport
instrument expressed with precision, restraint, calm hierarchy, and exceptional
care. Functionality comes first. Material, typography, spacing, and motion exist
to make the product easier to read and operate.

Apple product design, Jony Ive's product philosophy, the Ferrari Luce interior,
watchOS, and modern macOS are references for care and restraint, not sources to
copy. Sprint remains a Windows desktop application with its own design language.

This document is the canonical implementation contract. Accepted decisions are
recorded in `docs/decisions/`; terms are defined in `docs/DESIGN_GLOSSARY.md`.
Native Avalonia review captures are the visual authority. `docs/Sprint.fig`,
`docs/design/figma/`, and extracted component images are historical references.

## Principles

- Reduce visible complexity without reducing capability.
- Make actual data easier to find, separate, and read.
- Use position, size, contrast, typography, and color in that order.
- Use spacing, alignment, and surface tone before adding containers.
- Keep the interface quiet at rest and expressive only when state needs attention.
- Keep frequent actions close to their content and preserve keyboard workflows.
- Add motion only when it explains geometry or preserves orientation.
- Never add decoration solely to imply technology, speed, gaming, or luxury.

When two solutions work, prefer the one that is easier to understand, faster to
scan, visually quieter, more consistent, more useful during driving, and less
dependent on decoration.

## Attentional contexts

Graphite has two contexts that share one visual language but use different
information density.

### Glance

Glance serves live driving information and operational session state. Its defining
requirement is clear separation and readability of actual data under limited
attention. Values remain distinct from labels, chrome, and neighboring readouts;
their positions remain stable.

### Workbench

Workbench serves dash editing, setup work, device configuration, and settings. It
supports denser controls, comparison, exact manipulation, and keyboard-first
operation without losing Graphite's calm hierarchy.

A mixed screen establishes one dominant context. The secondary context remains
visually subordinate.

## Foundations

### Neutral surfaces

Graphite uses solid, layered dark surfaces. Neutral gradients are not used.

| Role | Value | Use |
| --- | ---: | --- |
| Canvas | `#0B0B0D` | Stable application backdrop |
| Chrome | `#101012` | Toolbar and sidebar fallback |
| Content surface | `#141416` | Continuous content panes and objects |
| Raised/selected base | `#1B1B1E` | Real elevation and selected-state base |
| Hover/pressed | `#232327` | Immediate interaction feedback |
| Subtle edge | `rgba(255,255,255,.07)` | Functional internal boundaries |
| Strong edge | `rgba(255,255,255,.12)` | Overlays and focus-adjacent edges |
| Primary text | `#F5F5F7` | Titles and important values |
| Secondary text | `#A1A1AA` | Body, units, and labels |
| Tertiary text | `#6F6F78` | Metadata and inactive state |

Depth comes from the solid tonal stack, spacing, alignment, typography, and
boundaries with meaning. Cards exist only for genuinely self-contained objects.

Only UI that physically overlaps content receives elevation. Dialogs, menus,
tooltips, and popovers use a solid raised surface, one `1px` edge, and one soft
neutral shadow. Modal backdrops use a plain dark scrim without blur. Persistent
panes, sidebars, cards, and inline disclosures do not use shadows.

Glass, ambient glow, backdrop blur, metallic shading, glossy reflection, and
multiple shadow layers are not part of Graphite.

### Application orange materials

Sprint orange is `#FF6A00`. In the application UI it is a restrained brand and
interaction accent for primary action, active state, focus, progress, and
selection. It occupies little visual area.

Primary orange fills are flat `#FF6A00`. Quieter selection and telemetry
materials may use restrained, same-family vertical shading. Components consume
three semantic materials:

- **Action** is the flat normal-orange fill for primary controls and active tabs.
- **Selection** is a quieter tinted fill reserved for selected data regions
  where a full orange control fill would overpower the content.
- **Telemetry** is tuned for perceiving value, progress, or magnitude in an
  application visualization.

Exact material values are shared tokens, not per-component inventions.

Thin functional marks remain solid `#FF6A00`: text, icons, focus rings, selection
indicators, outlines, and chart lines. Neutral surfaces remain solid.

### Typography

Inter is the application face in both Glance and Workbench. The rendered wheel
instrument uses Saira Semi Condensed only for numeric values; wheel labels and
supporting text remain Inter. Brand lettering remains artwork. Space Grotesk is
not used in product UI.

Continuously changing values use tabular figures.

| Style | Size / line | Weight |
| --- | ---: | ---: |
| Page title | 24 / 29 | 600 |
| Section heading | 14 / 20 | 500 |
| Body/data | 13 / 18 | 400 |
| Metadata | 12 / 16 | 400 |
| Compact label | 11 / 14 | 500 |
| Glance Primary | 32–40 | 500 |
| Glance Supporting | 20–28 | 500 |
| Glance Compact | 14–16 | 400–500 |

A Glance composition has no more than two Primary values. Operational importance,
not empty space, determines the role. Prefer size, placement, and contrast over
heavy weight, uppercase, tracking, or decorative scale.

### Geometry

Graphite uses four standard corner roles:

| Radius | Role |
| ---: | --- |
| `6px` | Dense nested elements and compact icon backgrounds |
| `8px` | Buttons, inputs, and standard controls |
| `12px` | Meaningful grouped surfaces |
| `16px` | Dialogs, popovers, and large elevated surfaces |

Icon-only buttons may be circular when width and height match. Capsules are
limited to isolated primary actions, segmented selectors, statuses, and switches.
Ordinary text buttons, inputs, menus, and dense controls use the `8px` radius.
Shape follows behavior and composition.

### Spacing

Spacing follows a `4px` foundation.

- Workbench primarily uses `4 / 8 / 12px` within controls and `16 / 24px`
  between semantic groups.
- Glance stays compact within a readout and uses `24 / 32 / 40px` between major
  data zones.

Responsive layouts reduce or reflow secondary regions before weakening actual-data
readability.

### Motion

Graphite uses direct state feedback rather than transition on every property.

- Hover, press, focus, selection color or border changes, and telemetry updates
  use `0ms`.
- Hover never changes control size, scale, or surrounding layout.
- Fixed-position content replacement may use an `83–120ms` fade when it clarifies
  the change.
- Position and size changes use `120–167ms` ease-out only when continuity helps
  explain pane reveal, sidebar collapse, reordering, or overlay origin.
- Transient toasts enter and exit with a `160ms` ease-out translation/fade. Their
  bottom progress bar drains linearly across the full `12s` visible lifetime.
- Compact toasts constrain and wrap their message column before the trailing action;
  notification copy must never render beneath or collide with action controls.
- Motion remains interruptible and never bounces, springs, glows, or overshoots.
- Reduced-motion mode removes spatial transitions while preserving immediate state
  feedback.

## Glance readouts

The default Glance readout has a quiet label, a high-contrast value, and a
subordinate unit attached in a stable position. Whitespace and aligned baselines
separate neighboring readouts. Dividers or grouped surfaces appear only when
spacing and alignment cannot prevent ambiguity. A metric is not automatically a
card.

Readouts reserve space for their expected maximum format. Unit position and
decimal precision remain stable. Values update in place without bounce, count-up,
reflow, pulse, or glow. Missing, stale, invalid, and disconnected values retain
their geometry and show `—` with an explicit connection state; an old value is
never frozen and presented as live.

Primary Glance values remain neutral at rest. Application orange appears only
when it adds interaction or state meaning, not merely because a value is central.

## Wheel-dashboard color and attention

The rendered wheel dashboard is a separate color domain. Orange means Warning,
not brand accent. Default focal values remain neutral.

### Functional and Styled systems

Every dashboard declares one color system:

- **Functional** is the default and uses the condition mappings below.
- **Styled** prioritizes visual composition and may remap Neutral, Good/OnTarget,
  ColdLow, AssistActive, Warning, timing, and primary accents.

Styled never changes layout, typography, readout stability, or non-color cues.
Critical and Fault remain red. RaceControl always retains its literal protocol
color.

Functional and Styled are internal palette classifications, not an editor mode
the author must understand. The Settings surface presents complete theme presets
with a rendered dashboard preview and representative-color swatch. Choosing the
default Graphite preset uses Functional mappings and a neutral swatch because it
has no brand-primary dashboard color; choosing an optical preset applies its
Styled palette and primary accent. Per-condition and generic accent overrides are
not exposed.

### Functional condition palette

| Condition | Default color | Meaning |
| --- | --- | --- |
| Neutral | White or gray | Valid data requiring no judgment |
| Good / OnTarget | Green | Explicitly evaluated desired range or target |
| ColdLow | Blue | Below an operating temperature, pressure, or lower bound |
| AssistActive | Blue | TC or ABS intervention, distinguished by channel and cue |
| Warning | Orange | Attention or action required |
| Critical | Red | Immediate operational risk |
| Fault | Red | Invalid data or system failure |
| RaceControl | Literal signal color | Flag or regulated protocol meaning |

Generic `information` and `success` are not wheel conditions. Shared colors do
not collapse distinct states: ColdLow differs from AssistActive, and Critical
differs from Fault.

Timing comparison is separate. Purple means fastest valid lap or sector overall
in the current session; green means a personal best that is not overall fastest;
neutral means valid timing without a best result. Orange and red never mean only
that a lap was slower.

The default RPM progression is green through the operating range, red near the
limit, and blue at the shift point. Its thresholds are derived from the available
maximum RPM today; a car-specific profile may replace the progression or
thresholds when the game exposes authoritative shift-light data. RPM stages do
not use Sprint's orange application accent. Yellow race-control signals remain
literal yellow and are separate from orange Warning.

Color is paired with stable position, text, iconography, threshold direction, or
another suitable cue.

### Attention ladder

- AssistActive changes immediately to blue without animation.
- Warning is stable orange with a label or icon.
- Critical is red and may use bounded foreground/background inversion at no more
  than `2Hz` only while immediate driver action is required.
- Fault is stable red with explicit text or a code.
- RaceControl follows its protocol.
- Desktop application alerts never flash.

Glow, bounce, scale, and continuous pulse are not alert mechanisms.

## Shell and navigation

The `44px` unified toolbar occupies the native title-bar region and owns the
Sprint mark, sidebar control, current location, contextual tools, command search,
telemetry health, and rate. The duplicate drawn title and fullscreen control are
suppressed. Exactly three full-height Avalonia caption controls retain the Windows
minimize, snap/maximize, and close roles.

The sidebar is `184px` expanded and `52px` collapsed. It is one integrated solid
chrome surface and contains Home, Dashes, Devices, Setups, Settings, and Help.
Unavailable roadmap areas and debug tools do not appear in production navigation.

The selected item uses the brighter neutral raised surface, stronger foreground
text, and a solid-orange leading indicator or icon. Hover is an immediate,
slightly quieter neutral change. Keyboard focus remains independent. Orange
navigation fills are not used.

Persistent chrome may request the Windows native backdrop. Content remains
opaque. Unsupported environments use the `#101012` fallback.

`Ctrl+K` opens command search. `Alt+1` through `Alt+6` follow sidebar order.

## Components and interaction

### Focus and availability

Keyboard navigation shows an immediate `2px` solid-orange focus ring. Pointer
interaction preserves logical focus without leaving the same persistent ring.
Focus and selection are independent and may coexist. Windows contrast themes use
system focus colors.

Unavailable actions remain visible only when their location or future availability
is useful, and expose a concise reason. Loading, listening, waiting, and
unavailable are distinct states. Irrelevant actions are removed.

### Buttons

- Primary uses orange Action material and is normally limited to one per action
  group.
- Secondary uses a solid raised-neutral surface and restrained edge.
- Tertiary uses text or icon treatment without a persistent container.
- Destructive uses red rather than orange and becomes filled red only at the final
  irreversible step.

Shape does not determine action priority.

### Inputs

Inputs use a solid neutral fill, quiet `1px` boundary, persistent external label,
and stable trailing unit. Placeholders provide examples, never replacement labels.
Focus uses the standard ring. Validation uses explicit text and a red cue without
unexpectedly shifting surrounding content. Underline-only and bright persistent
outlines are not used.

### Icons

Icons use one simple outline family with consistent optical weight. Standard sizes
are `16px` for controls, `20px` for navigation, and `24px` for rare emphasis.
Filled icons are limited to states where fill carries meaning. Expanded navigation
and important actions retain labels. Icon-only controls require an accessible name
and tooltip. Tinted icon backgrounds communicate category or state, not decoration.

### Charts

Application charts use a solid orange line for the current or selected series and
a solid blue line for explicit comparison. Orange Telemetry material may provide a
restrained area fill when magnitude benefits. Continuous data uses linear
interpolation; discrete state uses stepped rendering; decorative smoothing is not
used. Grid lines are minimal, axes remain stable, the current value is separated
from plot chrome, and incoming samples do not animate.

### Tables and lists

Tables and telemetry lists use one continuous surface, quiet headers, subtle row
separators, and right-aligned tabular numeric columns. They do not use per-row
cards or zebra striping. Hover is neutral; selection uses Selection material;
focus remains distinct. Direction and change use signs, arrows, or text alongside
semantic color.

### Content states

Empty states preserve page structure, explain what is absent, and offer one
relevant primary action. Brief loading remains direct; longer loading uses stable
placeholders matching final geometry. Fault states name the problem, retain safe
context, and expose recovery when possible.

### Saving and external operations

Reversible edits update immediately and persist silently. Routine success does not
produce a toast. On failure, Sprint retains the edit where safe, marks it not
saved, and offers recovery.

Hardware application, engineer commands, invitations, cloud synchronization, and
similar external work use explicit Pending, Confirmed, and Failed states. Sprint
never claims connection, output, delivery, or synchronization before acknowledgement.

### Destructive actions

Recoverable deletion executes directly and exposes a time-limited Undo action.
Irreversible deletion requires confirmation that names the object and consequence.
Typed confirmation is limited to unusually broad or severe data loss. Routine
actions do not receive defensive confirmation dialogs.

## Production layouts

- Home is an operational session overview followed by quiet dash and screen rows.
- Dashes is a continuous preview library; the editor canvas remains dominant.
- Devices is a stable list/detail split view with explicit binding-listen state.
- Setups is a list/editor split view with read-only templates and immediate user
  edits.
- Settings is one continuous preference column and saves values on commit.
  Debug builds add an explicit reset-to-defaults action for persisted app and
  editor preferences; it never removes dashboards, devices, or setups.
- Help is a searchable reference list written in product language.

Edge panes in the dash editor use tone rather than rounded floating frames. The
widget palette uses compact list rows inside disclosure groups, with one group
expanded by default. The inspector aligns properties and adds dividers only
between semantic groups. Applying a dash to hardware remains explicit.

Page navigation and page deletion live in the left editor rail behind a
full-width Pages/Widgets segmented control. Segmented controls use a neutral
active fill; tabs retain the normal-orange active material. The canvas does not
change width when the active page changes. The toolbar is limited to
Basic/Advanced mode, target profile, preview state, and Apply. Basic keeps direct
manipulation and essential widget configuration; Advanced adds exact grid
controls, style overrides, widget stacks, and technical authoring tools.

The Alerts surface uses a canvas with the same aspect and grid as the target
screen. The dash is subdued while editing so the selected alert remains the
focus. Each alert has draggable and resizable geometry and renders a quiet title
above one large new value. Color, duration, and inversion inherit from global
defaults and may be overridden subject to the selected color system.

The rendered wheel uses a near-black `#08080A` canvas. Readouts remain open on one
continuous instrument surface; outlines are reserved for authored groups. Fills
are reserved for semantic alerts. The default `800×480` Driving page places RPM
across the top, a compact control strip below, gear and speed at visual center,
lap timing left, sector state right, and delta plus live input traces adjacent to
the focal value. Endurance, Timing, and Vehicle pages reorganize secondary data
without removing gear or shift state.

## Window and responsive behavior

The default desktop window is `1440×900`; the supported minimum is `1120×720`.
Secondary panes collapse, reflow, or become locally scrollable before typography,
readout separation, or control targets shrink. Whole pages do not scroll
horizontally. Intrinsically wide editor canvases and data tables may scroll inside
their bounded region.

## Accessibility and verification

Graphite uses these acceptance gates:

- Normal text contrast is at least `4.5:1`.
- Large text and meaningful control boundaries are at least `3:1`.
- Primary Glance and wheel values target at least `7:1`.
- Semantic wheel colors are at least `4.5:1` against their background.
- State, comparison, direction, and action never depend on color alone.
- Primary journeys work by keyboard, with Narrator/UI Automation, in Windows
  contrast themes, and at `200%` text scaling.
- Visual review includes common color-vision simulations.

Review every production journey at `1440×900` and `1120×720` through the native
Avalonia harness. At a distance the primary content must be obvious; at normal
distance hierarchy must be calm; close inspection must show precise baselines,
spacing, icon weight, borders, and corner geometry.

During implementation, run the smallest functional tests first, then the complete
desktop suite, `AgentUiReview`, `VisualSmokeTests`, token tests, and shared UI
checks as applicable. Inspect the resulting PNGs before claiming visual completion.

## Anti-goals

Graphite is not a gaming HUD, esports skin, sci-fi cockpit, neon cyberpunk
dashboard, glassmorphic card grid, generic SaaS dashboard with orange applied, or
literal imitation of Apple, Ferrari, watchOS, macOS, or Windows.

Do not add strong glow, colorful ambient blobs, carbon fiber, fake metal, glossy
3D controls, racing stripes, checkered motifs, bright colored borders, excessive
animation, or decorative telemetry effects. Premium quality comes from restraint,
proportion, typography, spacing, interaction clarity, and precise execution.
