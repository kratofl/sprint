# ADR 0010: Wheel dashboards offer Functional and Styled color systems

- Status: Superseded by ADR 0035
- Date: 2026-07-15
- Scope: Authored wheel-dashboard color customization

## Context

Protecting every semantic color produces the clearest operational instrument but
prevents users from creating dashboards around a preferred visual palette.
Allowing ordinary themes to recolor semantic slots, conversely, makes it unclear
whether a dashboard is optimized for condition recognition or appearance.

These are different design intentions and should not be hidden inside one palette
system.

## Decision

Wheel dashboards offer two explicit color systems:

- **Functional** is the default. It prioritizes rapid interpretation and uses the
  racing-domain condition mappings defined by ADR 0009.
- **Styled** prioritizes visual composition. It allows the dashboard palette and
  primary accents to be changed as an intentional alternative to the functional
  default.

The selected system is a dashboard-level property, not an accidental result of
individual color overrides. Functional remains the default for new dashboards.

The exact set of protected colors or states inside Styled remains a separate
decision.

## Consequences

- Users can tell whether a dashboard promises the standard functional semantics.
- Theme previews and editors must identify the active color system explicitly.
- A Styled dashboard must not be presented as though it follows the complete
  Functional condition palette.
- Functional and Styled may share layout, typography, spacing, and readout rules;
  this decision separates color intent, not the entire dashboard design system.
- The current generic theme presets do not express this distinction and should be
  reconsidered when implementation is authorized.
