# API Server (`/api`)

.NET 10 (ASP.NET Core) **GraphQL** server — the backend for the Sprint platform.
Migrated from the original Go HTTP/WebSocket service. Built with
[HotChocolate](https://chillicream.com/docs/hotchocolate).

## Responsibilities

- GraphQL API (`/graphql`) for auth, sessions, setups, dash layouts, shared laps and
  race engineers
- Discord sign-in (`/api/auth/discord/start`, `/api/auth/discord/callback`) for the web
  and the desktop
- Live telemetry: WebSocket ingest from the desktop (`/api/live/ingest`) and an SSE
  stream per live session for viewers (`/api/live/sessions/{sessionKey}/stream`)
- Persistence: **Postgres** for relational data (users, sessions, setups, layouts,
  engineer links) and **InfluxDB** for live telemetry history
- A REST liveness shim at `GET /api/health` (for the docker healthcheck and the web
  app's health route)

## Structure

```
api/
├── Sprint.Api/                ← ASP.NET Core + HotChocolate server
│   ├── Program.cs             ← composition root (auth, DI, GraphQL, endpoints)
│   ├── Auth/                  ← JWT, bcrypt, Discord sign-in + tickets
│   ├── Data/                  ← EF Core entities + SprintDbContext (Postgres)
│   ├── Live/                  ← live hub, ingest socket, SSE stream
│   ├── Telemetry/             ← ITelemetryStore + InfluxDB implementation
│   ├── Services/              ← users, catalog, lap sharing, race engineers
│   └── GraphQL/               ← Query / Mutation
├── Sprint.Api.Tests/          ← xunit tests
└── Sprint.Api.slnx            ← solution (server + tests + shared contracts)
```

The shared data contracts live in **`app/Sprint.Contracts`** (which references
`app/Sprint.Desktop.Api` for `TelemetryFrame`, which `LiveSample.FromFrame` maps). The same
package is referenced by the desktop client, so the server and desktop app transfer
data using one DTO vocabulary.

## Running

```powershell
# Local dev (hot reload). Starts the compose Postgres first (needs Docker running);
# InfluxDB is optional locally (telemetry writes are a no-op when INFLUXDB_URL is unset).
# Runs as Development (Properties/launchSettings.json), which seeds the local sign-in
# admin@sprint.local / admin (Services/DevSeeder.cs). The container never seeds.
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

- **Anonymous:** `health`, `serverSettings`, `engineerInvite`; `register`, `login`,
  `redeemSignInTicket`
- **Account and data:** `me`, `sessions`/`session`, `setups`/`setup`,
  `layouts`/`layout`, `sharedLap`, `mySharedLaps`; `setDisplayName`, `changePassword`,
  `updateServerSettings`, `createSession`, `saveSession`, `saveSetup`, `saveLayout`,
  `shareLap`, `revokeSharedLap`
- **Race engineers:** `myEngineerInvites`, `myEngineers`, `myDrivers`,
  `visibleSessions`/`visibleSession`, `liveSessions`, `sessionTelemetry`;
  `createEngineerInvite`, `revokeEngineerInvite`, `acceptEngineerInvite`,
  `removeEngineer`, `leaveDriver`, `excludeEngineerFromSession`,
  `includeEngineerInSession`

The committed schema is `web/schema.graphql`; regenerate it with `make schema`. Why the
sign-in, live and engineer pieces are shaped as they are:
[`docs/internals/live-telemetry.md`](../docs/internals/live-telemetry.md).

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
| `DISCORD_CLIENT_ID` | — | Discord application id; Discord sign-in is on when this and the secret are set |
| `DISCORD_CLIENT_SECRET` | — | Discord application secret |
| `SPRINT_PUBLIC_API_URL` | request origin | Public base URL of this API; the Discord redirect URI is `<this>/api/auth/discord/callback` |
| `SPRINT_PUBLIC_WEB_URL` | — | Public base URL of the web app; invite links and the web's post-sign-in page. Required for web Discord sign-in |
