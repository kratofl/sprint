# ADR 0007: Glance readouts remain spatially stable

- Status: Accepted
- Date: 2026-07-15
- Scope: Live telemetry updates in Glance contexts

## Context

Live telemetry changes rapidly. Even legible type becomes difficult to read when
changing digit counts move units, shift neighboring values, alter precision, or
trigger decorative animation. Glance requires users to find and interpret a
value with minimal attention.

## Decision

Glance readouts remain spatially and typographically stable while their data
updates:

- Numeric values use tabular figures.
- A readout reserves space for its expected maximum display format.
- Unit placement and decimal precision remain stable during normal updates.
- Values update in place without bounce, count-up, reflow, pulse, or glow.
- Ordinary telemetry updates do not animate. Motion is reserved for meaningful
  state transitions.

Missing, stale, invalid, or disconnected values continue to occupy the same
reserved geometry and communicate their state without collapsing the layout.

## Consequences

- Formatting rules are part of the readout design rather than an incidental data
  concern.
- Values may be rounded to an operationally appropriate stable precision instead
  of exposing every available decimal.
- State transitions may change a readout's tone or supporting status, but must not
  move the readout.
- Loading placeholders and unavailable states must match the final value's
  geometry.
