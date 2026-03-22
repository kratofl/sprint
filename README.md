# Sprint

> Sim racing telemetry platform — live data on your wheel, your engineer on voice, your setup in the cloud.

Sprint is a full-stack telemetry platform for sim racers. A native desktop app runs on your rig, reads live telemetry from the game, and streams data to a VoCore steering wheel display. A remote race engineer can connect from anywhere to see the same live data and push commands — change the target laptime, send pit notes, adjust dash parameters. Sessions are synced to a cloud API for post-session analysis on the web.

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
│    · VoCore image renderer  (PNG → wheel screen via USB)     │
│    · Wheel button detector  (set target lap)         │
│    · Race Engineer hub  (WebSocket, LAN or remote)   │
│    · Setup manager & sync client                     │
│                                                      │
│  React/TS frontend:                                  │
│    · Live telemetry  · Dash editor  · Setups         │
│    · Race Engineer status panel                      │
└──────────────────────────────────────────────────────┘
        │  PNG frames (USB serial)     │  WebSocket
        ↓                          ↓
  VoCore Screen             Race Engineer (LAN)
  (steering wheel)          direct IP:port

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
| `/packages` | TypeScript | Shared UI components + design tokens *(planned)* |

The three Go modules (`app`, `api`, `pkg`) are linked by a `go.work` workspace. The two TypeScript apps (`web`, `app/frontend`) share a pnpm workspace managed by Turborepo.

---

## Prerequisites

| Tool | Version | Required for |
|---|---|---|
| [Go](https://go.dev) | ≥ 1.25 | API server, desktop app backend |
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
       Name()  string
       Start() error
       Stop()  error
       // Frames are sent to the coordinator via a channel
   }
   ```
3. Map raw game data to the unified DTO in `pkg/dto/telemetry.go` — **no other files need to change**
4. Register the adapter in `app/internal/coordinator/coordinator.go`

The VoCore renderer, engineer hub, web app, and sync client all consume the unified DTO and are unaffected by the new adapter.

---

## Key features

### VoCore wheel display
The Go backend renders PNG image frames and sends them to a VoCore screen embedded in the steering wheel over **USB serial (CDC ACM)**. The VoCore presents as a serial port when plugged in — `/dev/cu.usbmodemXXXX` on macOS, `/dev/ttyACM0` on Linux, `COM3` on Windows. Layout and content are controlled by the dash layout configuration editable in both the desktop app and the web app.

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

- **Orange `#EF8118`** — driver actions, primary buttons, driver-owned data
- **Teal `#1EA58C`** — engineer actions, comparison highlights, secondary CTAs

---

## License

[GPL-3.0](LICENSE)
