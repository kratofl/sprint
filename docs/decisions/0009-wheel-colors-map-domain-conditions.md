# ADR 0009: Wheel colors map domain conditions

- Status: Accepted
- Date: 2026-07-15
- Scope: Authored wheel-dashboard semantic color

## Context

Generic application states such as `information`, `success`, and `danger` do not
describe racing telemetry accurately. Primary-source research also found no
universal motorsport dashboard palette: professional systems are configurable,
individual cars use different mappings, and FIA colors standardize narrow
race-control signals rather than a general cockpit UI vocabulary.

Blue illustrates the problem. It commonly represents both active traction
control and a cold or too-low value. Those conditions may share a default color,
but they are not the same semantic state. Timing comparison adds another domain:
purple communicates an overall fastest lap or sector, not a general application
status.

Research supporting this decision is recorded in
`docs/research/racing-dashboard-color-semantics.md`.

## Decision

Wheel dashboards model racing-domain conditions independently from their visual
color mapping. The default model is:

| Condition | Default color | Meaning |
| --- | --- | --- |
| Neutral | White or gray | Valid data requiring no judgment |
| Good / On target | Green | An explicitly evaluated desired range or target |
| Cold / Too low | Blue | Below an operating temperature, pressure, or lower bound |
| Assist active | Blue | TC or ABS intervention, identified by its channel and cue |
| Warning | Orange | Attention or action is required |
| Critical | Red | Immediate operational risk |
| Fault | Red | Invalid data or system failure |
| Race control | Literal signal color | The flag or regulated signal retains its own meaning |

Generic `information` and `success` states are not part of the wheel-dashboard
vocabulary.

Timing comparison is a separate semantic family:

- Purple means the fastest valid lap or sector overall in the current session.
- Green means the driver's personal-best lap or sector when it is not the
  session-overall fastest.
- Neutral means valid timing without a best result.
- Orange and red are not used merely because a lap or sector is slower.

Color is always paired with stable position, a label, an icon, threshold
direction, or another non-color cue appropriate to the condition.

## Consequences

- `ColdLow` and `AssistActive` remain distinct states even though both default to
  blue.
- `Critical` and `Fault` remain distinct states even though both default to red.
- Purple must not become a decorative accent outside timing comparison.
- Green does not mean generic software success on the wheel.
- Race-control colors are not reinterpreted through the telemetry condition
  ladder.
- The existing `DashPalette` names `Accent`, `Success`, `Warning`, and `Danger`
  do not accurately represent the accepted domain model and should be migrated
  when implementation work is authorized.
