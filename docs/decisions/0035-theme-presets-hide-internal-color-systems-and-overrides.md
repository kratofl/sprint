# ADR 0035: Theme presets hide internal color systems and overrides

- Status: Accepted
- Date: 2026-07-16
- Scope: Wheel-dashboard theme authoring
- Supersedes: ADR 0010

## Context

Functional and Styled were useful concepts for defining rendering behavior, but
exposing them as an editor control asks the author to understand an internal
model. Per-condition and legacy accent overrides further fragment a theme into
technical choices without showing the resulting dashboard clearly.

## Decision

- Functional and Styled remain internal persistence and rendering
  classifications.
- The editor exposes complete theme presets instead of a color-system switch.
- Each preset shows a rendered preview of the current dashboard and a
  representative-color swatch. Optical presets use their primary accent;
  Graphite uses neutral because Functional has no brand-primary dashboard color.
- The editor does not expose per-condition overrides or legacy generic accent
  controls.
- The Graphite preset restores the default Functional palette. Optical presets
  apply their Styled palette implicitly.

## Consequences

- Theme selection becomes visual and direct.
- Authors compare outcomes instead of configuring implementation terminology.
- Existing stored overrides remain readable for migration compatibility but are
  no longer editable through this surface.
