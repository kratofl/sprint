# ADR 0024: Application charts preserve data shape

- Status: Accepted
- Date: 2026-07-15
- Scope: Application telemetry charts

## Context

Telemetry charts need to emphasize the current or selected series without adding
visual noise or implying values that were not measured. Gradient material can
support magnitude perception, but gradient strokes and decorative curve smoothing
would weaken precision.

## Decision

- The current or selected series uses a solid orange line.
- An orange Telemetry-material area fill may be added when it improves magnitude
  perception.
- An explicit comparison series uses a solid blue line.
- Continuous telemetry uses linear interpolation.
- Discrete states use stepped rendering.
- Decorative curve smoothing is not used.
- Grid lines are minimal, axes remain stable, and the current value is clearly
  separated from plot chrome.
- Incoming samples do not animate.

## Consequences

- Orange gradient material may fill an area but does not replace the crisp solid
  series stroke.
- Charts must choose interpolation from the data domain rather than visual taste.
- Comparison blue belongs to the application UI color domain and does not redefine
  wheel-dashboard blue semantics.
- Live updates preserve scale and position unless a deliberate range change is
  clearly communicated.
