# ADR 0029: Reversible edits use silent optimistic feedback

- Status: Accepted
- Date: 2026-07-15
- Scope: Mutation feedback and acknowledgement

## Context

Reversible edits should feel direct and should not generate repetitive success
notifications. Operations that cross a hardware, engineer, invite, or cloud
boundary cannot honestly be presented as complete until the external target
acknowledges them.

Optimistic behavior is determined by reversibility and acknowledgement, not only
by whether a remote API is involved.

## Decision

- Reversible local edits update the interface immediately and persist silently.
- Successful background persistence does not produce a toast or other attention
  event.
- If persistence fails, Sprint retains the user's edit where safe, marks it as not
  saved, explains the failure, and offers retry or recovery.
- Hardware application, engineer commands, invitations, cloud synchronization,
  and similar external operations use explicit `Pending`, `Confirmed`, and
  `Failed` states.
- Sprint never claims connection, device output, delivery, or synchronization
  before acknowledgement.

## Consequences

- Dash editing, settings, setup values, naming, sorting, and other reversible
  local changes can remain immediate and quiet.
- Success feedback is reserved for operations where confirmation carries useful
  information, not routine autosave.
- Pending operations reserve stable space for status and do not disable unrelated
  work unnecessarily.
- Failure recovery must preserve enough local state to retry without re-entering
  the change.
