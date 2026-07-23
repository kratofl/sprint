# ADR 0021: Control shape follows control role

- Status: Accepted
- Date: 2026-07-15
- Scope: Control geometry

## Context

Circular and capsule controls can feel focused and refined, but applying them to
every desktop control would consume horizontal space, weaken alignment with
inputs, and give secondary actions excessive prominence. Sprint needs a role-based
shape language that works in dense Workbench layouts as well as isolated actions.

## Decision

- Icon-only buttons may be circular when width and height are equal.
- Capsules may be used for isolated primary actions, segmented selectors,
  statuses, and switches.
- Ordinary text buttons, inputs, menus, and dense Workbench controls use the
  standard `8px` control radius.
- Shape follows behavior and composition rather than being selected as decoration.

## Consequences

- A circular control requires a clear icon, accessible name, and tooltip.
- Text-labeled buttons in dense rows and stacks remain rounded rectangles.
- Capsule use must not turn every action into a visually dominant object.
- This decision refines ADR 0013 without changing its four standard radius roles.
