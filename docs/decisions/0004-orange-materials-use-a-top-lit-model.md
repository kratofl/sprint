# ADR 0004: Orange materials use a top-lit model

- Status: Superseded by ADR 0036
- Date: 2026-07-15
- Scope: Graphite accent material lighting

## Context

The three-role orange material family needs a consistent lighting model. Varying
gradient direction by component would make the accent feel like a collection of
effects rather than one material system. In telemetry, using gradient direction
to represent magnitude would also confuse material lighting with data encoding.

## Decision

All orange fill materials use a restrained vertical, top-lit model: the top is
slightly brighter and the bottom is slightly darker. The material has no
diagonal highlight.

Telemetry magnitude is communicated through data geometry such as fill extent,
area, or opacity. Gradient direction remains fixed and does not encode value.

## Consequences

- Action, selection, and telemetry fills share a coherent implied light source.
- Components may vary the role-appropriate luminance range and opacity, but not
  the gradient direction.
- Reversed, radial, diagonal, animated, and component-specific orange lighting
  require a new explicit design decision.
- Exact material stops remain token-level calibration work and must preserve the
  restrained character of the system.
