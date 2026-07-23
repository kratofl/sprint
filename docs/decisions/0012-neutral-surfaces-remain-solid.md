# ADR 0012: Neutral surfaces remain solid

- Status: Accepted
- Date: 2026-07-15
- Scope: Graphite application materials

## Context

The evolved Graphite direction uses gradient material for orange accent fills.
Whether the same material shading should extend to large neutral surfaces remained
unresolved. Applying gradients to the background or primary panes would add
ambient depth, but would also make gradients a general visual ingredient rather
than a specific accent treatment.

## Decision

Neutral application surfaces remain solid, including large application
backgrounds and continuous primary panes.

Depth and hierarchy in neutral regions come from the solid tonal surface stack,
spacing, alignment, typography, contrast, and boundaries with functional meaning.
Gradient material remains the default treatment for orange fills only.

## Consequences

- Application backgrounds, sidebars, content panes, cards, inputs, rows, and
  ordinary controls do not receive neutral gradients.
- Subtle dimensionality must not be simulated with ambient color blobs, gloss,
  metallic shading, or decorative highlights.
- Adjacent solid tones must be calibrated carefully enough to establish hierarchy
  without turning every region into a bordered card.
- Shadows remain reserved for real overlap or elevation rather than compensating
  for the absence of gradients.
