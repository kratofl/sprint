# Sprint Agent Guide

This is the neutral, agent-facing entrypoint for the repository. Canonical guidance lives outside
`.github` so Codex and other agents do not depend on Copilot-specific file conventions.

## Scope

- Stay inside this repository unless the user explicitly asks otherwise.
- Do not install system-wide dependencies without approval.
- Prefer targeted fixes over broad refactors unless the task requires structural change.

## Default Focus

- Prioritize work in `app/`.
- Only change `api/` or `web/` when the user asks, or when shared contracts require it.
- When shared DTOs, shared UI, or shared tokens change, update the corresponding consumers or call
  out the follow-up explicitly.

## Source Of Truth

- `pkg/dto`: shared data contracts
- `pkg/games`: game adapter interfaces
- `packages/tokens`: design tokens
- `packages/ui`: reusable UI
- `api/internal/store`: SQL ownership

## Repo Layout

- `app/`: Wails desktop app, Go backend plus embedded React frontend
- `api/`: Go API server and WebSocket relay
- `web/`: Next.js frontend
- `pkg/`: shared Go packages
- `packages/`: shared TypeScript packages

## Commands

- Install JS deps: `pnpm install`
- Start API: `make dev-api`
- Start web: `make dev-web`
- Start desktop: `cd app && wails dev`
- Test Go: `make test`
- Lint: `make lint`
- Format: `make fmt`

Run the smallest relevant checks for your change set. Do not claim checks you did not run.

## UI Rules

- Orange `#ff906c` is driver-primary.
- Cyan `#5af8fb` is engineer/comparison.
- Reuse tokens from `packages/tokens` instead of inventing new theme values.

## Canonical Docs

- General repo guidance: `docs/agents/README.md`
- Go guidance: `docs/agents/go.md`
- Wails guidance: `docs/agents/wails.md`
- React and TypeScript guidance: `docs/agents/react-typescript.md`
- Next.js guidance: `docs/agents/nextjs.md`
- Tooling and CI guidance: `docs/agents/tooling.md`

## Compatibility

- `.github/copilot-instructions.md` remains for GitHub Copilot.
- `.github/instructions/*.instructions.md` remain as thin compatibility wrappers that point to the
  canonical docs above.
