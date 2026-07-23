# ADR 0026: Attention escalates without decorative motion

- Status: Accepted
- Date: 2026-07-15
- Scope: Wheel and application alert presentation

## Context

Warnings and faults must attract attention in proportion to operational urgency.
Using animation for ordinary state or allowing every alert to pulse would make
the interface noisy and reduce the distinction of truly critical conditions.
Wheel and desktop contexts also have different attention demands.

## Decision

The attention ladder is:

- **AssistActive** changes immediately to blue without animation.
- **Warning** is stable orange with a label, icon, or other non-color cue.
- **Critical** is red and may use bounded color inversion at no more than `2Hz`
  only while immediate driver action is required.
- **Fault** is stable red with explicit fault text or a fault code.
- **RaceControl** follows the behavior of its defined signal protocol.
- Desktop application alerts never flash; they use stable banners or inline
  status.
- Glow, bounce, scaling, and continuous pulsing are not alert mechanisms.

## Consequences

- Flashing or inversion requires a Critical condition and an immediate-action
  justification.
- Warning cannot animate merely to increase visual drama.
- Critical inversion must stop when the condition clears or no longer requires
  immediate action.
- Car-authentic behavior may be represented through an explicit profile, but the
  default Functional system follows this ladder.
- Alert previews must show stable and inverted phases without requiring users to
  endure continuous playback.
