# ADR 0023: Inputs use stable filled-neutral fields

- Status: Accepted
- Date: 2026-07-15
- Scope: Text and numeric input presentation

## Context

Inputs need to remain readable in a dark, dense desktop interface without
becoming bright outlined boxes. Placeholder-only labels disappear during entry,
and telemetry or setup units can shift or become ambiguous when treated as
ordinary placeholder text.

## Decision

- Inputs use a solid neutral fill with a quiet `1px` boundary.
- Labels remain outside the field and persist while editing.
- Placeholders provide examples or formatting hints and never replace labels.
- Units occupy a stable trailing position.
- Keyboard focus uses the established immediate `2px` modality-aware ring.
- Validation uses explicit text and a red non-color-supported cue.
- Expected validation space or an equivalent stable layout treatment prevents
  surrounding form content from shifting unexpectedly.
- Underline-only fields and bright persistent outlines are not used.

## Consequences

- Empty, populated, focused, invalid, read-only, and unavailable fields remain
  distinguishable.
- Numeric fields align values and units consistently across a form.
- Validation messages must identify the problem and, when useful, the correction.
- Field containers use the standard `8px` control radius.
