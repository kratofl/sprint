---
description: 'Wails desktop app conventions for this project. Canonical guidance lives in docs/agents/wails.md.'
applyTo: 'app/**/*.go'
---

# Wails Desktop App Conventions

Use `docs/agents/wails.md` as the canonical guide. Key rules:

- Keep `App` bindings thin and put business logic in `app/internal/`.
- Start event-emitting subsystems in `DomReady`, not `Startup`.
- Treat `internal/core/` as wiring and lifecycle orchestration, not business logic.
- Use Wails runtime events for Go-to-frontend communication.
- Keep desktop-specific details in the Wails layer and shared logic elsewhere.
