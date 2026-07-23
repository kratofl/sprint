# Sprint Design Glossary

This glossary defines product-design terms used by Sprint's Graphite language.
It grows alongside the accepted design decisions in `docs/decisions/`.

## Graphite

Sprint's canonical product and visual design language. Graphite expresses the
precision and density of a professional motorsport instrument through calm,
restrained, highly legible interfaces. It is an evolving implementation contract,
not a visual theme applied after product design.

## Canonical design contract

`docs/DESIGN.md`, the single implementation-facing source of truth for Sprint's
product and visual design. Accepted ADRs temporarily take precedence when the
contract has not yet been reconciled.

## Visual reference

Material used to calibrate care, restraint, hierarchy, or craft without becoming
a source to copy literally. Apple products, Jony Ive's product philosophy, the
Ferrari Luce interior, watchOS, modern macOS, and Sprint's historical Figma files
are visual references rather than design authorities.

## Accent fill

A region whose background or interior area carries Sprint orange, including a
primary button background, selected background, progress fill, or filled
telemetry visualization. Orange accent fills use a restrained, same-family
gradient by default.

## Functional orange mark

A thin orange foreground element whose job depends on crisp edges: text, an icon,
focus ring, selection indicator, outline, or chart line. Functional orange marks
use solid color rather than gradient material.

## Orange material family

The three related Graphite treatments for orange accent fills. All share the
same orange hue family and lighting direction, while their contrast and opacity
vary by function.

### Action material

The flat normal-orange fill used for the primary control in a context and for
active tabs. Segmented controls use a neutral active fill.

### Selection material

A quieter orange-derived fill for selected data regions where a normal-orange
control fill would overpower the content. Persistent navigation selection uses
a brighter neutral surface instead.

### Telemetry material

An orange fill tuned to communicate value, progress, or magnitude in a data
visualization without introducing decorative color.

## Top-lit material

A fill whose implied light source sits above the surface. In Graphite, orange
materials become slightly brighter toward the top and slightly darker toward the
bottom, without a diagonal highlight. The lighting is consistent and never
encodes telemetry magnitude.

## Attentional context

The attention condition for which a surface is designed. It determines density,
hierarchy, and interaction posture while preserving the shared Graphite visual
language.

### Glance

The attentional context for live driving information and operational session
state. Its primary requirement is clear separation and readability of actual
data under limited attention. Values remain distinct from labels, chrome, and
neighboring readouts, and their positions remain stable.

### Workbench

The attentional context for deliberate configuration and authoring. It supports
dense controls, comparison, exact manipulation, and keyboard-first operation
without sacrificing Graphite's calm hierarchy.

## Glance readout

The standard information object for presenting one operational value in a
Glance context. It combines a quiet label, a high-contrast value, and a
subordinate attached unit within stable reserved space. A Glance readout is not
automatically a card.

## Actual data

The current operational value or state a user came to a Glance surface to read.
Actual data is visually primary over its label, unit, explanatory copy, and
application chrome.

## Stable readout

A Glance readout whose position, reserved width, unit placement, precision, and
surrounding layout do not shift during normal telemetry updates. Missing, stale,
or invalid data remains in the same geometry rather than collapsing the layout.

## Color domain

A context in which a color has a consistent meaning. Sprint distinguishes the
application UI color domain from the authored wheel-dashboard color domain so
brand interaction color does not conflict with driver warnings.

### Application UI color domain

The desktop application's controls, navigation, chrome, editors, and surrounding
interface. Orange is a restrained brand and interaction accent in this domain.

### Wheel-dashboard color domain

The rendered instrument shown on a steering-wheel display, including its preview
inside the editor. Orange communicates warning in this domain and is not used
decoratively or merely to identify a focal value.

## Wheel condition

A racing-domain interpretation of live data, modeled separately from the color
used to render it. The standard conditions are Neutral, Good/OnTarget, ColdLow,
AssistActive, Warning, Critical, Fault, and RaceControl.

### Neutral

Valid data requiring no judgment. It normally renders in white or gray.

### Good / OnTarget

An explicitly evaluated desired range or target. It may render in green when
acknowledging that state is operationally useful.

### ColdLow

A value below its operating temperature, pressure, or other lower bound. It
renders blue by default.

### AssistActive

Active electronic intervention such as traction control or ABS. It renders blue
by default but remains distinct from ColdLow through channel, position, labeling,
and behavior.

### Warning

A condition requiring driver attention or action. It renders orange by default.

### Critical

A condition presenting immediate operational risk. It renders red by default.

### Fault

Invalid data or a system failure. It renders red by default but remains distinct
from Critical in text, iconography, or state presentation.

### RaceControl

A flag or regulated signal whose literal color and protocol carry the meaning.
It is not remapped through the general condition palette.

### RPM progression

The ordered shift-light stages derived from engine speed. Functional Graphite
uses green, then red, then blue as its baseline and displays the complete
sequence in theme previews. A car-specific profile may replace those colors or
thresholds when authoritative telemetry is available.

## Timing comparison

A semantic family for comparing valid laps and sectors. Purple means fastest
overall in the current session, green means a personal best that is not fastest
overall, and neutral means valid timing without a best result.

## Dashboard color system

The declared intent governing how an authored wheel dashboard maps conditions
and accents to color.

### Functional color system

The default wheel-dashboard color system. It prioritizes rapid interpretation
and uses Graphite's standard racing-domain condition mappings.

### Styled color system

An optics-first wheel-dashboard color system. It allows the palette and primary
accents to change as an intentional alternative to the Functional default. It
does not change the dashboard's layout, typography, or readout-stability rules.

