# ADR 0019: Unavailable actions explain their state

- Status: Accepted
- Date: 2026-07-15
- Scope: Component availability and transient states

## Context

A generically dimmed control communicates that an action cannot currently run,
but not whether it is waiting, loading, listening, blocked by missing input, or
irrelevant. Sprint contains hardware and telemetry workflows where those
distinctions are operationally important.

## Decision

- An unavailable action remains visible only when its location, capability, or
  future availability is useful in the current context.
- A visible unavailable action exposes a concise reason nearby or through an
  accessible tooltip.
- Loading, listening, waiting, and unavailable are distinct component states with
  explicit labels or indicators. They do not collapse into generic disabled
  styling.
- An action with no relevance in the current context is removed rather than
  disabled.
- State changes use direct feedback and do not shift surrounding layout.

## Consequences

- Disabled styling cannot be the only explanation for blocked behavior.
- Hardware discovery, input capture, telemetry connection, and apply-to-device
  workflows need purpose-specific state language.
- Space for state text or indicators should be reserved where transitions are
  expected.
- Tooltips supplement but do not replace visible status when the reason is
  operationally significant.
