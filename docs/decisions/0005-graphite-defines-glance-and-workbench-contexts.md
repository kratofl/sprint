# ADR 0005: Graphite defines Glance and Workbench contexts

- Status: Accepted
- Date: 2026-07-15
- Scope: Product information density and attention design

## Context

Sprint supports both attention-limited monitoring and deliberate configuration.
A live driver or someone checking session state needs immediate recognition and
stable data, while a user editing a dash, configuring hardware, or adjusting a
setup needs compact controls and exact manipulation. Applying one density model
to both conditions would weaken at least one of them.

## Decision

Graphite defines two attentional contexts that share the same visual language:

- **Glance** is used for live driving information and operational session state.
  It prioritizes clear separation and readability of the actual data. Values must
  remain distinct from labels, application chrome, and adjacent readouts under
  limited attention. Layout is stable and priority is immediately apparent.
- **Workbench** is used for dash editing, setup work, device configuration, and
  settings. It supports denser controls, exact manipulation, comparison, and
  keyboard-first operation.

Context changes information density and hierarchy, not brand identity. Both
contexts use Graphite's shared typography, geometry, materials, semantic colors,
and interaction principles.

## Consequences

- Making Workbench controls larger does not turn a screen into Glance.
- Making Glance data smaller to fit more values is not acceptable when it weakens
  separation or recognition.
- Glance surfaces require an explicit priority order and stable value placement.
- Workbench may expose more controls and metadata, but it must remain calm and
  legible.
- A screen containing both contexts must establish a clear dominant context and
  keep the secondary region visually subordinate.
