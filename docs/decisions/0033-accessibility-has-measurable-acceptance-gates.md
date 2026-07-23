# ADR 0033: Accessibility has measurable acceptance gates

- Status: Accepted
- Date: 2026-07-16
- Scope: Application and wheel accessibility verification

## Context

Terms such as readable and accessible are not sufficient acceptance criteria.
Sprint needs measurable contrast targets and explicit platform checks, with a
stricter target for operational Glance and wheel values viewed under limited
attention.

## Decision

- Normal text has at least `4.5:1` contrast against its background.
- Large text and meaningful control boundaries have at least `3:1` contrast.
- Primary Glance and wheel values target at least `7:1` contrast.
- Semantic wheel colors have at least `4.5:1` contrast against their background.
- State, direction, comparison, and action never depend on color alone.
- Primary journeys remain usable by keyboard, with Narrator/UI Automation, in
  Windows contrast themes, and at `200%` text scaling.
- Visual verification includes common color-vision simulations.

These product gates use WCAG 2.2 and Windows accessibility guidance as their
baseline even though Sprint is a native desktop application.

## Consequences

- Token changes require automated or repeatable contrast checks.
- Custom Avalonia controls require accessible names, roles, values, keyboard
  behavior, and suitable automation peers.
- The `7:1` operational target takes precedence over a preferred muted treatment
  for primary data.
- Contrast-theme and text-scaling behavior must be verified rather than inferred
  from default framework behavior.
- Color-vision simulation supplements rather than replaces contrast measurement
  and non-color cues.
