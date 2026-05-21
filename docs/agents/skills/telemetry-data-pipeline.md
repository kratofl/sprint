## Telemetry Data Pipeline Skill

Use when changing game adapters, telemetry DTOs, or downstream consumers of live telemetry.

### Data Flow

`GameAdapter.Read()` -> `dto.TelemetryFrame` -> coordinator -> screen rendering, delta tracking,
frontend events, and engineer flows.

### Rules

- Adapters live in `pkg/games/<game>/`.
- The shared DTO lives in `pkg/dto`.
- Use SI units.
- Register new adapters in `app/internal/core/`.
- Treat the desktop app as authoritative for live session state and engineer commands.

### Check When Changing This Area

- `pkg/games/adapter.go`
- `pkg/dto/telemetry.go`
- `app/internal/core/`
- `app/internal/delta/`
- frontend consumers and engineer protocol code
