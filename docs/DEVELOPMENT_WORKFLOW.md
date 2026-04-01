# Development Workflow

This document explains how to actually work on this project day-to-day — what to run, in what order, and why.

---

## Prerequisites

Make sure these are installed:

| Tool | Version | What it's for |
|---|---|---|
| **Go** | 1.25+ | Building the desktop app and API server |
| **Node.js** | 22+ | Running the React frontends and tooling |
| **pnpm** | 10+ | JavaScript package manager (do not use npm/yarn) |
| **Wails CLI** | v2 latest | Building and dev-serving the desktop app |
| **Docker** | Latest | Running the API server and database in containers |

Install pnpm: `npm install -g pnpm`
Install Wails: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

---

## Repository structure at a glance

```
sprint/
├── app/             ← Wails desktop app (Go backend + React frontend)
├── api/             ← Go HTTP/WebSocket API server
├── pkg/             ← Shared Go types and game adapters
├── packages/
│   ├── tokens/      ← @sprint/tokens: shared design tokens
│   ├── ui/          ← @sprint/ui: shared React components
│   └── types/       ← @sprint/types: shared TypeScript types
├── web/             ← Next.js web app (browser frontend)
├── go.work          ← Go workspace (links app, api, pkg)
├── pnpm-workspace.yaml ← pnpm workspace config
└── turbo.json       ← Turborepo task graph
```

---

## First-time setup

```bash
# 1. Clone the repo and enter it
git clone <repo-url> && cd sprint

# 2. Install all JavaScript dependencies
pnpm install

# 3. Build all shared TypeScript packages (must happen before running apps)
pnpm turbo build --filter=@sprint/tokens
pnpm turbo build --filter=@sprint/types
pnpm turbo build --filter=@sprint/ui

# 4. Download Go dependencies
go work sync

# (Optional) Verify everything type-checks
pnpm turbo type-check
cd app && go build ./...
```

---

## Day-to-day: working on the desktop app

The desktop app is the primary focus. Here's the typical flow:

### Start the Wails dev server

```bash
cd app
wails dev
```

This does several things at once:
- Starts Vite (the JavaScript bundler) in watch mode — React changes hot-reload instantly
- Watches Go files — recompiles and restarts the app when you save a `.go` file
- Opens a native window with your app

**Important:** If you change anything in `packages/ui/`, you need to rebuild it, then Wails will pick up the new JS automatically via Vite:

```bash
# In a separate terminal:
cd packages/ui && pnpm build
# Vite (running via wails dev) will detect the changed dist/ and hot-reload
```

### Working on shared UI components

`packages/ui/` is the home for reusable shared visual components. If a component is meant to be used by both the desktop app and the web app, add it in `packages/ui/src/components/` and consume it from `@sprint/ui`.

Keep `app/frontend/src/components/` for desktop-only UI (Wails bindings, window chrome, native integrations) and `web/components/` for web-only UI (Next.js routing boundaries, browser-specific behavior). If a platform-specific component later becomes shared, extract the reusable visual piece into `packages/ui/`.

For styling, prefer Tailwind utility classes plus the shared tokens and utilities from `packages/tokens/`. Keep class choices aligned with `docs/DESIGN_SYSTEM.md` instead of introducing ad-hoc CSS or hardcoded one-off values. Both apps include `packages/ui/src/**/*.{ts,tsx}` in Tailwind's content scan, so classes used in shared components are preserved on both surfaces.

When you edit a component in `packages/ui/src/`:

1. Edit the component source in `packages/ui/src/components/`
2. Keep styling token-backed and Tailwind-first
3. Run `cd packages/ui && pnpm build` (or keep a watch build running if the package supports it)
4. Wails dev / Next.js dev will pick up the rebuilt package

### Go backend changes

Go files under `app/internal/` are watched by `wails dev` and trigger a recompile automatically. No separate step needed.

---

## Day-to-day: working on the web app

```bash
# Start the Next.js dev server
cd web
pnpm dev
# Open http://localhost:3000
```

The web app calls the Go API server. You need the API server running for most pages to work:

```bash
# In a separate terminal — start the API + database via Docker Compose
docker compose up
```

---

## Running the API server locally (without Docker)

