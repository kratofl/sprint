# ADR 0018: Focus is modality-aware and distinct from selection

- Status: Accepted
- Date: 2026-07-15
- Scope: Keyboard focus and accessibility

## Context

Sprint must remain keyboard-friendly without surrounding every pointer-clicked
control with persistent focus decoration. Focus and selection also represent
different states: focus identifies the next keyboard interaction, while selection
identifies the current item or value.

ADR 0002 already requires thin orange functional marks such as focus rings to
remain solid rather than gradient-filled.

## Decision

- Keyboard navigation shows an immediate `2px` solid-orange focus ring.
- Pointer interaction does not show the same persistent ring, though logical
  focus continues to move correctly for input behavior and accessibility.
- Focus and selection have independent visual treatments and may coexist.
- Focus feedback uses `0ms` transition timing.
- Windows high-contrast mode uses the appropriate system focus colors rather
  than forcing Sprint orange.

## Consequences

- Components must track input modality or use an equivalent `focus-visible`
  behavior.
- A selected item cannot rely on the focus ring to communicate selection.
- Removing the visible pointer focus treatment must not remove programmatic focus
  or keyboard continuity.
- Custom controls must implement the same rule as standard controls.
