# Shared Go Packages (`/pkg`)

Shared Go module imported by both the desktop app (`/app`) and the API server (`/api`).

## What's here

### `dto/` — Unified Telemetry DTO

The canonical data format for all telemetry data in Sprint.

- `telemetry.go` — `TelemetryFrame`, `Session`, `CarState`, `TireState`, `LapState`, `Flags`
- `engineer.go` — `EngineerCommand`, `EngineerEvent`, command/event types and payloads

All values use SI units: speed in m/s, temperatures in °C, pressures in kPa.

### `games/` — Game Adapter Interface

- `adapter.go` — `GameAdapter` interface that all game integrations implement
- `lemansultimate/` — Le Mans Ultimate adapter (UDP reader + DTO mapping)

## Adding a New Game

1. Create `pkg/games/<gamename>/`
2. Implement the `GameAdapter` interface:
   ```go
   type GameAdapter interface {
       Name()  string
       Start() error
       Stop()  error
   }
   ```
3. Map raw game data to `dto.TelemetryFrame`
4. Register in `app/internal/coordinator/`

No changes needed to the VoCore renderer, engineer hub, web app, or sync client.

## Module

```
module github.com/kratofl/sprint/pkg
```

Linked via `go.work` — no manual `replace` directives needed during development.
