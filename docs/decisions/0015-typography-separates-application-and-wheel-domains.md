# ADR 0015: Typography separates application and wheel domains

- Status: Accepted
- Date: 2026-07-15
- Scope: Product typography

## Context

Sprint needs approachable desktop typography and highly space-efficient wheel
readouts. Applying a condensed motorsport face throughout the application would
push Graphite toward a generic racing aesthetic, while using only the application
face on constrained wheel displays would give up useful numeric density.

The repository currently includes Inter, Saira Semi Condensed, and Space Grotesk,
so the intended role of each must be explicit.

## Decision

- Inter is the application typeface, including labels and values on desktop
  Glance surfaces.
- Saira Semi Condensed is reserved for numeric values on rendered wheel
  dashboards.
- Inter is used for labels and supporting text on rendered wheel dashboards.
- Brand lettering remains artwork rather than an interface typeface.
- Space Grotesk is not introduced into product UI.
- Continuously changing numeric values use tabular figures in both domains.

## Consequences

- The wheel may feel instrument-specific without making the surrounding desktop
  application resemble a racing HUD.
- Application and wheel components cannot choose among bundled fonts as a visual
  preference.
- Typography tests and visual review must cover both Inter and Saira rendering.
- Removing an unused font asset is separate implementation work and is not
  authorized by this decision.
