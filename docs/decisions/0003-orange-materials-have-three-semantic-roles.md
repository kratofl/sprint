# ADR 0003: Orange materials have three semantic roles

- Status: Accepted
- Date: 2026-07-15
- Scope: Graphite accent material system

## Context

ADR 0002 establishes gradient material as the default treatment for orange
fills. A single gradient recipe cannot give a primary action, a quiet selection,
and a telemetry visualization the different contrast and attention levels their
functions require. Allowing every component to invent its own recipe would make
the interface inconsistent and difficult to tune.

## Decision

Graphite defines a shared family of three orange fill materials:

- **Action** provides a flat `#FF6A00` fill for primary controls and active tabs.
- **Selection** provides a quieter orange-derived fill for selected regions and
  persistent active state.
- **Telemetry** provides an orange fill optimized for perceiving value, progress,
  or magnitude in data visualizations.

The three roles remain recognizably related. They use the same orange hue family
and a shared lighting direction while varying contrast, opacity, and luminance
range to fit their semantic role.

Components consume the shared roles rather than defining bespoke orange
gradients. Exact stops and contrast values will be established separately and
expressed as shared tokens.

## Consequences

- Primary controls must not reuse the quieter selection material.
- Selected regions must not acquire the visual weight of primary actions.
- Telemetry material may encode value, but must remain visually related to the
  action and selection materials.
- Desktop and web consumers must eventually map the same semantic roles through
  their respective token implementations.
