# Go & Wails — Concepts for this Project

## What is Go?

Go (also called Golang) is a compiled, statically-typed programming language made by Google. It compiles to a single native binary with no runtime dependency — you ship one `.exe` or binary and it just works.

Key characteristics relevant here:

| Feature | What it means in practice |
|---|---|
| **Compiled** | Code is turned into machine code before running. Errors are caught at compile time, not at runtime. |
| **Statically typed** | Every variable has a fixed type. The compiler rejects mismatches. |
| **Single binary** | `go build` produces one self-contained executable. |
| **Concurrency built-in** | Goroutines (lightweight threads) and channels make it easy to run things in parallel without complex thread management. |
| **Modules** | Dependencies declared in `go.mod`, locked in `go.sum`. Similar to `package.json` + `pnpm-lock.yaml`. |

### Go module system

Every Go project has a `go.mod` file that declares:
- the module name (e.g. `github.com/kratofl/sprint/app`)
- the Go version
- external dependencies

```
module github.com/kratofl/sprint/app

go 1.25

require (
    github.com/kratofl/sprint/pkg v0.0.0
    github.com/wailsapp/wails/v2 v2.x.x
)
```

This project uses a **Go workspace** (`go.work` in the repo root). A workspace lets multiple modules (`/app`, `/api`, `/pkg`) reference each other locally without publishing to a registry. Think of it like pnpm workspaces but for Go.

```
// go.work
go 1.25

use (
    ./app   // the desktop app module
    ./api   // the API server module
    ./pkg   // shared types and adapters
)
```

When you import `github.com/kratofl/sprint/pkg/dto` from within `/app`, Go resolves it to your local `/pkg` folder automatically.

---

## What is Wails?

Wails is a framework for building **desktop applications** using Go as the backend and a web frontend (React, Vue, etc.) as the UI. Think of it as Electron but built on Go instead of Node.js — much lighter and faster.

### How Wails works

```
┌────────────────────────────────────────────────┐
│  Wails Desktop App (single process)            │
│                                                │
│  ┌──────────────┐      ┌─────────────────────┐ │
│  │  Go backend  │◄────►│  React frontend     │ │
│  │  (your code) │      │  (runs in a webview)│ │
│  └──────────────┘      └─────────────────────┘ │
│         ↑                                       │
│    Wails runtime bridges the two sides          │
└────────────────────────────────────────────────┘
```

- The **Go backend** runs natively on the OS. It has access to everything: files, USB ports, network sockets, system APIs.
- The **React frontend** runs in a WebView (the OS's built-in browser engine: WebKit on macOS, WebView2 on Windows). It looks and feels like a native window.
- Wails creates a **bidirectional bridge**: Go methods can be called directly from JavaScript, and Go can emit events that the frontend listens to.

### Calling Go from JavaScript (bindings)

In `app.go` (or any struct bound to Wails) you expose methods:

```go
// Go side
type App struct{}

func (a *App) GetTelemetry() dto.TelemetryFrame {
    return currentFrame
}
```

Wails auto-generates TypeScript bindings. From the frontend:

```typescript
// TypeScript side — generated wrappers in wailsjs/go/
import { GetTelemetry } from '../wailsjs/go/main/App'

const frame = await GetTelemetry()  // calls Go, returns the struct as JSON
```

The call goes: TypeScript → WebView bridge → Go runtime → your function → back as JSON.

### Emitting events (Go → JS)

For real-time data (like telemetry frames), Go pushes events instead of waiting for the frontend to poll:

```go
// Go side — emit every time a new frame arrives
runtime.EventsEmit(ctx, "telemetry:frame", frame)
```

```typescript
// TypeScript side — subscribe
import { EventsOn } from '../wailsjs/runtime'

EventsOn('telemetry:frame', (frame: TelemetryFrame) => {
  setFrame(frame)
})
```

### Project file layout

```
app/
├── go.mod          ← Go module declaration
├── main.go         ← entry point; starts Wails with app options
├── app.go          ← App struct: all methods exposed to the frontend
├── wails.json      ← Wails config (app name, window size, frontend build cmd)
└── internal/       ← Go packages NOT visible to outside modules
    ├── coordinator/    ← wires services together
    ├── render/         ← dashboard image painting (Painter, widgets)
    ├── vocore/         ← VoCore USB screen driver (Driver, WinUSB transport)
    ├── devices/        ← USB device detection, screen config
    ├── engineer/       ← WebSocket server for remote engineers
    ├── wheel/          ← button detection, valid-lap logic
    ├── sync/           ← sync client to the API server
    ├── dash/           ← layout types and manager
    └── setup/          ← local setup file manager
└── frontend/       ← the React app (built by vite, served by Wails)
    ├── src/
    └── dist/       ← built output; Wails embeds this into the binary
```

### Development workflow for Wails

```bash
# Start Wails dev server (hot-reload for both Go and React)
cd app
wails dev

# Build production binary
wails build
```

`wails dev` runs Vite for the frontend (live reload) and recompiles Go when you save a `.go` file. The result is a native window that updates as you code.

### Why Go for a desktop app?

- Direct access to USB serial ports (for the VoCore wheel display), something a Node.js Electron app would need native addons for.
- Very low memory footprint (Go binary is typically 15–40 MB; Electron apps are 150 MB+).
- Goroutines make it trivial to run the telemetry reader, the image renderer, and the WebSocket server all concurrently without complex async plumbing.

---

## Key Go concepts you will encounter in this codebase

### Goroutines

A goroutine is a lightweight concurrent function. You start one with `go`:

```go
go func() {
    for frame := range telemetryCh {
        hub.Broadcast(frame)
    }
}()
```

This runs in the background without blocking the main flow. This project uses goroutines for:
- reading UDP/shared memory telemetry continuously
- sending PNG frames over USB serial
- serving WebSocket connections

### Channels

Channels are typed pipes for passing data between goroutines:

```go
ch := make(chan dto.TelemetryFrame, 1)  // buffered channel, holds 1 item

// sender
ch <- frame

// receiver
frame := <-ch
```

### Interfaces

Go interfaces are satisfied implicitly — if your type has the right methods, it implements the interface without declaring it explicitly:

```go
// defined in /pkg/games/adapter.go
type GameAdapter interface {
    Connect() error
    Frames() <-chan dto.TelemetryFrame
    Close()
}

// /pkg/games/lemansultimate/adapter.go satisfies GameAdapter
// without explicitly writing "implements GameAdapter"
```

This makes it easy to add new game support: implement the three methods, and the rest of the system works automatically.

### `internal/` packages

Go enforces that packages inside an `internal/` directory can only be imported by code in the parent tree. So `app/internal/vocore` can be imported by code in `app/`, but not by `api/`. This keeps the modules properly encapsulated.
