# ADR 0036: Primary orange is flat

- Status: Accepted
- Date: 2026-07-16
- Scope: Application primary actions and active tabs
- Supersedes: ADR 0004 for the Action material

## Context

The top-lit gradient made primary actions and active tabs feel more visually
aggressive than the interface hierarchy requires. Sprint's normal orange is
already distinctive without material shading.

## Decision

- The Action material is a flat `#FF6A00` fill.
- Primary buttons and active tabs use this flat fill with dark foreground text.
- Segmented controls and persistent navigation use neutral active surfaces.
- Selection and telemetry materials may retain restrained shading when it
improves data-region hierarchy or value perception.
- Brand artwork is outside this rule.

## Consequences

- Primary controls read more directly and consistently.
- Orange no longer changes appearance across the height of a compact control.
- Hover, focus, and selection must remain distinguishable without relying on an
  action-fill gradient.
