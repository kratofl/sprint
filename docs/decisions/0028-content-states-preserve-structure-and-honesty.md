# ADR 0028: Content states preserve structure and honesty

- Status: Accepted
- Date: 2026-07-15
- Scope: Empty, loading, connectivity, and fault states

## Context

Empty, loading, disconnected, stale, and faulted states can replace useful
context with generic illustrations or spinners. Telemetry adds a safety concern:
an old value frozen in place may be mistaken for live data.

## Decision

- Empty states preserve page structure, explain what is absent, and offer one
  relevant primary action when a next action exists.
- Brief loading remains direct without flashing a transient spinner.
- Longer loading uses stable placeholders that match the final content geometry.
- Disconnected or stale telemetry preserves each readout's position, replaces
  unavailable data with `—`, and shows an explicit connection state.
- A stale value is never frozen and presented as though it were live.
- Fault states identify the problem, retain safe context, and expose retry or
  recovery when available.

## Consequences

- State presentation does not cause the surrounding page to reflow.
- Skeletons or placeholders are used only when final geometry is known.
- Demo or simulated telemetry cannot silently substitute for a disconnected real
  source.
- Connection, stale, and fault messages use product language rather than raw
  exceptions, while diagnostic detail remains available where useful.
