# ADR 0001: Graphite is the authoritative product design language

- Status: Accepted
- Date: 2026-07-14
- Scope: Sprint product and visual design

## Context

Sprint already identifies Graphite as its canonical product language in
`docs/DESIGN.md`. A new product and visual direction further defines the desired
character through precision, restraint, subtle material depth, and operational
clarity, drawing inspiration from Apple product design and the Ferrari Luce
interior without imitating either.

Keeping the new direction separate from Graphite would create competing design
authorities. It would also leave unresolved differences such as the new
direction's qualified support for subtle gradients versus the current blanket
prohibition on gradients.

## Decision

The new product and visual direction is a controlled evolution of Graphite and
is authoritative for future Sprint design work.

`docs/DESIGN.md` remains the single canonical implementation contract. Decisions
confirmed through the design interview will be recorded as ADRs and then
reconciled into that document once the direction reaches shared understanding.

Historical Figma files and captures remain references rather than competing
sources of truth.

## Consequences

- New UI work must follow the evolved Graphite direction.
- Existing UI is evaluated against the evolved direction when it is touched; this
  decision does not authorize an indiscriminate visual rewrite.
- Any conflict between older guidance and a confirmed ADR is resolved in favor of
  the ADR until `docs/DESIGN.md` is reconciled.
- Visual inspiration informs quality and principles, not literal component or
  platform imitation.