## Protected wheel condition

A wheel condition whose color cannot be changed by the Styled color system.
Critical and Fault remain red, while RaceControl preserves the literal color of
its flag or regulated signal.

## Neutral surface

A non-accent Graphite background, pane, card, row, input, or control surface.
Neutral surfaces use solid tonal values; their hierarchy comes from tone,
spacing, alignment, typography, and functional boundaries rather than gradients.

## Radius role

One of Graphite's four intentional corner treatments: `6px` for dense nested
elements, `8px` for standard controls, `12px` for meaningful grouped surfaces,
and `16px` for overlays and large elevated surfaces. A capsule is a separate
behavioral shape, not another general radius token.

## Contextual spacing rhythm

The subset of Graphite's `4px` spacing foundation emphasized by an attentional
context. Workbench uses compact internal and group spacing; Glance uses stronger
separation between major data zones while keeping each readout internally compact.

## Application typeface

Inter, used throughout the desktop application in both Glance and Workbench
contexts.

## Wheel value typeface

Saira Semi Condensed, reserved for numeric values on rendered wheel dashboards.
Wheel labels and supporting text remain Inter.

## Glance value role

One of three operational type tiers: Primary (`32–40px`) for the one or two
task-defining values, Supporting (`20–28px`) for directly related data, and
Compact (`14–16px`) for contextual telemetry. Role follows importance rather
than available space.

## Direct state feedback

An immediate (`0ms`) visual response to hover, press, focus, selection, or live
data. Direct feedback changes tone, border, or another non-geometric property
without scaling or shifting the control.

## Continuity motion

A brief `120–167ms` transition used only when actual position or size changes and
the movement helps the user understand origin, destination, or reordering.

## Modality-aware focus

Focus presentation that responds to the active input method. Keyboard navigation
shows an immediate `2px` solid-orange ring; pointer interaction preserves logical
focus without leaving the same persistent ring. Focus is distinct from selection.

## Unavailable action

A relevant action that cannot currently run because a specific precondition is
missing. It remains visible only when useful and exposes the reason. It is
distinct from loading, listening, waiting, and an action irrelevant to the
current context.

## Integrated sidebar

Navigation rendered as part of the application's continuous chrome surface. Its
selection, hover, and focus states are layered within that surface rather than
placed in a separate floating card.

## Role-based control shape

The rule that control geometry follows behavior and composition. Equal-sized
icon-only buttons may be circular; isolated primary actions and intrinsically
capsule-like controls may use capsules; ordinary desktop controls use the `8px`
standard radius.

## Action level

A button's priority within its local action group. Primary uses orange Action
material, Secondary uses a solid raised-neutral surface, and Tertiary uses text
or icon treatment without a persistent container. Destructive is a semantic
modifier and uses red rather than orange.

## Filled-neutral input

An input field with a solid neutral surface, quiet `1px` boundary, persistent
external label, and stable trailing unit when applicable. Focus and validation
add state cues without replacing the field's base geometry.

## Data-shape-preserving chart

An application chart that uses linear interpolation for continuous telemetry and
stepped rendering for discrete state, without decorative smoothing. Solid orange
identifies the current series, solid blue identifies comparison, and orange
Telemetry material may provide a restrained magnitude fill.

## Continuous comparison surface

A table or telemetry list whose rows share stable columns, one surface, and
subtle separators. It avoids per-row cards and zebra striping so alignment and
value differences remain the dominant visual structure.

## Attention ladder

The escalation from direct AssistActive color, to stable Warning, to red Critical
with optional bounded inversion, while Fault remains stable and RaceControl
follows its protocol. Desktop application alerts never flash.

## Bounded inversion

An optional Critical wheel-alert behavior that alternates foreground and
background color at no more than `2Hz` only while immediate driver action is
required. It is not a general pulse animation.

## Elevated surface

A solid Graphite surface that physically overlaps other content, such as a
dialog, menu, tooltip, or popover. It may use one boundary and one soft neutral
shadow. Persistent panes and cards are not elevated surfaces.

## Honest telemetry state

A disconnected, stale, invalid, or faulted presentation that preserves readout
geometry while replacing unavailable live data with `—` and explicitly naming
the connection state. It never presents an old value as though it were current.

## Silent optimistic edit

A reversible change applied immediately and persisted without success
notification. If persistence fails, the edit is retained where safe, marked as
not saved, and given a recovery path.

## Acknowledged operation

An operation crossing a hardware, engineer, invitation, or cloud boundary. It
uses explicit Pending, Confirmed, and Failed states and is never presented as
complete before the external target acknowledges it.

## Supported window bounds

Sprint's `1440×900` default and `1120×720` minimum desktop sizes. Responsive
layouts preserve operational content by reflowing or collapsing secondary panes,
not by uniformly scaling typography and controls.

## Icon size role

One of Graphite's three optical icon sizes: `16px` for controls, `20px` for
navigation, and `24px` for rare emphasis. Size, stroke weight, and fill follow the
icon's functional role rather than decorative preference.

## Consequence-based destruction

A destructive interaction model in which recoverable actions execute directly
with Undo, irreversible actions require explicit consequence-aware confirmation,
and typed confirmation is limited to unusually broad or severe data loss.

## Accessibility acceptance gate

A measurable condition required before a Sprint journey is visually complete:
contrast targets, non-color cues, keyboard operation, Narrator/UI Automation,
Windows contrast themes, `200%` text scaling, and color-vision simulation.
