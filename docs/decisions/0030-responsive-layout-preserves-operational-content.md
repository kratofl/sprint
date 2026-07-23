# ADR 0030: Responsive layout preserves operational content

- Status: Accepted
- Date: 2026-07-15
- Scope: Desktop window bounds and responsive behavior

## Context

Sprint is a dense desktop application with editor panes and Glance readouts that
cannot remain useful if typography and control geometry shrink indefinitely. The
current application and visual harness already establish `1440×900` as the
default and `1120×720` as the supported minimum.

## Decision

- The default window size remains `1440×900`.
- The supported minimum remains `1120×720`.
- As width or height decreases, secondary panes collapse, reflow, or become
  locally scrollable before typography, readout separation, or control targets
  are reduced.
- Whole application pages do not gain horizontal scrolling.
- Intrinsically wide regions such as an editor canvas or data table may scroll
  within their own bounded region.
- Glance value roles, readout anatomy, and major-zone separation retain their
  hierarchy at the minimum size.

## Consequences

- Layouts must be visually verified at both supported sizes.
- The dash editor may use its compact pane arrangement at the minimum size.
- Additional content cannot be made to fit by uniformly scaling the interface.
- Supporting information may move behind a disclosure, but actual data and the
  primary task remain visible.
