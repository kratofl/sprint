# ADR 0016: Glance uses three value type roles

- Status: Accepted
- Date: 2026-07-15
- Scope: Glance information hierarchy

## Context

Glance values need a predictable hierarchy that reflects operational importance.
Allowing arbitrary metric sizes would encourage decorative oversized numerals or
make too many values compete as primary content.

## Decision

Desktop Glance surfaces use three value roles:

| Role | Size | Use |
| --- | ---: | --- |
| Primary | `32–40px` | The one or two values that define the current task |
| Supporting | `20–28px` | Values needed alongside the primary readout |
| Compact | `14–16px` | Context and secondary telemetry |

Glance labels remain `11–12px` and visually quiet. Operational importance, not
available space or visual drama, determines a value's role.

## Consequences

- A Glance composition has no more than two Primary values.
- Large empty space does not justify enlarging a metric beyond its operational
  role.
- Responsive layouts preserve role ordering even when selecting a smaller size
  within each range.
- Supporting and Compact values remain actual data and retain the readout anatomy
  and stability rules established by ADRs 0006 and 0007.
