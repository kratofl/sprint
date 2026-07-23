# ADR 0002: Orange fills use gradient material

- Status: Accepted
- Date: 2026-07-15
- Scope: Graphite accent rendering

## Context

Sprint orange (`#FF6A00`) communicates primary interaction, active state,
focus, progress, selected values, and important telemetry. The evolved Graphite
direction permits subtle gradients, but applying gradients to every orange mark
would reduce the crispness of small text, icons, strokes, and indicators.

## Decision

Gradients are the default material treatment when the orange accent is rendered
as a fill.

This applies to filled regions such as primary button backgrounds, selected
backgrounds, progress fills, and filled telemetry visualizations. The gradient
must remain within the orange color family and read first as a coherent orange
surface rather than as a graphic effect.

Orange used for text, icons, focus rings, selection indicators, outlines, and
chart lines remains solid. These thin functional marks prioritize edge clarity
and stable semantic recognition.

## Consequences

- The current blanket prohibition on gradients is replaced by a role-based rule.
- Orange-filled components should use shared material tokens rather than bespoke
  per-component gradients.
- A solid-orange fallback must preserve meaning and hierarchy when gradients are
  unavailable or removed.
- This decision does not increase how frequently orange is used; orange remains
  an accent occupying a small portion of the interface.
