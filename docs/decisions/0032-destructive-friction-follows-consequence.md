# ADR 0032: Destructive friction follows consequence

- Status: Accepted
- Date: 2026-07-16
- Scope: Deletion, confirmation, and undo

## Context

Confirming every deletion trains users to dismiss dialogs and slows routine work.
Performing irreversible deletion without explicit confirmation risks meaningful
data loss. The relevant distinction is recoverability and scope, not whether an
action happens to be labeled delete.

## Decision

- Recoverable deletion executes directly and offers a time-limited Undo action.
- Irreversible deletion requires confirmation that names the affected object and
  states the consequence.
- The final irreversible action uses a filled red button.
- Typed confirmation is reserved for unusually broad or severe data loss.
- Routine actions do not receive defensive confirmation dialogs.

## Consequences

- A feature must define recoverability before choosing its deletion interaction.
- Undo feedback is an exception to silent-success behavior because it exposes the
  recovery window.
- Confirmation copy cannot use generic phrases such as “Are you sure?” without
  identifying the object and loss.
- Closing a dialog or navigating away is not a substitute for an actual recovery
  mechanism.
