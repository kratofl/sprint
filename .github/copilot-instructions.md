# Sprint Repository Instructions

## Operating Rules

- Stay inside the repository root. Do not read, write, or execute outside this repo unless the user explicitly asks.
- Do not install system-level tools or packages without user consent.
- Prefer existing repo tooling and scripts over ad hoc setup.
- Prefer precise code navigation tools first; use text search when needed.
- Do not add decorative banner comments or separator comments to source or config files.

## Work Priority

- Default focus is the desktop app in `app/`.
- Do not expand `api/` or `web/` unless the user asks, or the change affects shared contracts, shared UI, or shared tokens.
- If a change impacts both desktop and web, update both surfaces or call out the missing follow-up explicitly.

## Monorepo Map

| Path | Stack | Purpose |
|---|---|---|
| `app/` | Wails, Go, React, TypeScript | Primary desktop application |
| `api/` | Go, `net/http` | REST API, auth, WebSocket relay |
| `web/` | Next.js App Router | Browser UI for analysis, engineer portal, setup flows |
| `pkg/` | Go | Shared DTOs and game adapter interfaces |
| `packages/ui` | React, TypeScript | Shared UI components |
| `packages/types` | TypeScript | DTO mirrors of `pkg/dto` |
| `packages/tokens` | CSS, Tailwind | Shared design tokens |

## Architecture Rules

- The desktop app is authoritative for live session state and engineer commands.
- `pkg/dto` is the source of truth for shared telemetry and engineer payloads.
- Keep SQL inside `api/internal/store/`.
- Keep platform-specific code out of `packages/*`.
- Extract reusable UI to `packages/ui` when both desktop and web benefit.

## Frontend Boundaries

- Use `@sprint/tokens` as the single source of truth for colors, surfaces, and typography.
- Use orange `#ff906c` for driver-primary intent and cyan `#5af8fb` for engineer/comparison intent.
- Do not give orange and cyan equal visual weight on the same element.
- Desktop-only UI belongs in `app/frontend/src/components/`.
- Web-only UI belongs in `web/components/`.

## Validation Commands

- Root install: `pnpm install`
- Web dev: `make dev-web`
- API dev: `make dev-api`
- Desktop dev: `cd app && wails dev`
- Go tests: `make test`
- API tests only: `make test-api`
- Shared Go tests only: `make test-pkg`
- Lint: `make lint`
- Format: `make fmt`
- Web build: `make build-web`
- API build: `make build-api`
- Desktop build: `make build-app`

Run the smallest relevant validation for the files you touched. Do not claim validation you did not run.
- Do not set `GOCACHE` to a repo-local path such as `.gocache/`. Use the normal user-level Go cache.

## Commit Rules

- Check the current branch before committing.
- If currently on `main`, create a descriptive feature branch before committing.
- Use `gh` CLI for GitHub operations unless the user requests a different tool.
- When working on a GitHub issue, leave useful implementation notes, open questions, blockers, or
  decisions in issue comments.
- If there is an active or assigned PR for the same work, add the relevant context there too when
  it helps review or merge decisions.
- Keep GitHub comments high-signal rather than posting routine progress noise.
- If creating a commit on behalf of Copilot-driven workflows, include:
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

## Reference Files

- Desktop architecture: `.github/instructions/wails.instructions.md`
- Next.js guidance: `.github/instructions/nextjs.instructions.md`
- React/TypeScript guidance: `.github/instructions/react-typescript.instructions.md`
- Go guidance: `.github/instructions/go.instructions.md`
- Tooling and CI guidance: `.github/instructions/tooling.instructions.md`
- Design system: `docs/DESIGN_SYSTEM.md`
