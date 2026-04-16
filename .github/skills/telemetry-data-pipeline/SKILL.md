---
name: telemetry-data-pipeline
description: Guide for working with the sim racing telemetry data pipeline — from raw UDP game data through the GameAdapter interface, unified DTO, and downstream consumers (VoCore renderer, race engineer hub, sync client). Use this when implementing game adapters, modifying DTOs, or working on telemetry processing.
---

# Telemetry Data Pipeline

## Data Flow

```
Sim Game (UDP / shared memory)
    ↓
GameAdapter.Read() → *dto.TelemetryFrame
    ↓
Coordinator (30 Hz throttle)
    ├→ USB screen renderer (RGB565 → WinUSB → VoCore / USBD480)
    ├→ Delta tracker (position-based lap delta, valid-lap detection)
    └→ Frontend events (Wails EventsEmit)
```

## GameAdapter Interface (`pkg/games/adapter.go`)

```go
type GameAdapter interface {
    Name() string                           // e.g., "LeMansUltimate"
    Connect() error                         // safe to call multiple times
    Disconnect() error                      // safe if not connected
    Read() (*dto.TelemetryFrame, error)     // blocks until frame ready
}
```

Each game adapter lives in `pkg/games/<gamename>/` and maps raw game data to the unified DTO.

### Adding a new game adapter

1. Create `pkg/games/<gamename>/` package
2. Implement `GameAdapter` interface
3. Map raw data to `dto.TelemetryFrame` — use SI units (m/s, °C, kPa)
4. Register in `app/internal/core/core.go`
5. No other changes needed — all downstream consumers use the unified DTO

## TelemetryFrame DTO (`pkg/dto/telemetry.go`)

The root type is `TelemetryFrame` containing:
- **Timestamp** — frame capture time
- **Session** — session type (practice/qualify/race/warmup), track info
- **Car** — throttle/brake/clutch (0–1), steering (-1 to 1), gear (-1 to 8), speed (m/s)
- **Tires** — array indexed by FL=0, FR=1, RL=2, RR=3; temps (°C), pressures (kPa)
- **Lap** — current/best/last lap times, sector times, lap count
- **Flags** — yellow, blue, safety car, track limits violation

### DTO Rules

- **SI units throughout**: m/s for speed, °C for temperature, kPa for pressure
- **All fields JSON-serializable** (struct tags on every field)
- **Zero values are meaningful**: 0 speed = stationary, not "unknown"
- **TypeScript mirrors** in `packages/types/src/telemetry.ts` must stay in sync manually

## Coordinator Throttling

The coordinator throttles frame emission to ~30 Hz (33ms intervals) to prevent overwhelming the frontend and WebSocket consumers. The `GameAdapter.Read()` call may produce frames faster than this.

## Valid Lap Criteria (`app/internal/delta/`)

When the driver presses the "set target" button, the most recent valid lap is used. A valid lap satisfies ALL of:
- Not an out-lap or in-lap
- No yellow flag or safety car active during the lap
- No track limits violation
- Lap time within ±5% of session best

## Engineer Protocol (`pkg/dto/engineer.go`)

Commands from engineers (target lap change, pit notes, dash adjustments) are separate from telemetry. The desktop app is authoritative — it applies or rejects commands.
