# CLAUDE.md — Sprint

Full conventions live in @AGENTS.md (read it). Design contract: `docs/DESIGN.md`.
This file is the always-loaded summary; AGENTS.md is the source of truth for
everything not listed here.

## Critical for agents (read first)

- **Windows / PowerShell only.** The `Makefile` shells out to PowerShell. Do NOT
  use bash-isms, `NUL`, or POSIX-only redirects in commands the user will run.
- **Do not touch `api/` or `web/`** unless explicitly asked. The active surface is
  `app/` (Wails desktop) + `packages/`.
- **Do not install tools/deps** unless asked.
- **Design = `docs/DESIGN.md`** (the Figma flat system). Do NOT hardcode hex; use
  token names from `packages/tokens`. The old "Graphite / IBM Plex" direction and
  its values (`#070707`, `#4F9CFF`, `#F5483D`, IBM Plex, radius 10, 40px titlebar)
  are **RETIRED** — ignore any Graphite/hex still referenced elsewhere.

## Verify loop (run after edits)

- **Type-check (primary gate, ~5s):** `pnpm --filter @sprint/desktop type-check`
  Its `pretype-check` hook rebuilds `@sprint/ui` + `@sprint/types` to `dist/`
  first, so cross-package edits ARE picked up. **Never** trust a bare `tsc` in
  `app/frontend` — it reads stale `dist`.
- **Frontend tests (~135, run in ~1s):** `pnpm --filter @sprint/desktop test`
  (= `node --test "src/**/*.test.ts"`, no build needed; Node 22 strips TS
  natively). NOTE: most of these are **source-text regex guards**, not render
  tests — green means "string still present", not "UI works". They false-fail on
  legitimate class/prop refactors; update the asserted string when you
  intentionally change markup. Behavioral render tests are `*.test.tsx` (vitest).
- **Package tests:** `pnpm --filter @sprint/ui test`, `pnpm --filter @sprint/tokens test`.
- **Lint:** the `@sprint/desktop` lint is currently a no-op (eslint is not wired);
  `type-check` is the real gate. Do not rely on `make lint` to catch UI issues.
- **Go / Wails build needs the frontend bundle first** (`//go:embed frontend/dist`):
  run `pnpm --filter @sprint/desktop build` before `cd app; go test ./...`,
  `go build`, or `wails build`, or you get an opaque "no matching files" embed error.

Build-chain order: `@sprint/tokens` / `@sprint/ui` (to `dist/`) → `@sprint/desktop`
frontend (`tsc -b && vite build`) → Go embed / `wails build`. The pnpm
dev/build/type-check/test scripts run the dependency build as a pre-hook; use them
rather than raw `tsc` / `vite`.

## Wails gotchas

1. **nil slice → JSON null.** Go bindings return empty slices as `null`, even
   though the generated TS type says `Array`. Coalesce array results with `?? []`
   before `.map` / `.filter` (see `app/frontend/src/lib/dash/api.ts`).
2. **Stale `App.js` after regenerate.** When you change a Wails-exported Go method,
   regenerate bindings (`cd app; wails generate module`), then **restart the Vite
   dev server** (kill port 5173) — the regenerated
   `wailsjs/go/main/App.js` is otherwise served stale (blank page + missing-export
   error).
3. **No `git stash` / `checkout` / `reset` in parallel edit agents** — concurrent
   edit-subagents share one working tree.

## Wails type boundary

Shapes exist 3×: Go structs → generated `app/frontend/wailsjs/go/models.ts` →
hand-written `app/frontend/src/lib/dash/types.ts`. The generated `models.ts` is
**never imported** (intentionally) — do not import from it. `lib/dash/types.ts`
is the frontend contract and `lib/dash/adapters.ts` is the only place Go JSON is
mapped in. Changing a Go DTO field requires hand-editing **both** `types.ts` and
the matching `adaptX` function — **type-check will NOT catch a missed field.**
Casing: device fields are camelCased by the adapter; color/theme shapes keep Go's
`R/G/B/A` names.

## File organization (`app/frontend/src`)

- `views/` — top-level pages wired into `App.tsx` nav (Home, Devices, DashEditor,
  Settings, Help). NOTE: Engineer / Telemetry / Controls views exist but are not
  currently mounted.
- `components/<feature>/` — page-specific composites (e.g. `dash-editor/`,
  `devices/`). Wails/hardware/page-specific behavior lives here.
- `lib/` — framework-free helpers. `lib/dash` is imported via the barrel
  **`@/lib/dash` (= `lib/dash.ts`, a file) — do NOT create `lib/dash/index.ts`**
  (it would shadow the barrel).
- `packages/ui` — reusable, app-agnostic visual controls (consumed as built
  `dist`). `packages/tokens` — design tokens. `packages/types` — shared TS types.
- **State:** local `useState` + per-feature controller hooks (e.g.
  `useDashEditorController.ts`). No global store; only one Context (shell header).
  Put pure/branching logic in a sibling `*State.ts` / `*ViewModel.ts` with a
  co-located `*.test.ts` — keep `.tsx` presentational.

## Pointers

- @AGENTS.md — full command list, focus rules, conventions.
- `docs/DESIGN.md` — UI/design contract (canonical; supersedes any Graphite refs).
- `docs/figma-spec/SPEC.md` — decoded, agent-readable Figma spec.
- `docs/ARCHITECTURE.md` — backend/runtime architecture decision record.
- `handoffs/LATEST.md` — local-only recent-session context; read at session start
  if present (gitignored).
