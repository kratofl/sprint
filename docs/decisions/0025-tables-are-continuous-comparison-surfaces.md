# ADR 0025: Tables are continuous comparison surfaces

- Status: Accepted
- Date: 2026-07-15
- Scope: Tables and telemetry lists

## Context

Sprint tables and telemetry lists exist primarily for scanning and comparison.
Wrapping rows in cards or alternating strong background colors would fragment
columns and add chrome without improving comparison.

## Decision

- A table or telemetry list uses one continuous surface.
- Headers are quiet but readable.
- Numeric columns use tabular figures and align to the right.
- Rows use subtle separators rather than individual containers.
- Zebra striping is not used.
- Hover uses an immediate solid-neutral tonal change.
- Selection uses the quiet orange Selection material and remains distinct from
  keyboard focus.
- Changed values use a sign, arrow, or explicit text alongside semantic color.

## Consequences

- Column alignment must remain stable as values update.
- Row density follows the Workbench spacing rhythm unless the list is explicitly
  part of a Glance context.
- Color cannot be the only indicator of direction or change.
- Empty, loading, and unavailable table states occupy the continuous table region
  rather than appearing as unrelated floating cards.
