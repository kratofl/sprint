# ADR 0014: Spacing rhythm follows attentional context

- Status: Accepted
- Date: 2026-07-15
- Scope: Graphite layout spacing

## Context

Graphite needs one coherent spacing system, but Glance and Workbench have
different separation requirements. Workbench must remain compact enough for
precise editing, while Glance must make major data zones immediately distinct.
Using uniformly large spacing would waste desktop space; using uniformly compact
spacing would weaken operational readability.

## Decision

Graphite retains a `4px` spacing foundation and applies it through two contextual
rhythms:

- **Workbench** primarily uses `4 / 8 / 12px` within controls and `16 / 24px`
  between semantic groups.
- **Glance** remains compact within each readout but uses `24 / 32 / 40px`
  between major data zones.

Spacing roles follow hierarchy rather than being selected only to fill available
space.

## Consequences

- Glance separation comes from zone-level whitespace, not oversized padding
  inside every value or card.
- Workbench density may not collapse distinct semantic groups into one undifferentiated
  control field.
- Values outside these ranges require a layout-specific reason and should still
  align to the `4px` foundation where possible.
- Responsive layouts may reduce a gap by one role before reducing actual-data
  readability or collapsing readout anatomy.
