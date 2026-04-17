## Agent Docs

These documents are the canonical repository instructions for coding agents.

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
- Go tests: `make test`
- API tests: `make test-api`
- Shared Go tests: `make test-pkg`
- Lint: `make lint`
- Format: `make fmt`

Run the smallest relevant checks for the files you touched.

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
