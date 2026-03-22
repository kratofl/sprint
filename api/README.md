# API Server (`/api`)

Go HTTP/WebSocket server that provides the backend for the Sprint platform.

## Responsibilities

- REST API for telemetry sessions, setups, dash layouts, and user auth
- WebSocket relay for remote race engineer connections
- Database persistence (Postgres)

## Structure

```
api/
├── main.go                 ← Entry point with graceful shutdown
└── internal/
    ├── server/             ← HTTP server setup + route wiring
    ├── handler/            ← REST route handlers
    ├── relay/              ← WebSocket relay hub (remote engineers)
    ├── store/              ← Database layer
    └── auth/               ← Authentication middleware
```

## Running

```bash
# Local dev
make dev-api

# Build binary
make build-api

# Docker
docker compose up api
```

## API Routes

All routes are defined in `internal/server/server.go`:

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET/POST | `/api/sessions` | List / create sessions |
| GET | `/api/sessions/:id` | Get session by ID |
| GET/PUT | `/api/setups` | List / save setups |
| GET/PUT | `/api/layouts` | List / save dash layouts |
| GET | `/api/engineer/ws` | WebSocket relay for engineers |

## Environment

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `DATABASE_URL` | — | Postgres connection string |
