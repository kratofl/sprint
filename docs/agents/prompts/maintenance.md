## Maintenance Audit Prompt

Use this prompt when auditing repository docs and agent guidance for drift.

### Goal

Audit the current state of the Sprint monorepo and fix documentation that has drifted from reality.
Read source-of-truth files before changing docs. Do not guess.

### Verify

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `README.md`
- `docs/DESIGN_SYSTEM.md`
- Other `docs/*.md` guides
- `go.work` and module `go.mod` files
- `pnpm-workspace.yaml`
- `turbo.json`
- `Makefile`
- `packages/tokens/globals.css`
- `pkg/dto/*` and `packages/types/*`
- `.github/workflows/*`

### Focus Areas

- Directory structure drift
- Build and test command drift
- Architecture description drift
- Shared type drift between Go and TypeScript
- Workflow filename drift
- Broken file links and stale references

### Rules

- Only change lines that are wrong or missing.
- Preserve existing formatting style unless it is actively harmful.
- Ask the user before changing human-priority sections such as active development focus.
