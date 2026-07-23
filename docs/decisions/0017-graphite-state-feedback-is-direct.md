# ADR 0017: Graphite state feedback is direct

- Status: Accepted
- Date: 2026-07-15
- Scope: Application motion and interaction feedback

## Context

A duration assigned to every interaction makes a precise desktop application
feel delayed. Hover, focus, press, selection, and live telemetry do not need
motion to explain where content came from. Position and size changes can still
benefit from brief continuity when an instant change would make the interface
harder to follow.

Primary-source guidance and its implications for Sprint are recorded in
`docs/research/direct-ui-motion.md`.

## Decision

Graphite uses direct state feedback and purpose-specific motion:

- Hover, press, focus, selection color or border changes, and telemetry updates
  use `0ms` transitions.
- Hover does not change control size, scale, or surrounding layout.
- Fixed-position content replacement may use an optional `83–120ms` fade when it
  materially clarifies the change.
- Position or size changes use `120–167ms` motion only when continuity helps the
  user follow a pane reveal, sidebar collapse, reordering, or overlay origin.
- Spatial motion uses direct ease-out behavior without bounce, spring overshoot,
  or decorative choreography.
- Reduced-motion mode removes spatial transitions while preserving meaning with
  immediate state changes or, where necessary, a brief opacity cue.

## Consequences

- Motion tokens describe a functional transition class rather than a universal
  component duration.
- Controls must feel responsive on the first rendered frame after input.
- Selection and focus are never delayed to create softness.
- A size animation cannot justify a hover geometry change that should not exist.
- New motion requires an explanation of the spatial or state relationship it
  communicates.
