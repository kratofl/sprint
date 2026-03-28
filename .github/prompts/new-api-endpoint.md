---
description: 'Scaffold a new API endpoint in the Go API server'
mode: 'agent'
---

# New API Endpoint

I need to add a new endpoint to the Go API server (`/api`).

## Conventions to follow

1. **Handler**: Create or extend a handler in `api/internal/handler/`
2. **Route wiring**: Register the route in `api/internal/server/`
3. **Database**: All SQL goes in `api/internal/store/` — no SQL outside this package
4. **DTOs**: Use shared types from `pkg/dto/` for request/response bodies
5. **Auth**: Use middleware from `api/internal/auth/` if the endpoint requires authentication
6. **Error handling**: Return appropriate HTTP status codes with JSON error bodies
7. **Validation**: Validate input data early and fail fast

## Reference files

- `api/internal/server/` — route registration pattern
- `api/internal/handler/` — existing handlers for reference
- `api/internal/store/` — database layer pattern
- `api/internal/auth/` — authentication middleware
- `pkg/dto/` — shared DTO types

## Important notes

- The API server uses `net/http` standard library (no framework)
- Keep handlers thin — business logic belongs in dedicated packages
- Update the API documentation if applicable
