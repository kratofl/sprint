# ADR 0011: Styled dashboards protect Critical, Fault, and RaceControl

- Status: Accepted
- Date: 2026-07-15
- Scope: Styled wheel-dashboard color customization

## Context

ADR 0010 allows a Styled color system that prioritizes visual composition over
the complete Functional condition palette. Some meanings, however, carry an
immediate safety or protocol obligation that should survive aesthetic
customization.

## Decision

Styled dashboards may remap Neutral, Good/OnTarget, ColdLow, AssistActive,
Warning, timing-comparison, and primary-accent colors.

The following conditions remain protected and retain their Functional colors:

- **Critical** remains red.
- **Fault** remains red.
- **RaceControl** preserves the literal color of the flag or regulated signal.

All remapped states retain a non-color cue such as a label, icon, stable field
position, threshold direction, or bounded behavior.

## Consequences

- Styled means visually customizable, not safety-unbounded.
- A palette editor must identify protected slots and prevent or reject changes to
  them.
- Imported themes cannot override protected colors silently.
- Warning may be remapped in Styled, so it must remain identifiable without
  relying on its fill color.
- Functional remains the appropriate choice when standard condition recognition
  matters more than visual authorship.
