# ADR 0022: Buttons use three action levels

- Status: Accepted
- Date: 2026-07-15
- Scope: Button hierarchy and destructive actions

## Context

Buttons need clear priority without making every action a filled object. Orange
Action material must identify the primary next action, while secondary,
supporting, and destructive actions require distinct treatment.

## Decision

- **Primary** buttons use the orange Action material and are normally limited to
  one per action group.
- **Secondary** buttons use a solid raised-neutral surface and restrained border.
- **Tertiary** buttons use text or icon treatment without a persistent container.
- **Destructive** actions use red semantics rather than orange. A destructive
  action becomes a filled red button only at the final irreversible step.

The geometry rules in ADR 0021 apply independently from the action level.

## Consequences

- Multiple orange buttons cannot compete inside one action group.
- A circular or capsule shape does not automatically make a button Primary.
- Destructive confirmation surfaces must not use orange for the final action.
- Secondary and tertiary buttons retain immediate hover, press, focus, and
  availability states.
