# Frontend Visual Verification

Use this when frontend work changes layout, visual hierarchy, interaction flow,
empty/error/loading states, or any reusable UI primitive.

## Required Screenshots

- Desktop viewport: 1440 x 900.
- Narrow viewport: 390 x 844.
- For dashboard canvas or preview work: prove the canvas is nonblank and framed.
- For data-driven Wails screens: use `wails dev` or a deliberate `window.go` mock.

## Review Checklist

- No overlapping text or controls.
- Primary action is clear and singular per region.
- Loading, empty, error, disabled, selected, hover, and focus states are visible
  where the workflow needs them.
- Icon-only controls have names or visible labels nearby.
- Keyboard path is predictable.
- Numbers and tabular data align.
- No local visual language appears beside shared Sprint primitives.
- Existing actions from the pre-change screen are still reachable.

## Evidence In Final Response

Agents must report:

- URLs or commands used.
- Screenshot paths.
- Viewports checked.
- Any screen that could not be verified and why.
