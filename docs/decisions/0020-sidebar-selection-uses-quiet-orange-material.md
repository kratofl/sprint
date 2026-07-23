# ADR 0020: Sidebar selection uses quiet orange material

- Status: Superseded by ADR 0034
- Date: 2026-07-15
- Scope: Application navigation states

## Context

The sidebar must feel integrated into the application shell while making the
current location obvious. A bright orange navigation block would give persistent
chrome the visual weight of a primary action. A neutral-only selection would not
express Sprint's interaction accent strongly enough.

## Decision

- The sidebar is one integrated solid chrome surface, not a floating card.
- The selected item uses the quiet orange Selection material, stronger foreground
  text, and a solid-orange leading indicator or icon.
- Hover uses an immediate solid-neutral tonal change.
- Keyboard focus uses the independent modality-aware focus ring.
- A bright, fully saturated orange navigation block is not used.

## Consequences

- Hover, selection, and focus remain visually distinguishable when combined.
- Selection material must stay substantially quieter than Action material.
- The orange fill follows the shared top-lit material direction, while the thin
  indicator or icon remains solid.
- Sidebar grouping relies on spacing and labels rather than multiple nested cards.
