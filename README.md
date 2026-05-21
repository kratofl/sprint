<div align="center">
  <img src="docs/sprint_logo_icon.png" alt="Sprint" width="120" />
  <h1>Sprint</h1>
  <p>Sim racing telemetry system — live data on your wheel, your engineer on voice, your setup in the cloud.</p>
</div>

Sprint is a full-stack telemetry system for sim racers. A native desktop app runs on your rig, reads live telemetry from the game, and streams data to a VoCore steering wheel display. A remote race engineer can connect from anywhere to see the same live data and push commands — change the target laptime, send pit notes, adjust dash parameters. Sessions are synced to a cloud API for post-session analysis on the web.

---

## Architecture

```
Sim Game (e.g. LeMansUltimate)
        ↓  UDP / shared memory
┌──────────────────────────────────────────────────────┐
│  Wails Desktop App  (/app)                          │
│                                                      │
│  Go backend:                                         │
│    · Game telemetry reader + DTO pipeline            │
│    · USB screen renderer  (RGB565 → WinUSB → wheel/dash screens)    │
│    · Wheel button detector  (set target lap)         │
│    · Race Engineer hub  (WebSocket, LAN or remote)   │
│    · Setup manager & sync client                     │
│                                                      │
│  React/TS frontend:                                  │
│    · Live telemetry  · Dash editor  · Setups         │
│    · Race Engineer status panel                      │
└──────────────────────────────────────────────────────┘
        │  RGB565 frames (WinUSB)      │  WebSocket
        ↓                          ↓
  USB Screen               Race Engineer (LAN)
  (VoCore / USBD480)       direct IP:port

        ↓  HTTP / WebSocket (sync + live stream)
┌──────────────────────────────────────────────────────┐
│  Go API Server  (/api)                               │
│    · REST API  (sessions, setups, layouts, auth)     │
│    · WebSocket relay  (remote engineer access)       │
│    · Postgres database                               │
└──────────────────────────────────────────────────────┘
        ↓  serves frontend
┌──────────────────────────────────────────────────────┐
│  Next.js Web App  (/web)                            │
│    · Telemetry analysis & session history            │
│    · Dash layout editor  (syncs ↕ via API)          │
│    · Setup management    (syncs ↕ via API)          │
│    · Race Engineer portal  (live view + commands)    │
│    · Multi-user session sharing                      │
└──────────────────────────────────────────────────────┘
```

---

## Monorepo structure

| Path | Language | Description |
|---|---|---|
| `/app` | Go + React/TS | Wails desktop app — driver's rig |
| `/api` | Go | HTTP/WebSocket API server |
| `/web` | TypeScript | Next.js web frontend |
| `/pkg` | Go | Shared DTO types + game adapter interfaces |
| `/packages` | TypeScript | Shared UI components, types + design tokens |

The three Go modules (`app`, `api`, `pkg`) are linked by a `go.work` workspace. The two TypeScript apps (`web`, `app/frontend`) share a pnpm workspace managed by Turborepo.

---

## Prerequisites

