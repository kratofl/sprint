# ADR 0037: Functional Graphite uses racing semantics, not brand orange

- Status: Accepted
- Date: 2026-07-16
- Scope: Default wheel-dashboard palette and theme preview

## Context

Graphite is both Sprint's application design language and the name of the
default dashboard preset. Treating Sprint orange as the dashboard's primary
color made the Functional preset look like another optical theme and conflicted
with the wheel-domain rule that orange means Warning.

Real shift-light sequences vary by car. Sprint still needs an honest baseline
when telemetry supplies maximum RPM but no authoritative per-car light profile.

## Decision

- Functional focal values and the Graphite preset swatch are neutral.
- Orange is reserved for the Functional Warning condition.
- The baseline RPM sequence is green in the operating range, red near the limit,
  and blue at the shift point.
- Theme preset previews use a redline frame so the complete RPM sequence is
  visible.
- Literal yellow race-control signals stay yellow and do not reuse Warning.
- Optical presets may recolor RPM endpoints through their Styled primary and
  accent colors. Protected safety states remain red.
- A future car-specific profile may replace baseline RPM colors or thresholds
  when authoritative data is available.

## Consequences

- Graphite reads as a functional racing instrument instead of an orange skin.
- The preview explains the semantic distinction before a preset is applied.
- Application branding and wheel-dashboard condition colors remain separate.
