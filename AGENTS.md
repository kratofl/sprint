# Sprint Agent Guide

This is the neutral, agent-facing entrypoint for the Sprint repository. Keep it
short, current, and tool-agnostic. Put deep project docs in `README.md`,
`docs/DESIGN.md`, or package-local documentation instead of expanding this file.

## Scope

- Stay inside this repository. Do not read, write, execute, or otherwise operate
  outside the project folder unless the user explicitly asks.
- Do not install tools, CLIs, language servers, or other system-wide software.
  Do not run `make setup` unless the user explicitly asks for full dependency
  restore.
- Only install project dependencies through the project's package managers when
  needed for the apps, such as `pnpm install`, `dotnet restore`, or Go module
  commands.
- Prefer targeted fixes over broad refactors unless the task requires structural
  change.
- Work with existing user changes. Do not revert unrelated edits or deleted
  files unless the user explicitly requests it.

## Default Focus

- Prioritize work in `app/`, especially the Avalonia desktop app.
- Only change `api/` or `web/` when the user asks, or when a shared contract
  requires corresponding consumer updates.
- When shared DTOs, shared TypeScript types, shared UI, or shared tokens change,
  update affected consumers or call out the follow-up explicitly.

## Repo Layout

- `app/`: .NET/Avalonia desktop app and desktop presets.
- `api/`: Go API server and WebSocket relay.
- `web/`: Next.js frontend.
- `pkg/`: shared Go packages, including DTOs, game adapters, and shared memory.
- `packages/types/`: shared TypeScript contracts.
- `packages/tokens/`: Graphite design tokens.
- `packages/ui/`: reusable token-backed React components for web surfaces.

## Source Of Truth

- `pkg/dto`: shared telemetry and engineer data contracts.
- `pkg/games`: game adapter interfaces and implementations.
- `packages/types`: shared TypeScript contracts.
- `packages/tokens`: design tokens and theme primitives.
- `packages/ui`: reusable UI components.
- `api/internal/store`: API persistence ownership.
- `app/DesktopRuntime.cs`: desktop preset loading and local persistence.

## Platform

- This repo is Windows-first. The `Makefile` runs targets through PowerShell.
- Desktop hardware integrations are Windows-first.
- Use PowerShell syntax for shell examples and local automation in this repo.
- Do not set `GOCACHE` to a repo-local path such as `.gocache/`. Use the normal
  user-level Go cache.

## Commands

- Install JS deps: `pnpm install`
- List targets: `make help`
- Start API: `make dev-api`
- Start web: `make dev-web`
- Start desktop: `dotnet run --project app/Sprint.Desktop.csproj`
- Build API: `make build-api`
- Build web: `make build-web`
- Build desktop: `make build-app`
- Test API and shared Go: `make test`
- Test API only: `make test-api`
- Test shared Go only: `make test-pkg`
- Test desktop only: `make test-app`
- Build desktop: `dotnet build app/Sprint.Desktop.csproj`
- Type-check shared UI: `pnpm --filter @sprint/ui type-check`
- Test shared UI: `pnpm --filter @sprint/ui test`
- Test tokens: `pnpm --filter @sprint/tokens test`
- Lint: `make lint`
- Format: `make fmt`

Run the smallest relevant checks for your change set. Do not claim checks you
did not run.

`make lint-app` builds the Avalonia desktop project with warnings as errors.

## Browser And Desktop Checks

- For frontend/browser testing and UI-flow debugging, use Playwright MCP.
- Browser-safe desktop checks no longer apply to `app/`; use native Avalonia
  build/run checks for the desktop app.

## Architecture Notes

- The unified telemetry DTO is the spine of the app. Game-specific data is
  mapped into `pkg/dto` at the edge; downstream desktop, hardware, engineer,
  sync, API, and web consumers should depend on the shared contract.
- To add a game adapter, implement `pkg/games.GameAdapter`, map raw data to
  `pkg/dto`, then add the desktop integration point in `app/DesktopRuntime.cs`
  or a focused service next to it.
- Keep desktop business logic in focused C# services instead of growing
  `MainWindow.cs`.

## UI Rules

- Graphite from `docs/DESIGN.md` is the canonical product UI system.
- Ember orange `#FF6A00` is the primary action, active, focus, and selection
  color.
- Blue `#4F9CFF` is informational, advanced, and comparison.
- Use the Graphite surface stack and 1px borders for depth. Do not revive old
  glass, glow, gradient, or neumorphic directions.
- Reuse tokens from `packages/tokens` instead of inventing theme values.
- Keep the Avalonia desktop shell aligned with the Graphite tokens in
  `Graphite.cs` and `docs/DESIGN.md`.
- Keep screens dense, scannable, keyboard-operable, and explicit about focus,
  hover, selected, disabled, loading, empty, and destructive states.

## Canonical Docs

- Repository overview and current architecture: `README.md`
- Design system and UI implementation contract: `docs/DESIGN.md`
- Screen protocols and WinUSB behavior: `docs/SCREEN_PROTOCOLS.md`
- Release notes: `docs/RELEASE.md`
- Package-local notes: `app/README.md`, `api/README.md`, `pkg/README.md`, and package
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
