## Agent Docs

These documents are the canonical repository instructions for coding agents.

### Scope

- Stay inside the project folder. Do not read, write, execute, or otherwise operate outside it
  unless the user explicitly asks.
- Do not install tools, CLIs, language servers, or other system-wide software.
- Only install project dependencies through the repo's package managers when needed for the apps,
  such as `pnpm` packages or Go module dependencies.

### Priority

- Default focus is `app/`.
- Do not expand `api/` or `web/` unless the user asks, or the change affects shared contracts,
  shared UI, or shared tokens.
- If a change impacts both desktop and web, update both surfaces or call out the follow-up.

### Architecture

- The desktop app is authoritative for live session state and engineer commands.
- `pkg/dto` is the source of truth for shared telemetry and engineer payloads.
- Keep SQL inside `api/internal/store/`.
- Keep platform-specific code out of `packages/*`.
- Extract reusable UI to `packages/ui` when both desktop and web benefit.

### Validation

- Root install: `pnpm install`
- Web dev: `make dev-web`
- API dev: `make dev-api`
- Desktop dev: `cd app && wails dev`
- Desktop dev for agent attach: `make dev-app-agent`
- Go tests: `make test`
- API tests: `make test-api`
- Shared Go tests: `make test-pkg`
- Lint: `make lint`
- Format: `make fmt`

Run the smallest relevant checks for the files you touched.
- Use Playwright MCP for frontend/browser testing and UI-flow debugging.
- Browser-safe desktop UI checks use `http://localhost:5173/` while `cd app && wails dev` is running.
- Desktop-bound UI flows use `make dev-app-agent`, then `pwsh -File .\app\scripts\wait-desktop-browser.ps1`, then Playwright MCP against `http://127.0.0.1:34115` or the port from `SPRINT_WAILS_DEVSERVER_PORT`.

### GitHub Collaboration

- Agents working on a GitHub issue should leave durable implementation notes in issue comments when
  that context would help future contributors.
- Comment open questions, blockers, assumptions, design decisions, partial progress, or follow-up
  work worth preserving.
- If the work also has an active PR, mirror the relevant context there when it affects review,
  testing, or merge decisions.
- Prefer a few useful comments over frequent low-signal status chatter.

### Design System

- Use `@sprint/tokens` as the source of truth for colors, surfaces, and typography.
- Orange `#ff906c` is driver-primary.
- Cyan `#5af8fb` is engineer/comparison.
- Do not give orange and cyan equal visual weight on the same element.

### Subsystem Docs

- `docs/agents/go.md`
- `docs/agents/wails.md`
- `docs/agents/react-typescript.md`
- `docs/agents/nextjs.md`
- `docs/agents/tooling.md`
- `docs/desktop/README.md`