```bash
cd api
go run .
# API server starts on :8080 by default
```

For full stack development with a database, prefer Docker Compose (see below).

---

## Docker Compose

The `docker-compose.yml` in the repo root runs the API server and its database together. This is the easiest way to have a working backend for the web app.

```bash
# Start everything in the background
docker compose up -d

# See what's running
docker compose ps

# View API server logs
docker compose logs -f api

# Stop everything
docker compose down

# Stop and delete all data (fresh start)
docker compose down -v
```

### What Docker runs

| Service | Description | Port |
|---|---|---|
| `api` | Go API server | `8080` |
| `db` | PostgreSQL or SQLite database | internal |

The desktop app does **not** run in Docker — it's a native application that runs directly on your machine via Wails.

---

## Running all TypeScript checks at once

```bash
# From the repo root — type-checks all packages in the correct order
pnpm turbo type-check
```

---

## Building for production

### Desktop app

```bash
cd app
wails build
# Produces a native binary in app/build/bin/
```

This compiles the React frontend with Vite, then embeds the output into the Go binary. The result is a single self-contained executable.

### Web app

```bash
cd web
pnpm build
pnpm start  # serve the production build locally
```

---

## `app/internal/` package responsibilities

| Package | Owns | Does NOT own |
|---|---|---|
| `coordinator` | Wires all subsystems together; no business logic | Any domain logic |
| `vocore` | VoCore screen config, USB scan, rendering pipeline, widget toolkit | Wheel serial ports |
| `devices` | Wheel serial-port detection, `DeviceConfig`, `Manager`, `ListPorts` | VoCore screen code |
| `engineer` | WebSocket hub for LAN race engineers; broadcasts `EngineerEvent` | Wheel button logic |
| `wheel` | Button detector, valid-lap selector; fires `onTargetChanged` callback | `engineer.Hub` (decoupled) |
| `setup` | Local car/track setup file manager | Everything else |
| `sync` | API server sync client (HTTP) | Everything else |
| `dash` | `DashLayout`, `DashWidget`, `WidgetType` constants | Rendering |
| `logger` | Structured logging initialisation | Everything else |

---

## Adding a new VoCore widget

New widgets are self-registering. You only touch two files:

### Step 1 — `app/internal/dash/layout.go`

Add a `WidgetType` constant and register it in the metadata maps:

```go
const (
    WidgetMyThing WidgetType = "my_thing"
    // ...
)

var widgetLabels = map[WidgetType]string{
    WidgetMyThing: "My Thing",
    // ...
}

var widgetCategories = map[WidgetType]string{
    WidgetMyThing: "telemetry", // or "controls", "info", etc.
}
```

### Step 2 — `app/internal/render/widget_my_thing.go`

Create a new file. Register the renderer via `init()`. Use `WidgetCtx` helpers:

```go
package render

import "github.com/kratofl/sprint/app/internal/dash"

func init() { RegisterWidget(dash.WidgetMyThing, drawMyThing) }

func drawMyThing(c WidgetCtx) {
    c.Panel()                              // standard elevated panel background

    c.FontNumber(c.H * 0.5)               // JetBrainsMono-Bold, scaled to widget height
    c.DC.SetColor(ColTextPri)
    c.DC.DrawStringAnchored(
        c.FmtSpeed(float64(c.Frame.Car.SpeedMS)),
        c.CX(), c.CY(), 0.5, 0.5,
    )

    c.FontLabel(c.H * 0.15)              // SpaceGrotesk-Regular for labels
    c.DC.SetColor(ColTextMuted)
    c.DC.DrawString("MY LABEL", c.X+10, c.Y+c.H*0.85)
}
```

That's it. No other files need to change.

### `WidgetCtx` API reference