| Tool | Version | Required for |
|---|---|---|
| [Go](https://go.dev) | ≥ 1.26 | API server, desktop app backend |
| [Wails CLI](https://wails.io/docs/gettingstarted/installation) | v2 | Desktop app build |
| [Node.js](https://nodejs.org) | ≥ 20 | Web app, desktop frontend |
| [pnpm](https://pnpm.io) | ≥ 9 | Package manager |
| [Docker](https://www.docker.com) | — | Containerised deployment |
| [Make](https://www.gnu.org/software/make/) | — | Build shortcuts |

---

## Quick start

### Docker (API + web + database)

```bash
cp .env.example .env
make docker-up
```

- Web app → http://localhost:3000
- API server → http://localhost:8080
- Postgres → localhost:5432

### Local development

```bash
# Terminal 1 — API server
make dev-api

# Terminal 2 — Web app
make dev-web

# Terminal 3 — Desktop app (requires Wails + game running)
cd app && wails dev
```

---

## Make targets

```
make help          # list all targets

Development
  dev-api          Run the API server locally (go run)
  dev-web          Run the Next.js web app in dev mode

Build
  build-api        Compile API server → bin/sprint-api
  build-web        Build Next.js production output
  build-app        Build Wails desktop app (requires Wails CLI)
  build            build-api + build-web

Test & lint
  test             Run all Go tests (api + pkg)
  test-api         Run API server tests only
  test-pkg         Run shared package tests only
  lint             go vet (api/pkg) + pnpm lint
  lint-app         go vet for the Wails app (requires built frontend)
  fmt              gofmt + pnpm format

Docker
  docker-build     Build all Docker images
  docker-up        Start services in the background
  docker-down      Stop and remove containers
  docker-logs      Tail logs from all services

Misc
  clean            Remove bin/, web/.next/, app/build/, app/frontend/dist/
```

---

## Adding a new game

1. Create a new package under `pkg/games/` — e.g. `pkg/games/iracing/`
2. Implement the `GameAdapter` interface from `pkg/games/adapter.go`:
   ```go
   type GameAdapter interface {
       Name()       string
       Connect()    error
       Disconnect() error
       Read()       (*dto.TelemetryFrame, error)
   }
   ```
3. Map raw game data to the unified DTO in `pkg/dto/telemetry.go` — **no other files need to change**
4. Register the adapter in `app/internal/core/core.go`

The VoCore renderer, engineer hub, web app, and sync client all consume the unified DTO and are unaffected by the new adapter.

---

## Key features

### VoCore and USBD480 wheel displays
The Go backend renders RGB565 image frames and sends them to a USB screen embedded in the steering wheel via **WinUSB** (no serial port — the screen uses a vendor-specific bulk transfer protocol). Two screen families are supported:
- **VoCore M-PRO** (`VID 0xC872`) — 4"–10" OLED/LCD panels; model auto-detected via USB query
- **USBD480** (`VID 0x16C0`, `PID 0x08A7`) — NX43/NX50 800×480 displays

Both require the WinUSB driver bound in Windows (installed automatically by the vendor setup tool, or manually via [Zadig](https://zadig.akeo.ie)). Layout and content are controlled by the dash layout configuration editable in the desktop app's **Dash Designer**.

### Dash Designer
A built-in visual editor lets you build custom wheel display layouts without writing any code:
- **Widget palette** — drag widgets from categorised groups (Layout, Timing, Car, Race) onto a grid canvas
- **Grid canvas** — 20×12 grid matching the 800×480 native screen. Widgets snap to cells; ghost overlay shows valid (orange) or invalid (red) placements in real-time
- **Properties panel** — configure widget-specific parameters (TC level 1/2/3, etc.)
- **Multiple pages** — cycle between pages via a wheel button; a dedicated Idle page is shown when no session is running
- **Live hot-reload** — saving a layout immediately updates the VoCore screen without restarting

### Wheel button — set target lap
Press a configurable wheel button to set the current delta reference to the most recent **valid lap**. A valid lap must pass all of:
- No out-lap or in-lap
- No yellow flag or safety car during the lap
- No track limits violation
- Lap time within ±5% of session best

The change triggers an immediate VoCore re-render and is broadcast to all connected engineers.

### Race Engineer mode
- Share a live session via LAN (direct IP:port) or remote invite link (via web app)
- Engineers receive the same live telemetry WebSocket stream
- Engineers can push commands: change target laptime, send pit notes, adjust dash parameters
- The desktop app is always **authoritative** — it applies or rejects engineer commands
- Both sides see command status in real time

---

## Design system

Full specification: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

The UI uses a glassmorphism dark theme — frosted glass surfaces over a near-black background, with two accent colors that carry semantic meaning throughout both apps:

- **Orange `#ff906c`** — driver actions, primary buttons, driver-owned data
- **Cyan `#5af8fb`** — engineer actions, comparison highlights, secondary CTAs

---

## License

[GPL-3.0](LICENSE)
