# ADR 0027: Only overlapping UI receives elevation

- Status: Accepted
- Date: 2026-07-15
- Scope: Surface elevation and shadows

## Context

Graphite is built from solid tonal surfaces. Shadows on persistent panes or cards
would make the application appear assembled from floating layers. Actual overlays
still need a clear boundary from content beneath them.

## Decision

- Dialogs, menus, tooltips, and popovers use a solid raised surface, a `1px`
  boundary, the `16px` overlay radius where their size permits, and one soft
  neutral shadow.
- Modal backdrops use a plain dark scrim without blur.
- Sidebars, cards, editor panes, and inline disclosures use tonal separation
  without shadows.
- Glass, ambient glow, and multiple stacked shadow layers are not used.

## Consequences

- Shadow communicates physical overlap rather than general premium styling.
- Persistent panels cannot use elevation to compensate for weak spacing or tonal
  hierarchy.
- Small overlays may use a smaller established radius when `16px` would distort
  their geometry.
- Overlay contrast and edges must remain legible without backdrop blur.
