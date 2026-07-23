# ADR 0013: Graphite uses a four-step radius scale

- Status: Accepted
- Date: 2026-07-15
- Scope: Application geometry

## Context

The existing Graphite contract uses a compressed `7 / 10 / 12px` radius scale.
The evolved direction calls for smooth, carefully proportioned corners that may
feel rounder than traditional Windows software without becoming inflated or
playful. Geometry also needs to distinguish nested, standard, grouped, and truly
elevated surfaces.

## Decision

Graphite uses a four-step corner-radius scale:

| Radius | Role |
| ---: | --- |
| `6px` | Dense nested elements and compact icon backgrounds |
| `8px` | Buttons, inputs, and standard controls |
| `12px` | Meaningful grouped surfaces |
| `16px` | Dialogs, popovers, and large elevated surfaces |

Capsules are reserved for statuses, switches, and selectors whose behavior or
content intrinsically justifies the shape.

## Consequences

- The previous `7 / 10 / 12px` scale is superseded.
- Nested elements use a smaller radius than their containing surface.
- Cards, table rows, and data fields do not become rounded containers by default.
- Arbitrary per-component radius values require a demonstrated geometric need.
- Desktop and web implementations should expose the four roles as shared tokens.
