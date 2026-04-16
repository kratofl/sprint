# Desktop App (`/app`)

Wails application (Go backend + React/TypeScript frontend) that runs on the driver's rig.

## Responsibilities

- Read live telemetry from sim racing games via UDP/shared memory
- Render RGB565 frames to USB wheel/dash screens (VoCore M-PRO, USBD480) via WinUSB
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
│   ├── core/               ← Wires all services together (Coordinator)
│   ├── hardware/           ← ScreenDriver interface, VoCoreDriver, USBD480Driver
│   ├── dashboard/          ← DashLayout model, Manager, Painter, widgets/, alerts/
│   ├── devices/            ← Device registry persistence (devices.json), catalog
│   ├── input/              ← Wheel button Detector
│   ├── delta/              ← Position-based lap delta Tracker + valid-lap detection
│   ├── commands/           ← Button→action global registry
│   ├── capture/            ← Windows screen capture (rear-view) + overlay window
│   ├── updater/            ← GitHub Releases checker + self-replace installer
│   ├── settings/           ← Persistent app preferences (settings.json)
│   ├── logger/             ← slog wrapper + multi-writer
│   └── appdata/            ← Platform config dir resolver
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
