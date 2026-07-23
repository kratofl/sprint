# ADR 0031: Icons use one restrained optical system

- Status: Accepted
- Date: 2026-07-16
- Scope: Application iconography

## Context

Mixed icon families, weights, sizes, and decorative badges would make Sprint feel
assembled from unrelated components. Dense desktop controls also require icons
that remain crisp and identifiable without becoming visually dominant.

## Decision

- Icons use simple outline geometry with consistent optical weight.
- Standard size roles are `16px` for controls, `20px` for navigation, and `24px`
  only for rare emphasis.
- Filled icons are used only when fill itself communicates selected or critical
  state.
- Expanded navigation and important actions retain text labels.
- Every icon-only control has an accessible name and tooltip.
- Tinted icon backgrounds are reserved for meaningful category or state rather
  than decoration.

## Consequences

- New icons must be optically reviewed alongside existing icons at their target
  size, not only on a large artboard.
- A different icon family cannot be introduced for a single feature without
  reconciling weight and geometry.
- Color and fill cannot be the only state cue.
- Circular icon buttons follow ADR 0021 and do not imply action priority by shape
  alone.
