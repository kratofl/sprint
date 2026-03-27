# Project Maintenance Audit

Audit the current state of the Sprint monorepo and fix documentation that has drifted from reality. Read every source of truth before changing anything — do not guess.

---

## 1. Update `copilot-instructions.md`

Read the actual codebase and compare against each section of `.github/copilot-instructions.md`. Fix anything that has drifted. Common drift areas:

### Go Version

- Read `go.work` for the actual Go version
- Compare against the documented `go.work` block in the "Go Workspace" section
- Also check `app/go.mod`, `api/go.mod`, `pkg/go.mod` for their `go` directives

### Directory Structure

- Walk the **actual** top-level and second-level directories of the repo
- Compare against the documented directory tree in the "Directory Structure" section
- Check specifically:
  - `app/internal/` — list all immediate subdirectories. Are all documented? Are any missing from the docs?
  - `api/internal/` — list all immediate subdirectories. Are all documented? Are any missing from the docs?
  - `packages/` — list all workspace packages (read `pnpm-workspace.yaml`). Does the tree match?
  - `.github/` — are `instructions/`, `skills/`, `hooks/`, `agents/` reflected if they exist?
  - `docs/` — are all docs files listed?
  - Any new top-level directories that aren't in the tree?

### Architecture Diagram

- Verify the ASCII architecture diagram still matches the actual component layout
- Check that the listed `app/internal` services (Go backend box) match the actual packages
- Check that the listed `app/frontend` features (React/TS frontend box) match actual views/routes

### API Routes

- Grep for `HandleFunc`, `Handle`, `mux.Handle` in `api/internal/server/server.go`
- The copilot-instructions don't list individual routes, but the handler package names mentioned under "Go API Server Conventions" should match actual packages in `api/internal/`
- Verify: server, handler, relay, store, auth — are there new packages? (e.g., `authhandler`, `invite`)

### Wails Bindings

- Read `app/app.go` and list all exported methods on the App struct
- These are the Wails bindings exposed to the frontend
- The docs describe features generically — verify the described capabilities still match the actual bindings (setup management, device management, telemetry, engineer, etc.)

### Makefile Targets

- Read the `Makefile` and list all targets (lines starting with a word followed by `:`)
- Compare against targets documented in `README.md`
- Verify VERSION variable and ldflags are documented correctly

### pnpm Workspace & Turbo

- Read `pnpm-workspace.yaml` — verify packages list matches documented workspace entries
- Read `turbo.json` — verify task definitions match the documented "Turborepo Task Order" diagram
- Check each `packages/*/package.json` for `name` field — do the package names match?

### Design Tokens (Inline Table)

- Read `packages/tokens/globals.css`
- Extract CSS custom properties (e.g., `--accent`, `--teal`, `--bg-base`)
- Compare hex values against the "Key tokens" color table in copilot-instructions
- Verify glass surface utility classes (`.glass`, `.glass-elevated`, `.glass-overlay`, `.glass-highlight`) — do the documented `rgba()` and `blur()` values match the actual CSS?

### Component Ownership Table

- Verify each path in the component ownership table actually exists:
  - `packages/ui/src/components/primitives/`
  - `packages/ui/src/components/telemetry/`
  - `app/frontend/src/components/`
  - `web/components/`

### Sync Protocol Table

- Verify the described transports and directions still make sense given the actual codebase
- Check that referenced components (VoCore, engineer hub, sync client, relay) still exist

### Data Flow for New Game Support

- Verify the steps reference correct paths
- Game adapters live in `pkg/games/`, not `app/internal/games/` — check which is correct
- Verify `GameAdapter` interface location matches

### Workflow Filenames

- List all files in `.github/workflows/`
- Compare against the documented workflow names and descriptions
- Verify trigger events and job names if mentioned

### Dead Links

- Check all markdown links and file references in copilot-instructions:
  - `docs/DESIGN_SYSTEM.md` — does it exist?
  - `.stitch/DESIGN.md` — does it exist?
  - Any other relative links

### Development Focus

- Review the "Current Development Focus" section
- If priorities have shifted (e.g., web app is no longer deferred), update accordingly
- This section changes with project phase — ask the user if unsure

---

## 2. Update `README.md`

Read the actual codebase and compare against `README.md`:

### Monorepo Structure Table

- Verify paths, languages, and descriptions match reality
- Check if new top-level directories have been added

### Prerequisites

- Go version: read `go.work`
- Node.js version: read `package.json` engines field or `.nvmrc` if present
- pnpm version: read `package.json` packageManager field or check `pnpm -v` instructions
- Wails version: read `app/go.mod` for wails dependency version

### Make Targets

- Read the actual `Makefile` and compare every target against what's documented
- Add new targets, remove stale ones

### Quick Start

- Verify docker-compose commands still work (service names, ports)
- Verify local dev commands (`make dev-app`, `make dev-api`, etc.)

### Adding a New Game

- Verify the documented steps reference correct file paths
- Cross-check with copilot-instructions "Data Flow for New Game Support"

---

## 3. Update `docs/DESIGN_SYSTEM.md`

### Color System

- Read `packages/tokens/globals.css` for actual CSS custom property values
- Compare every hex code in DESIGN_SYSTEM.md against the CSS
- Check that the documented color roles (primary, secondary, semantic) still match

### Glass Surfaces

- Read the actual `.glass`, `.glass-elevated`, `.glass-overlay` classes from CSS
- Compare `background`, `backdrop-filter`, `border`, `box-shadow` values
- Verify the documented blur values, opacity values, and border definitions

### Shadows & Depth

- Read actual shadow definitions from CSS or Tailwind config
- Compare against the documented shadow scale

### Typography

- Verify font family, weight range, and special rules (tabular-nums, etc.)
- Check `tailwind.config.ts` files for custom font configuration

---

## 4. Update `docs/*.md` Guides

For each guide file in `docs/`, verify it still reflects reality:

### `docs/DEVELOPMENT_WORKFLOW.md`

- Are the setup steps still accurate?
- Do the dev/build/test commands match the Makefile?
- Are environment variables and config files correctly described?

### `docs/GO_AND_WAILS.md`

- Does the Go version match `go.work`?
- Are Wails patterns and conventions still current?
- Is the build process accurately described?

### `docs/NEXTJS_AND_REACT.md`

- Does the Next.js version match `web/package.json`?
- Are the described patterns (App Router, rewrites) still accurate?

### `docs/PNPM_AND_TURBO.md`

- Does the workspace package list match `pnpm-workspace.yaml`?
- Are turbo commands and task graph still accurate?
- Is the build order description correct?

---

## 5. Cross-Check Shared Types

### TypeScript ↔ Go DTO Sync

- Read `pkg/dto/telemetry.go` and list all exported struct types and their fields
- Read `packages/types/src/telemetry.ts` and list all exported TypeScript types
- Flag any mismatches: new fields in Go not reflected in TS, or vice versa
- Do the same for `pkg/dto/engineer.go` ↔ `packages/types/src/engineer.ts`

### Package Versions

- Read `packages/*/package.json` and note version numbers
- If packages cross-reference each other, verify version ranges are compatible

---

## Rules

- Only change lines that are actually wrong or missing. Don't rewrite sections that are accurate.
- If you're unsure whether something has changed, read the source file — don't guess.
- Keep documentation concise. Match the existing tone and level of detail.
- Preserve formatting conventions (table alignment, code fence languages, ASCII art style).
- If the "Current Development Focus" section needs updating, ask the user first — priorities are a human decision.
- Commit the changes when done with a message like: `docs: maintenance audit — fix documentation drift`
