# ADR 0034: Tabs use normal orange while segmented controls and navigation use neutral

- Status: Accepted
- Date: 2026-07-16
- Scope: Application navigation and active control states
- Supersedes: ADR 0020

## Context

The quiet brown-orange Selection material made active tabs and persistent
navigation feel heavier and muddier than intended. Navigation is always visible,
so even a restrained orange gradient occupies too much visual attention. Active
segmented controls and tabs, however, benefit from a direct relationship to the
normal Sprint orange used by primary controls.

## Decision

- Persistent sidebar selection uses the brighter neutral raised surface.
- The selected navigation item retains stronger foreground text and a
  solid-orange leading indicator or icon.
- Active tabs use the normal-orange Action material with dark foreground text.
- Segmented controls use a brighter neutral active fill and preserve equal,
  centered option geometry.
- The quiet Selection material remains available for selected data regions where
  the normal-orange fill would overpower the content.
- Hover and keyboard focus remain independent, immediate states.

## Consequences

- Persistent navigation becomes calmer and easier to distinguish from an action.
- Active tabs use one recognizable orange material instead of a darker
  component-specific gradient, while compact segmented choices remain quieter.
- Orange-filled active controls must retain sufficient contrast with their dark
  foreground text.
