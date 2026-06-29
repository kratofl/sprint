# Frontend Quality Contract

This document is the working contract for agents changing Sprint frontend code.
It covers desktop React, shared UI, tokens, and any web frontend work that changes
user-facing behavior.

## Required Pre-Work

Before editing frontend code, write a short contract in the task notes or PR:

- Screen or component being changed.
- User workflow affected.
- Existing components and helpers that must be reused.
- States that must remain or be added: loading, empty, error, disabled, selected,
  focus, hover, destructive confirmation.
- Runtime boundaries: Wails calls, DTO adapters, generated bindings, mock data,
  and fallback behavior.
- Protected behavior from the current implementation.
- Verification commands and visual checks to run.

## Implementation Rules

- Prefer `packages/ui` primitives and `packages/tokens` values before local UI.
- Keep branching logic in `*State.ts` or `*ViewModel.ts` files with tests.
- Keep `.tsx` components presentational unless the existing pattern for that
  feature already owns local controller logic.
- Coalesce Wails array results with `?? []` before `.map`, `.filter`, or iteration.
- Do not import generated `wailsjs/go/models.ts`; map Go JSON in adapters.
- Do not access `window.go` directly from components. Use existing runtime APIs.
- Do not remove existing visible states or actions during visual rewrites.
- Icon-only controls need an accessible name.
- Clickable non-button elements need role, tabIndex, and keyboard activation, or
  should be replaced with a real button.
- Destructive actions need confirmation unless the existing flow already provides
  an undo path.

## Design Rules

- Use `docs/DESIGN.md` and `docs/figma-spec/SPEC.md` for the product language.
- Do not add raw hex outside tokens, brand assets, and explicitly allowed tests.
- Do not revive retired Graphite values or IBM Plex desktop UI usage.
- Use `@tabler/icons-react` for runtime icons. Do not add new `lucide-react`
  imports.
- Do not add glass, glow, blur, or gradient surfaces. Brand assets are exempt.
- Keep layouts dense, scannable, keyboard-operable, and explicit about state.

## Required Verification

Run the smallest relevant checks, plus the frontend quality gate:

```powershell
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop test
pnpm check:frontend-quality
```

For visual or workflow changes, also capture screenshots in desktop and narrow
viewports. If the screen depends on Wails data, use `wails dev` or a deliberate
mock of `window.go`; do not judge data-driven screens from an empty localhost
fallback.

For screenshot requirements and review criteria, follow
`docs/FRONTEND_VISUAL_VERIFICATION.md`.
