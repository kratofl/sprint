# Desktop App (`/app`)

Wails application (Go backend + React/TypeScript frontend) that runs on the driver's rig.

## Responsibilities

- Read live telemetry from sim racing games via UDP/shared memory
- Render PNG frames to the VoCore steering wheel display over USB serial
- Host a WebSocket server for LAN race engineer connections
- Detect wheel button presses (set target lap, etc.)
- Manage car setups locally
- Sync sessions, setups, and layouts with the API server

## Structure

```
app/
├── main.go                 ← Wails entry point (embeds frontend/dist)
├── app.go                  ← App struct bound to frontend
├── wails.json              ← Wails config
├── internal/
│   ├── coordinator/        ← Wires all services together
│   ├── render/             ← Dashboard image painter (Painter, widgets)
│   ├── vocore/             ← VoCore USB screen driver (Driver, WinUSB)
│   ├── devices/            ← USB device detection, screen config
│   ├── engineer/           ← WebSocket hub for LAN engineers
│   ├── wheel/              ← Button detector + valid lap finder
│   ├── dash/               ← Layout types and manager
│   ├── sync/               ← API server sync client
│   └── setup/              ← Local setup file manager
└── frontend/               ← React/TS frontend (Vite)
    ├── src/
    │   ├── App.tsx
    │   ├── views/          ← Telemetry, DashEditor, Setups, EngineerStatus
    │   ├── hooks/          ← useTelemetry
    │   └── lib/            ← Wails runtime bindings
    ├── package.json        ← @sprint/desktop
    └── vite.config.ts
```

## Running

```bash
# Development (requires Wails CLI)
cd app && wails dev

# Production build
make build-app
```

## Dependencies

- Imports shared types from `/pkg` (via `go.work`)
- Frontend imports design tokens from `@sprint/tokens` and types from `@sprint/types`
