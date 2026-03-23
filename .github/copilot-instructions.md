# Copilot Instructions

## General Rules

- Do **not** install system-level programs, applications, or packages on the host machine without explicit user consent.
- Do **not** read, write, or execute anything outside the `/Users/kratofl/Projects/sprint` directory.
- Prefer **LSP-based tools** (go to definition, find references, hover, etc.) for code navigation and understanding. Fall back to file read operations (grep, glob, cat) only as a last resort.
- You **may** run `git commit` automatically. Every commit must include the co-author trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

## Project Overview

A sim racing telemetry platform with four components:

1. **Desktop app** (`/app`) — A [Wails](https://wails.io) application (Go backend + React/TypeScript frontend) that runs on the driver's local machine. It reads live telemetry from sim racing games, renders images for the VoCore steering wheel display, hosts a Race Engineer WebSocket server, and syncs with the API server.
2. **API server** (`/api`) — A Go HTTP/WebSocket server that stores telemetry sessions, setups, and layouts in a database, relays WebSocket connections for remote race engineers, and handles user authentication.
3. **Web app** (`/web`) — A Next.js frontend for analyzing telemetry, managing dash layouts and setups, running the Race Engineer portal, and sharing sessions with other users. Talks to the API server; contains no backend logic itself.
4. **Shared Go packages** (`/pkg`) — Unified DTO types and game adapter interfaces, imported by both the desktop app and the API server.
5. **Shared TypeScript packages** (`/packages`) — UI components, types, and design tokens shared between the desktop and web frontends.

## Current Development Focus

> **The desktop app (`/app`) is the primary focus right now.**
>
> Build order priority:
> 1. **Desktop app** — full-featured and stable before anything else.
> 2. **Race Engineer features** — some functionality (engineer hub, WebSocket session) is implemented alongside the desktop app because it is tightly coupled to the live telemetry pipeline.
> 3. **API server & web app** — deferred. Most `/api` handlers and all `/web` UI pages are stubs or TODOs. Do not expand them unless the user explicitly asks.
>
> When suggesting new features or next steps, default to the desktop app scope. Avoid expanding the web or API surface area unless it is directly required by a desktop feature.
>
> **However:** when a major change affects shared concerns — design tokens, shared components (`@sprint/ui`), DTO types (`@sprint/types`), API contracts, or the data model — the web app must not be left behind. Apply the change to both surfaces or note explicitly what the web app will need when it is built out.

## Architecture

```
Sim Game (e.g. LeMansUltimate)
        ↓  UDP / shared memory
┌────────────────────────────────────────────────────┐
│  Wails Desktop App  (/app)                        │
│                                                    │
│  Go backend  (/app/internal):                      │
│    - Game telemetry reader + DTO pipeline          │
│    - VoCore image renderer  (PNG → wheel screen via USB)   │
│    - Wheel button detector  (set target lap, etc.) │
│    - Setup manager                                 │
│    - Race Engineer hub  (WebSocket server, LAN)    │
│    - Sync client  (API server ↕)                  │
│                                                    │
│  React/TS frontend  (/app/frontend):               │
│    - Live telemetry view                           │
│    - Dash layout + target lap editor               │
│    - Setup loader / manager                        │
│    - Race Engineer session status panel            │
└────────────────────────────────────────────────────┘
        │                        │
        ↓  PNG frames (USB serial)  ↓  WebSocket
  VoCore Screen            Race Engineer Client (LAN)
  (steering wheel)         direct IP:port connection

        ↓  HTTP/WebSocket (sync + telemetry stream)
┌────────────────────────────────────────────────────┐
│  Go API Server  (/api)                             │
│    - REST API  (sessions, setups, layouts, auth)   │
│    - WebSocket relay  (remote engineer access)     │
│    - Database  (sessions, layouts, setups, users)  │
│                                                    │
│  Imports shared DTO types from /pkg                │
└────────────────────────────────────────────────────┘
        ↓  serves API
┌────────────────────────────────────────────────────┐
│  Next.js Web App  (/web)                          │
│    - Telemetry analysis, session history           │
│    - Dash layout editor  (syncs ↕ via API)        │
│    - Setup management    (syncs ↕ via API)        │
│    - Race Engineer portal (live view + commands)   │
│    - Multi-user session sharing                    │
│    - Pure frontend — no backend logic              │
└────────────────────────────────────────────────────┘
```

## Key Features

### VoCore Wheel Display
The Go backend renders PNG image frames and sends them to the VoCore screen (a small Linux-based display embedded in the steering wheel) over **USB serial (CDC ACM)**. The VoCore device presents as a serial port when connected via USB (`/dev/cu.usbmodemXXXX` on macOS, `/dev/ttyACM0` on Linux, `COM3` on Windows). Frames are sent as length-prefixed PNG data. Rendering uses a Go 2D graphics library. Layout and content of the rendered image are controlled by the dash layout configuration.

### Wheel Button — Set Target Lap
The Go backend monitors a configurable button channel from game telemetry. On press, it finds the most recent **valid lap** and sets it as the delta reference. A valid lap satisfies all of:
- Not an out lap or in lap
- No yellow flag or safety car active during the lap
- No track limits violation reported by the game
- Lap time within a configurable tolerance of the session best (default ±5%)

The change triggers an immediate VoCore re-render and is broadcast to all connected engineers.

### Race Engineer Mode
- The driver shares a live session link — LAN (direct IP:port) or remote (invite link via web app)
- Engineers connect and receive the same live telemetry WebSocket stream as the driver
- Engineers can push commands: change target laptime, send pit notes, adjust dash parameters
- The local Wails app is always **authoritative** — it applies engineer commands and can reject or override them
- Engineers see their command status (pending → applied / rejected) in real time

### Sync Protocol

| Direction | Transport | Trigger | Data |
|---|---|---|---|
| Desktop → VoCore | USB serial | Every telemetry frame | PNG image |
| Desktop → Engineers (LAN) | WebSocket | Every telemetry frame | Unified DTO |
| Engineer (LAN) → Desktop | WebSocket | On command | Command payload |
| Desktop → API | HTTP | On save / session end | Layout, setup, or full session |
| API → Desktop | HTTP | On web-side save | Layout / setup diff |
| Desktop → API | WebSocket | Real-time opt-in | Live telemetry stream |
| API → Engineers (remote) | WebSocket | Relayed from desktop | Unified DTO |
| Engineer (remote) → API → Desktop | WebSocket | On command | Command payload |

## Directory Structure

```
/sprint                              ← repo root
│
├── package.json                     ← pnpm workspace root
├── pnpm-workspace.yaml              ← workspaces: packages/*, web, app/frontend
├── turbo.json                       ← task graph: tokens → ui/types → [web, desktop]
├── go.work                          ← Go workspace: ./app ./api ./pkg
│
├── .github/
│   ├── copilot-instructions.md
│   ├── instructions/
│   ├── skills/
│   └── workflows/
│       ├── ci.yml                   ← lint + test + build all packages on PR
│       ├── desktop-release.yml      ← build Wails .exe, attach to GitHub Release
│       └── web-deploy.yml           ← deploy /web on push to main
│
├── pkg/                             ← shared Go module (imported by app + api)
│   ├── go.mod                       ← github.com/kratofl/sprint/pkg
│   ├── dto/
│   │   ├── telemetry.go             ← unified telemetry DTO structs
│   │   └── engineer.go              ← command/event types for engineer protocol
│   └── games/
│       ├── adapter.go               ← GameAdapter interface
│       └── lemansultimate/
│           ├── adapter.go
│           └── udp.go
│
├── api/                             ← Go API server module
│   ├── go.mod                       ← github.com/kratofl/sprint/api
│   ├── main.go                      ← HTTP server entry point
│   └── internal/                    ← api-private packages
│       ├── server/                  ← HTTP server setup + route wiring
│       ├── handler/                 ← API route handlers (sessions, setups, layouts)
│       ├── relay/                   ← WebSocket relay hub for remote engineers
│       ├── store/                   ← database layer
│       └── auth/                    ← authentication middleware
│
├── packages/                        ← shared TypeScript (imported by web + desktop)
│   ├── ui/                          ← @sprint/ui — shared React components
│   │   ├── src/components/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── types/                       ← @sprint/types — shared TypeScript types
│   │   ├── src/
│   │   │   ├── telemetry.ts         ← DTO types mirroring Go pkg/dto
│   │   │   └── engineer.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── tokens/                      ← @sprint/tokens — single design-token source
│       ├── tailwind.config.ts
│       ├── globals.css
│       └── package.json
│
├── web/                             ← Next.js web app (pure frontend)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── sessions/                ← session history and telemetry analysis
│   │   ├── engineer/                ← race engineer portal (live view + commands)
│   │   ├── setups/                  ← setup management
│   │   ├── dash/                    ← dash layout editor
│   │   └── api/health/              ← health check (proxies to Go API)
│   ├── components/
│   ├── lib/
│   ├── hooks/
│   ├── next.config.ts               ← rewrites /api/* → Go API server
│   ├── tailwind.config.ts
│   └── package.json
│
└── app/                             ← Wails desktop app
    ├── go.mod                       ← github.com/kratofl/sprint/app
    ├── main.go                      ← Wails entry point (embed all:frontend/dist)
    ├── app.go                       ← App struct bound to frontend
    ├── wails.json
    ├── internal/                    ← app-private packages
    │   ├── coordinator/             ← wires all services; no business logic
    │   ├── vocore/                  ← PNG renderer + USB serial sender to wheel screen
    │   ├── engineer/                ← WebSocket server for LAN engineers
    │   ├── wheel/                   ← button detector, valid-lap finder
    │   ├── sync/                    ← sync client (API server ↕)
    │   └── setup/                   ← local setup file manager
    └── frontend/                    ← Wails React/TS frontend (dist/ embedded by main.go)
        ├── src/
        │   ├── App.tsx
        │   ├── views/
        │   ├── components/
        │   ├── hooks/
        │   └── lib/wails.ts
        ├── package.json
        ├── vite.config.ts
        ├── tailwind.config.ts
        └── index.html
```

### Turborepo Task Order

```
@sprint/tokens
    ├── @sprint/ui     (depends on tokens)
    └── @sprint/types
            ├── web            (depends on ui + types + tokens)
            └── app/frontend   (depends on ui + types + tokens)
```

### Go Workspace (`go.work`)

```
go 1.25

use (
    ./app
    ./api
    ./pkg
)
```

Three Go modules sharing `pkg/dto` and `pkg/games` via workspace resolution. Set
`GOPRIVATE=github.com/kratofl/*` in your shell so `go mod tidy` skips the sum check
for this private repo.

## Shared Go Module (`/pkg`)

- `pkg/dto/` is the **single source of truth** for telemetry and engineer protocol types. Both `/app` and `/api` import it.
- `pkg/games/` defines the `GameAdapter` interface and contains game-specific adapters (one package per game).
- No application logic in `/pkg` — only data types, interfaces, and adapters.

## Go Desktop App Conventions (`/app`)

- Single binary, standard Wails scaffold: `main.go` + `app.go` at module root.
- All app-private logic under `internal/` (coordinator, vocore, engineer, wheel, sync, setup).
- Imports shared types from `github.com/kratofl/sprint/pkg/dto` and `pkg/games`.
- The coordinator is thin — it wires components together, it does not contain business logic.

## Go API Server Conventions (`/api`)

- Single binary HTTP server using the standard library (`net/http`).
- All server-private logic under `internal/` (server, handler, relay, store, auth).
- Imports shared types from `github.com/kratofl/sprint/pkg/dto`.
- The relay package manages WebSocket connections for remote engineers — desktop app connects and pushes telemetry, engineers connect and receive it.
- The store package handles all database operations; no SQL outside this package.

## Wails Desktop App Conventions (`/app`)

- The Wails app exposes Go backend methods to the frontend via Wails bindings. Keep bindings thin — they call internal services, they do not contain logic.
- The React frontend (`/app/frontend`) uses the same design system as `/web` via shared components in `/packages`.
- The desktop frontend has access to native capabilities through Wails (file system, OS notifications) — use them when the web app equivalent would require a browser permission prompt.
- Desktop-only features (VoCore config, wheel button mapping, direct LAN engineer invite) live in `/app/frontend` and are not part of `/packages`.

## Next.js Web App Conventions (`/web`)

- Use the App Router. The web app is a **pure frontend** — all data comes from the Go API server.
- API calls go through `next.config.ts` rewrites that proxy `/api/*` to the Go API server.
- The Race Engineer portal is a real-time page — connects to the API server's WebSocket relay for live telemetry and command channel.
- Telemetry comparison, session history, and setup management are core UI concerns.

## Shared TypeScript Packages (`/packages`)

- Design tokens (CSS variables, Tailwind config) → `@sprint/tokens` — imported by both apps. Single source of truth.
- TypeScript mirrors of Go DTOs → `@sprint/types` — kept in sync manually with `pkg/dto/*.go`.
- Shared UI components and utils → `@sprint/ui` — **write components here first**.

### Component ownership rules

| Location | For |
|---|---|
| `packages/ui/src/components/primitives/` | Reusable visual atoms: `Button`, `Badge`, `Card` |
| `packages/ui/src/components/telemetry/` | Domain display: `LapTime`, `DeltaBar`, `TireTemp` |
| `app/frontend/src/components/` | **Desktop-only** — Wails bindings, native chrome, drag regions |
| `web/components/` | **Web-only** — Next.js server components, routing-aware layouts |

**Rule:** When building a new visual component, put it in `packages/ui` unless it requires Wails- or Next.js-specific APIs. Both apps import from `@sprint/ui`.

**Tailwind reminder:** Both apps' `tailwind.config.ts` include `../../packages/ui/src/**/*.{ts,tsx}` in `content` — classes in shared components are not purged.

- No platform-specific code (no `window.go`, no Next.js imports) in `/packages`.

## Design System

Full reference: [`docs/DESIGN_SYSTEM.md`](../docs/DESIGN_SYSTEM.md)
Stitch brief (aesthetic/narrative): [`.stitch/DESIGN.md`](../.stitch/DESIGN.md)

### Key tokens (inline for quick reference)

**Colors:**
| Role | Hex | Usage |
|---|---|---|
| Background | `#080809` | Page background (+ subtle orange radial gradient) |
| Orange (primary) | `#EF8118` | Driver actions, primary buttons, active nav, focus rings |
| Teal (secondary) | `#1EA58C` | Engineer actions, comparison highlights, secondary CTAs |
| Foreground | `#F2F2F3` | Primary text |
| Muted foreground | `#8A8A95` | Labels, timestamps, helper text |
| Disabled | `#52525C` | Placeholders, inactive elements |
| Success | `#34D399` | Personal bests, improvements, online status |
| Warning | `#FBBF24` | Caution, yellow flag |
| Danger | `#F87171` | Errors, time losses |

**Glass surface utility classes** (defined in `packages/tokens/globals.css`, imported by both apps):
```
.glass           → rgba(255,255,255,0.04)  blur(12px)  — cards, panels
.glass-elevated  → rgba(255,255,255,0.07)  blur(20px)  — dropdowns, tooltips
.glass-overlay   → rgba(255,255,255,0.10)  blur(32px)  — modals, sheets
.glass-highlight → inset 0 1px 0 rgba(255,255,255,0.10) — top edge glow, pair with .glass
```

**Typography:**
- Font: `Inter` (variable, 100–900). Telemetry numbers: `font-mono tabular-nums` to prevent layout shift.
- Hero stat values (lap times, top speed): `text-3xl font-bold font-mono tabular-nums`

**Orange = driver-owned / primary action. Teal = engineer-originated / comparison. Never use both at the same visual weight on the same element.**

## Data Flow for New Game Support

1. Create a new package under `app/internal/games/` (e.g., `games/iracing/`).
2. Implement the `GameAdapter` interface to read raw telemetry from the game.
3. Map raw data to the unified DTO in `internal/dto/`.
4. Register the adapter in the coordinator.
5. No changes needed to the VoCore renderer, engineer hub, web app, or sync client.

