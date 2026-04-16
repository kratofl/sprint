# Copilot Instructions

## General Rules

- Do **not** install system-level programs, applications, or packages on the host machine without explicit user consent.
- Do **not** read, write, or execute anything outside the repository root directory.
- Prefer **LSP-based tools** (go to definition, find references, hover, etc.) for code navigation. Fall back to grep/glob only as a last resort.
- Use `gh` CLI for GitHub operations instead of MCP GitHub tools, unless explicitly requested.
- You **may** run `git commit` automatically. Every commit must include: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
- Before committing, check the current branch with `git branch --show-current`. If on `main`, create and switch to a new descriptive branch first, then commit there.
- Do **not** use decorative separator comment lines or banner comments in source/config files.

## Project Overview

Sim racing telemetry platform:

| Component | Path | Stack | Role |
|---|---|---|---|
| Desktop app | `/app` | Wails (Go + React/TS) | Reads game telemetry, renders VoCore display, hosts Race Engineer WS server, syncs with API |
| API server | `/api` | Go `net/http` | REST + WS relay for remote engineers, DB, auth |
| Web app | `/web` | Next.js (App Router) | Telemetry analysis, dash editor, engineer portal. Pure frontend — no backend logic |
| Shared Go | `/pkg` | Go | Unified DTO types (`pkg/dto`), GameAdapter interface (`pkg/games`) |
| Shared TS | `/packages` | React/TS | `@sprint/ui` components, `@sprint/types` DTO mirrors, `@sprint/tokens` design tokens |

## Current Development Focus

> **Desktop app (`/app`) is the primary focus.** Do not expand `/api` or `/web` unless the user explicitly asks.
> Exception: when a change affects shared concerns (`@sprint/ui`, `@sprint/types`, `@sprint/tokens`, API contracts, data model) — apply to both surfaces or note what `/web` will need.

## Architecture

Data flow: `Sim Game → (UDP) → Desktop App → (WinUSB RGB565) → USB screen (VoCore / USBD480)`
                                          `→ (WebSocket) → LAN Engineers`
                                          `→ (HTTP/WS) → API Server → (WS relay) → Remote Engineers`
                                          `                           → (HTTP) → Web App`

The desktop app is **authoritative** — it applies engineer commands and can reject/override them.

## Key Features

**USB Wheel Display (VoCore / USBD480):** Go backend renders RGB565 frames → WinUSB bulk transfer → USB screen embedded in steering wheel. Two supported screen families: VoCore M-PRO (`VID 0xC872`) and USBD480 (`VID 0x16C0`). Both require WinUSB driver (installed by vendor setup or Zadig). Layout controlled by dash config.

**Set Target Lap (wheel button):** On press, finds the most recent valid lap as delta reference. Valid = not out/in lap, no yellow flag/SC, no track limits violation, within ±5% of session best. Triggers VoCore re-render + engineer broadcast.

**Race Engineer Mode:** Driver shares a session link (LAN or remote via web). Engineers receive live telemetry WS stream and can push commands (target lap, pit notes, dash params). Desktop app is authoritative. Command status: pending → applied/rejected.

## Project Structure

```
/sprint
├── go.work              ← Go workspace: ./app ./api ./pkg
├── package.json         ← pnpm workspace root
├── turbo.json           ← tokens → ui/types → [web, app/frontend]
├── pkg/                 ← shared Go: dto/ (telemetry + engineer types), games/ (GameAdapter + adapters)
├── api/                 ← Go API: internal/{server,handler,authhandler,relay,invite,store,auth}
├── packages/
│   ├── ui/              ← @sprint/ui — shared React components (primitives/ + telemetry/)
│   ├── types/           ← @sprint/types — TS mirrors of pkg/dto
│   └── tokens/          ← @sprint/tokens — Tailwind config, globals.css, CSS variables
├── web/                 ← Next.js: app/{sessions,engineer,setups,dash}
└── app/                 ← Wails desktop app
    ├── main.go + app.go ← Wails entry point + bindings
    ├── internal/        ← core, hardware, dashboard, devices, input, delta, commands, capture, updater, settings, logger, appdata
    └── frontend/        ← React/TS (embedded via go:embed)
```

Go workspace: three modules sharing `pkg/dto` and `pkg/games` via workspace resolution.

## Module Conventions

- **`/pkg`**: Single source of truth for telemetry/engineer DTO types. `GameAdapter` interface + per-game adapters. No application logic.
- **`/api`**: `net/http` server. The `relay` package manages WS connections for remote engineers. The `store` package owns all DB operations — no SQL outside it.
- **`/app`**: See `wails.instructions.md` for lifecycle, bindings, coordinator pattern, and internal packages.
- **`/web`**: See `nextjs.instructions.md`. Pure frontend, proxies `/api/*` to Go API via `next.config.ts` rewrites.

## Shared TypeScript (`/packages`)

- `@sprint/tokens` — single source of truth for design tokens. Imported by both apps.
- `@sprint/types` — kept in sync manually with `pkg/dto/*.go`.
- `@sprint/ui` — write reusable components here first, consume via `@sprint/ui`.

**Component ownership:**

| Location | For |
|---|---|
| `packages/ui/…/primitives/` | Reusable atoms: `Button`, `Badge`, `Card` |
| `packages/ui/…/telemetry/` | Domain display: `LapTime`, `DeltaBar`, `TireTemp` |
| `app/frontend/src/components/` | Desktop-only (Wails bindings, native chrome) |
| `web/components/` | Web-only (Next.js server components, routing) |

**Rules:** Extract to `@sprint/ui` if both apps need it. No platform code (`window.go`, Next.js imports) in `/packages`. Both apps' Tailwind configs include `packages/ui/src/**` in `content`. Use `cn()` + CVA for variants.

## Design System

Full reference: [`docs/DESIGN_SYSTEM.md`](../docs/DESIGN_SYSTEM.md)

**Color semantics:** Orange `#ff906c` = driver/primary. Cyan `#5af8fb` = engineer/comparison. Never same visual weight on one element.
Other: Background `#0a0a0a`, Foreground `#ffffff`, Muted `#808080`, Success `#34D399`, Warning `#FBBF24`, Danger `#F87171`.

**Surfaces** (in `packages/tokens/globals.css`): `.surface`, `.surface-elevated`, `.surface-overlay`, `.surface-active` (orange), `.surface-secondary` (cyan), `.surface-success`, `.surface-warning`, `.surface-destructive`, `.surface-tertiary`. `.glass` / `.glass-overlay` for floating overlays only.

**Typography:** `Space Grotesk` for UI, `JetBrains Mono` for data. Hero stats: `text-3xl font-bold font-mono tabular-nums`.

