## New Game Adapter Prompt

Use this prompt when adding support for a new telemetry source.

### Checklist

- Create the adapter under `pkg/games/<game>/`.
- Implement the `GameAdapter` interface from `pkg/games`.
- Map raw game data into `pkg/dto.TelemetryFrame`.
- Keep units in SI.
- Register the adapter in `app/internal/core/`.
- Check downstream assumptions in delta tracking, screen rendering, and frontend events.
- Update `packages/types` only if shared DTOs changed.
