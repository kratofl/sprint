# API Server (`/api`)

.NET 10 (ASP.NET Core) **GraphQL** server — the backend for the Sprint platform.
Migrated from the original Go HTTP/WebSocket service. Built with
[HotChocolate](https://chillicream.com/docs/hotchocolate).

## Responsibilities

- GraphQL API (`/graphql`) for auth, telemetry sessions, setups, and dash layouts
- GraphQL **subscriptions** for the remote race-engineer relay (replaces the old
  WebSocket relay)
- Persistence: **Postgres** for relational data (users, invite codes, sessions,
  setups, layouts) and **InfluxDB** for time-series telemetry
- A REST liveness shim at `GET /api/health` (for the docker healthcheck and the web
  app's health route)

## Structure

```
api/
├── Sprint.Api/                ← ASP.NET Core + HotChocolate server
│   ├── Program.cs             ← composition root (auth, DI, GraphQL, health)
│   ├── Auth/                  ← JWT issue/validate + bcrypt password hashing
│   ├── Data/                  ← EF Core entities + SprintDbContext (Postgres)
│   ├── Telemetry/             ← ITelemetryStore + InfluxDB implementation
│   ├── Services/              ← users, invite codes, session/setup/layout catalog
│   └── GraphQL/               ← Query / Mutation / Subscription + relay
├── Sprint.Api.Tests/          ← xunit tests
└── Sprint.Api.slnx            ← solution (server + tests + shared contracts)
```

The shared data contracts live in **`app/Sprint.Contracts`** (which references
`app/Sprint.Desktop.Api` for `TelemetryFrame` / the engineer contract). The same
package is referenced by the desktop client, so the server and desktop app transfer
data using one DTO vocabulary.

## Running

```powershell
# Local dev (hot reload). Needs Postgres reachable via DATABASE_URL; InfluxDB is
# optional locally (telemetry writes are a no-op when INFLUXDB_URL is unset).
make dev-api

# Publish
make build-api          # → api/build/bin

# Tests
make test-api

# Whole stack (Postgres + InfluxDB + api + web)
docker compose up
```

Open the GraphQL IDE (Nitro) at <http://localhost:8080/graphql>.

## GraphQL surface

- **Queries:** `health`, `me`, `sessions`/`session`, `setups`/`setup`,
  `layouts`/`layout`, `recentTelemetry`
- **Mutations:** `register`, `login` (anonymous); `createInviteCode`, `joinAsDriver`,
  `createSession`, `saveSetup`, `saveLayout`, `publishEngineerEvent`,
  `sendEngineerCommand` (authenticated)
- **Subscriptions:** `engineerEvents`, `engineerCommands` (authenticated via a token
  argument + invite code)

The committed schema is `web/schema.graphql`; regenerate it with `make schema`.

## Environment

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `JWT_SECRET` | insecure dev default | HS256 signing key (set in production) |
| `DATABASE_URL` | `postgres://…localhost:5432/sprint` | Postgres connection (libpq URL or Npgsql keywords) |
| `INFLUXDB_URL` | — | InfluxDB base URL; when unset, telemetry persistence is disabled |
| `INFLUXDB_TOKEN` | — | InfluxDB API token |
| `INFLUXDB_ORG` | `sprint` | InfluxDB org |
| `INFLUXDB_BUCKET` | `telemetry` | InfluxDB bucket |