| Helper | Description |
|---|---|
| `c.Panel()` | Draws the standard elevated panel bg for this widget's bounding box |
| `c.PanelR(r)` | Panel with custom corner radius |
| `c.CX()` / `c.CY()` | Centre X / Y of the bounding box |
| `c.FontLabel(sz)` | SpaceGrotesk-Regular — UI labels and captions |
| `c.FontBold(sz)` | SpaceGrotesk-Bold — section headers |
| `c.FontNumber(sz)` | JetBrainsMono-Bold — large telemetry values (gear, speed) |
| `c.FontMono(sz)` | JetBrainsMono-Regular — smaller mono values (sector times) |
| `c.HBar(x,y,w,h,pct,col)` | Left-aligned progress bar; pct clamped to [0,1] |
| `c.HBarCentered(x,y,w,h,pct,col)` | Centre-origin bar; 0=full left, 0.5=neutral, 1=full right |
| `c.FmtLap(t)` | Formats seconds as `M:SS.mmm` |
| `c.FmtSector(t)` | Formats seconds as `SS.mmm` |
| `c.FmtSpeed(ms)` | Converts m/s → km/h, returns integer string |

**Design token colour constants** (accessible in all `widget_*.go` files in `package render`):

| Constant | Hex | Use |
|---|---|---|
| `ColTextPri` | `#ffffff` | Primary text |
| `ColTextSec` | `#A1A1AA` | Secondary text |
| `ColTextMuted` | `#808080` | Labels, timestamps |
| `ColAccent` | `#ff906c` | Driver-owned actions, highlights |
| `ColTeal` | `#5af8fb` | Engineer-originated data, best lap |
| `ColSuccess` | `#34D399` | Personal bests, throttle bar |
| `ColDanger` | `#F87171` | Errors, brake bar, time loss |
| `ColWarning` | `#FBBF24` | Yellow flag, caution |
| `ColSurface` | `#141414` | Widget fill (container level) |
| `ColElevated` | `#1f1f1f` | Panel background (elevated level) |

---



Here's the mental model for a typical desktop feature:

```
1. Define the data shape
   └─ Add/update a struct in /pkg/dto/ (Go)
      └─ Mirror it in /packages/types/src/ (TypeScript)

2. Implement the Go logic
   └─ Add code in /app/internal/<relevant package>/

3. Expose it to the frontend
   └─ Add a method to the App struct in /app/app.go
      └─ Wails auto-generates the TypeScript binding

4. Build the UI
   ├─ Shared visual component? Create/update it in /packages/ui/ and consume it from @sprint/ui
   │  └─ Then rebuild: cd packages/ui && pnpm build
   └─ Platform-specific UI stays in /app/frontend/src/components/ or /web/components/
```

---

## Common mistakes and how to avoid them

### "My UI changes in packages/ui aren't showing up"

You must rebuild the package after editing source:
```bash
cd packages/ui && pnpm build
```
The dist/ folder is what the apps import, not the src/.

### "TypeScript says a @sprint/ui component doesn't exist"

Same issue — the dist is stale. Run `pnpm build` in `packages/ui`.

### "Go says it can't find a package from /pkg"

Make sure you're in a Go workspace context. The `go.work` file in the root links the modules. Run:
```bash
cd sprint  # repo root, where go.work lives
go work sync
```

### "Wails can't find the frontend"

Make sure `wails.json` points to the right frontend directory and that `pnpm install` has been run in `app/frontend/`.

### "Docker Compose fails to start"

Check if port 8080 is already in use by something else:
```bash
lsof -i :8080
```

---

## Environment variables

| Variable | Where used | What it does |
|---|---|---|
| `GOPRIVATE=github.com/kratofl/*` | Go build | Tells Go not to check the public checksum DB for private modules |
| `VITE_API_URL` | app/frontend | URL of the API server (default: `http://localhost:8080`) |
| `NEXT_PUBLIC_API_URL` | web | URL of the API server for client-side fetches |

For local development these usually don't need to be set — the defaults work with the Docker Compose setup.

---

## Summary: what to run for each scenario

| You want to... | Command |
|---|---|
| Work on the desktop app | `cd app && wails dev` |
| Work on the web app | `docker compose up -d && cd web && pnpm dev` |
| Edit a shared UI component | Edit `packages/ui/src/`, then `cd packages/ui && pnpm build` |
| Check types across everything | `pnpm turbo type-check` (from root) |
| Build the desktop app binary | `cd app && wails build` |
| Start fresh (reinstall deps) | `pnpm install && pnpm turbo build` (from root) |
| View API logs | `docker compose logs -f api` |
