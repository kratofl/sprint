# Sprint Agent Guide

This is the neutral, agent-facing entrypoint for the repository. Canonical guidance lives outside
`.github` so Codex and other agents do not depend on Copilot-specific file conventions.

## Scope

- Stay inside this repository. Do not read, write, execute, or otherwise operate outside the
  project folder unless the user explicitly asks.
- Do not install tools, CLIs, language servers, or other system-wide software.
- Only install project dependencies through the project's package managers when needed for the apps,
  such as `pnpm` packages or Go module dependencies.
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
- Start desktop for agent attach: `make dev-app-agent`
- Test Go: `make test`
- Lint: `make lint`
- Format: `make fmt`

Run the smallest relevant checks for your change set. Do not claim checks you did not run.
- Do not set `GOCACHE` to a repo-local path such as `.gocache/`. Use the normal user-level Go cache.
- For frontend/browser testing and UI-flow debugging, use Playwright MCP.
- Browser-safe desktop UI checks use `http://localhost:5173/` while `cd app && wails dev` is running.
- Desktop-bound UI flows use `make dev-app-agent`, then `pwsh -File .\app\scripts\wait-desktop-browser.ps1`, then Playwright MCP against `http://127.0.0.1:34115` or the port from `SPRINT_WAILS_DEVSERVER_PORT`.

## GitHub Collaboration

- When working on a GitHub issue, add useful progress notes to the issue comments.
- Comment implementation decisions, open questions, blockers, assumptions, or other context that
  would help the next human or agent continue the work.
- If there is an assigned or active PR for the same work, add the relevant notes there as well when
  they matter for review or merge decisions.
- Keep comments high-signal. Do not spam routine status updates that add no durable value.
- Use `gh` CLI for GitHub issue and PR comments unless the user requests a different tool.

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

## Canonical Skills

- Skill index: `docs/agents/skills/README.md`
- Telemetry pipeline: `docs/agents/skills/telemetry-data-pipeline.md`
- VoCore screen: `docs/agents/skills/vocore-screen.md`
- USBD480 screen: `docs/agents/skills/usbd480-screen.md`

## Compatibility

- `.github/copilot-instructions.md` remains for GitHub Copilot.
- `.github/instructions/*.instructions.md` remain as thin compatibility wrappers that point to the
  canonical docs above.
- `.github/skills/*/SKILL.md` remains only for the Sprint-specific skill wrappers that still add
  value for GitHub-oriented tooling.
