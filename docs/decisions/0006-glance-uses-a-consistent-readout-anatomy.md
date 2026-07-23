# ADR 0006: Glance uses a consistent readout anatomy

- Status: Accepted
- Date: 2026-07-15
- Scope: Glance data presentation

## Context

Glance surfaces must make actual data readable and clearly separated under
limited attention. Wrapping every metric in a card would create repetitive
chrome and weaken the distinction between meaningful groups and individual
values. Unstructured text, however, would allow labels, units, and neighboring
values to compete.

## Decision

The default Glance readout has a consistent anatomy:

- A quiet label occupies a predictable position.
- The value has the strongest contrast and uses tabular numerals when numeric.
- The unit stays attached to its value but is visually subordinate.
- Reserved whitespace and aligned baselines separate neighboring readouts.
- Dividers or grouped surfaces are introduced only when spacing and alignment do
  not prevent ambiguity.

A readout does not receive a card solely because it contains a metric. Containers
represent meaningful grouping, not the existence of data.

## Consequences

- Labels and units must not compete with values for attention.
- Repeated readouts should share label, value, unit, and baseline geometry.
- Numeric formatting must account for expected value width so adjacent readouts
  remain separated as telemetry changes.
- Designers must first attempt separation through layout before adding a border,
  surface, or shadow.
- Exceptional visual treatment requires an operational reason such as warning,
  selection, or comparison.
