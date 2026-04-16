---
description: 'Scaffold a new game adapter for the telemetry pipeline'
mode: 'agent'
---

# New Game Adapter

I need to add support for a new sim racing game in the Sprint telemetry pipeline.

## What I need

1. **New adapter package** at `pkg/games/<gamename>/`
   - Implement the `GameAdapter` interface from `pkg/games/adapter.go`
   - Read raw data from the game (typically UDP or shared memory)
   - Map raw data to `pkg/dto/telemetry.go` TelemetryFrame — use SI units (m/s, °C, kPa)

2. **Registration** in `app/internal/core/core.go`
   - Add the new adapter as an option the coordinator can use

3. **No other changes** — VoCore, engineer hub, sync client, and frontend all consume the unified DTO

## Reference files to read first

- `pkg/games/adapter.go` — the interface to implement
- `pkg/games/lemansultimate/` — reference implementation
- `pkg/dto/telemetry.go` — the target DTO structure
- `app/internal/core/core.go` — where to register

## Constraints

- All numeric telemetry values must use SI units
- The adapter's `Read()` method should block until a frame is ready
- `Connect()` and `Disconnect()` must be safe to call multiple times
