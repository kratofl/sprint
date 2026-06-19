# Sprint Agent Guide

This is the neutral, agent-facing entrypoint for the Sprint repository. Keep it
short, current, and tool-agnostic. Put deep project docs in `README.md`,
`docs/DESIGN.md`, or package-local documentation instead of expanding this file.

## Scope

- Stay inside this repository. Do not read, write, execute, or otherwise operate
  outside the project folder unless the user explicitly asks.
- Do not install tools, CLIs, language servers, or other system-wide software.
  Do not run `make setup` unless the user explicitly asks for Wails CLI setup.
- Only install project dependencies through the project's package managers when
  needed for the apps, such as `pnpm install` or Go module commands.
- Prefer targeted fixes over broad refactors unless the task requires structural
  change.
- Work with existing user changes. Do not revert unrelated edits or deleted
  files unless the user explicitly requests it.

## Default Focus

- Prioritize work in `app/`, especially the Wails desktop app and its embedded
  React frontend.
- Only change `api/` or `web/` when the user asks, or when a shared contract
  requires corresponding consumer updates.
- When shared DTOs, shared TypeScript types, shared UI, or shared tokens change,
  update affected consumers or call out the follow-up explicitly.

## Repo Layout

- `app/`: Wails desktop app, Go backend plus embedded React frontend.
- `app/frontend/`: Vite React app published as `@sprint/desktop`.
- `app/internal/core/dashboard/`: dashboard manager, layout, painter, widgets,
  alerts, and embedded fonts for wheel display rendering.
- `api/`: Go API server and WebSocket relay.
- `web/`: Next.js frontend.
- `pkg/`: shared Go packages, including DTOs, game adapters, and shared memory.
- `packages/types/`: shared TypeScript contracts.
- `packages/tokens/`: Graphite design tokens.
- `packages/ui/`: reusable token-backed React components.

## Source Of Truth

- `pkg/dto`: shared telemetry and engineer data contracts.
- `pkg/games`: game adapter interfaces and implementations.
- `packages/types`: shared TypeScript contracts.
- `packages/tokens`: design tokens and theme primitives.
- `packages/ui`: reusable UI components.
- `api/internal/store`: API persistence ownership.
- `app/internal/core`: desktop orchestration and Wails-facing runtime services.
- `app/internal/hardware`: VoCore, USBD480, RGB565, and WinUSB hardware paths.

## Platform

- This repo is Windows-first. The `Makefile` runs targets through PowerShell.
- Desktop hardware paths use WinUSB and only fully work on Windows.
- Use PowerShell syntax for shell examples and local automation in this repo.
- Do not set `GOCACHE` to a repo-local path such as `.gocache/`. Use the normal
  user-level Go cache.

## Commands

- Install JS deps: `pnpm install`
- List targets: `make help`
- Start API: `make dev-api`
- Start web: `make dev-web`
- Start desktop: `cd app; wails dev`
- Build API: `make build-api`
- Build web: `make build-web`
- Build desktop: `make build-app`
- Test API and shared Go: `make test`
- Test API only: `make test-api`
- Test shared Go only: `make test-pkg`
- Type-check desktop frontend: `pnpm --filter @sprint/desktop type-check`
- Type-check shared UI: `pnpm --filter @sprint/ui type-check`
- Test shared UI: `pnpm --filter @sprint/ui test`
- Test tokens: `pnpm --filter @sprint/tokens test`
- Lint: `make lint`
- Format: `make fmt`

Run the smallest relevant checks for your change set. Do not claim checks you
did not run.

`cd app; go test ./...`, `make lint-app`, and Wails builds require
`app/frontend/dist` to exist because the Go app embeds the built frontend. Build
the desktop frontend first with `pnpm --filter @sprint/desktop build` when
needed.

Frontend dash-editor source-assertion tests under
`app/frontend/src/components/dash-editor/*.test.ts` use Node's built-in runner
and are run directly, for example `node --test <file>`.

## Browser And Desktop Checks

- For frontend/browser testing and UI-flow debugging, use Playwright MCP.
- Browser-safe desktop UI checks use `http://localhost:5173/` while
  `cd app; wails dev` is running.
- The `make dev-app-agent` target and frontend metadata reference scripts under
  `app/scripts/`, but that directory is not present in the current working tree.
  Restore those scripts before relying on the fixed-port desktop attach flow.

## Architecture Notes

- The unified telemetry DTO is the spine of the app. Game-specific data is
  mapped into `pkg/dto` at the edge; downstream desktop, hardware, engineer,
  sync, API, and web consumers should depend on the shared contract.
- To add a game adapter, implement `pkg/games.GameAdapter`, map raw data to
  `pkg/dto`, then register the adapter in `app/internal/core/core.go`.
- `app/internal/core.Coordinator` wires subsystems together. Keep business logic
  in focused services instead of growing the coordinator.
- Wails exported methods live on `App` in `app/app*.go`. Keep bridge methods
  thin and use generated bindings from the frontend.
- Desktop event streams should avoid blocking telemetry reads. Prefer buffered
  latest-value handoff patterns already used by the core runtime.

## UI Rules

- Graphite from `docs/DESIGN.md` is the canonical product UI system.
- Ember orange `#FF6A00` is the primary action, active, focus, and selection
  color.
- Blue `#4F9CFF` is informational, advanced, and comparison.
- Use the Graphite surface stack and 1px borders for depth. Do not revive old
  glass, glow, gradient, or neumorphic directions.
- Reuse tokens from `packages/tokens` instead of inventing theme values.
- Reuse controls from `packages/ui`; local desktop components are only for
  Wails, hardware, or page-specific runtime behavior.
- Desktop pages should compose shared shell and control primitives. If a visual
  control is reusable, put it in `packages/ui`.
- Keep screens dense, scannable, keyboard-operable, and explicit about focus,
  hover, selected, disabled, loading, empty, and destructive states.

## Canonical Docs

- Repository overview and current architecture: `README.md`
- Design system and UI implementation contract: `docs/DESIGN.md`
- Screen protocols and WinUSB behavior: `docs/SCREEN_PROTOCOLS.md`
- Release notes: `docs/RELEASE.md`
- Package-local notes: `api/README.md`, `pkg/README.md`, and package
  `README.md` files when present.

Tool-specific companion files such as `CLAUDE.md` may exist, but this file is
the neutral repo entrypoint. Retired agent-doc trees and Copilot wrappers are
not present in the current working tree. Do not add references to them unless
those files are restored.

## GitHub Collaboration

- When working on a GitHub issue, add useful progress notes to the issue
  comments.
- Comment implementation decisions, open questions, blockers, assumptions, or
  other context that would help the next human or agent continue the work.
- If there is an assigned or active PR for the same work, add relevant notes
  there as well when they matter for review or merge decisions.
- Keep comments high-signal. Do not spam routine status updates that add no
  durable value.
- Use `gh` CLI for GitHub issue and PR comments unless the user requests a
  different tool.
