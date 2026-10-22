# Deployment: self-hosted server

The Sprint server is four containers: Postgres, InfluxDB, the API and the web
app. There are two ways to run them on a single Linux host:

- **[Komodo](#komodo) (prebuilt images):** `deploy/komodo/compose.yaml` pulls
  `ghcr.io/<owner>/sprint-api` and `sprint-web` (published by
  `.github/workflows/images.yml`, see [release](release.md#server-images)).
  Configured by environment only. This is the normal way.
- **[From a checkout](#3-host-get-the-stack-running):** the root
  `docker-compose.yml` builds both images from source.

Either can be published through Cloudflare Tunnel, so the host needs **no
public IP, no port forwarding, and no inbound firewall rule**. `cloudflared`
runs next to the stack and dials *out* to the Cloudflare edge; Cloudflare routes
requests for your hostnames back down that connection. This works behind NAT
and CGNAT/DS-Lite. A reverse proxy in front of the published ports works just as
well.

The desktop client is not deployed this way — it ships as a published binary
(see [release](release.md)). Users point it at `SPRINT_PUBLIC_API_URL`.

## Komodo

A UI-defined stack: no repository, no files on the host beyond two named
volumes.

1. **Images reachable.** GHCR creates the `sprint-api` and `sprint-web`
   packages private on their first publish. Either make both public (GitHub →
   Packages → package → Package settings → Change visibility) or add a GHCR
   registry account in Komodo (a token with `read:packages`) and select it on
   the stack.
2. **Discord application** (optional, for Discord sign-in): create one at
   <https://discord.com/developers/applications>, copy Client ID and Client
   Secret from *OAuth2*, and add the redirect
   `<SPRINT_PUBLIC_API_URL>/api/auth/discord/callback` exactly.
3. **Create the stack:** Komodo → Stacks → New Stack, pick the server, mode
   *UI Defined*. Paste `deploy/komodo/compose.yaml` into the compose editor and
   `deploy/komodo/stack.env.example` into *Environment*.
4. **Fill in the environment.** Replace every placeholder secret with its own
   `openssl rand -hex 32`; set `SPRINT_PUBLIC_WEB_URL` and
   `SPRINT_PUBLIC_API_URL` to the addresses browsers and the desktop app use;
   `SPRINT_VERSION` defaults to `unstable` (latest pre-release), because no
   stable release exists yet and `stable` would fail with `manifest unknown`.
   Switch to `stable` once a plain `vX.Y.Z` is tagged, or pin a release tag.
   Plain `http` on the LAN works: the web marks its session cookie `Secure`
   only when the browser arrived over https (read from `X-Forwarded-Proto`, so
   a TLS proxy in front must forward that header).
   For the tunnel, uncomment `COMPOSE_PROFILES=tunnel` and set
   `CLOUDFLARE_TUNNEL_TOKEN` (hostnames as in [step 2](#2-cloudflare-create-the-tunnel)).
5. **Deploy.** The first start initialises Postgres and InfluxDB from the
   environment and the API creates its schema. Every service reports healthy
   once it is serving. The first account registered becomes the admin.

`POSTGRES_*` and `INFLUXDB_*` are read only when their volume is first created.
Changing them later does not change the database; see
[troubleshooting](#troubleshooting).

**Updating:** with `SPRINT_VERSION=unstable` (or `stable`/`edge`), press
*Deploy* — Komodo pulls before it redeploys (*Auto Pull*, on by default). To
pin, change `SPRINT_VERSION` to the new tag and deploy. *Poll for Updates* /
*Auto Update* on the stack can do this unattended. Back up first (below); the
API upgrades its schema on start, so rolling back an image does not roll back
the database.

**Without Komodo:** the same two files work with plain Compose:
`docker compose -f compose.yaml --env-file stack.env up -d`.

## Prerequisites (tunnel and checkout)

- A Linux host that stays on, with ~4 GB RAM (Postgres + InfluxDB + API + web)
  and Docker Engine plus the Compose plugin installed.
- A Cloudflare account (Free plan is sufficient).
- A domain in that Cloudflare account. Registering it through Cloudflare
  Registrar puts the zone in your account automatically, so there are no
  nameservers to point anywhere.

## 1. Cloudflare: register the domain

1. Cloudflare dashboard → **Domain Registration** → **Register Domain**.
2. Register the domain in the same account you will use for the tunnel. The zone
   and its DNS are created for you — no nameserver change needed.

If the domain already exists elsewhere, add it as a zone instead and point its
nameservers at Cloudflare before continuing.

## 2. Cloudflare: create the tunnel

1. Open **Zero Trust** and complete onboarding if prompted. Pick the Free plan;
   it costs nothing.
2. **Networks → Tunnels → Create a tunnel → Cloudflared**.
3. Name it (for example `sprint-home`) and save.
4. Copy the **tunnel token** from the install snippet. It is the long string
   after `--token`. Treat it as a secret — it grants the ability to serve your
   hostnames.
5. Add the public hostnames. These map a hostname to a service *inside* the
   Compose network, so use Docker service names, not `localhost`:

   | Subdomain | Domain | Service | URL |
   | --- | --- | --- | --- |
   | `sprint` | `your-domain.tld` | HTTP | `web:3000` |
   | `api.sprint` | `your-domain.tld` | HTTP | `api:8080` |

   The matching DNS records are created automatically.

The `api` hostname is what the desktop client talks to, and what Discord
redirects back to after sign-in (`SPRINT_PUBLIC_API_URL`). The web app calls the
API only from its server (`API_URL`, pinned to `http://api:8080` in both
compose files).

Sign-in runs through Next.js Server Actions, which reject a request whose
`Origin` host differs from the host the server sees (`x-forwarded-host`, else
`Host`). The tunnel forwards the public hostname by default, so nothing is
needed. If you set an **HTTP Host Header** override on the hostname's origin
settings, sign-in fails until the public hostname (`sprint.your-domain.tld`) is
listed in `experimental.serverActions.allowedOrigins` in `web/next.config.ts`.

## 3. Host: get the stack running

```bash
git clone https://github.com/kratofl/sprint.git
cd sprint
cp .env.example .env
```

Edit `.env`. Two values from the template **must** change or the containers will
not find each other — `localhost` inside a container is that container itself:

```dotenv
# Reachable service names inside the Compose network, not localhost
DATABASE_URL=postgres://sprint:<db-password>@db:5432/sprint?sslmode=disable
INFLUXDB_URL=http://influxdb:8086

# Public URLs (Discord redirect, invite links, post-sign-in redirect)
SPRINT_PUBLIC_WEB_URL=https://sprint.your-domain.tld
SPRINT_PUBLIC_API_URL=https://api.sprint.your-domain.tld

# Long random secrets — do not ship the template values
JWT_SECRET=<48+ random chars>
POSTGRES_PASSWORD=<random>
INFLUXDB_TOKEN=<random>
INFLUXDB_PASSWORD=<random>

# Discord sign-in (optional, see Komodo step 2)
DISCORD_CLIENT_ID=<client id>
DISCORD_CLIENT_SECRET=<client secret>

# From step 2
CLOUDFLARE_TUNNEL_TOKEN=<tunnel token>
```

`API_URL` stays as it is — `docker-compose.yml` pins the web container to
`http://api:8080` directly.

Then bring everything up, including the tunnel:

```bash
docker compose --profile tunnel up -d --build
```

Without `--profile tunnel` the stack runs locally only; the tunnel service is
opt-in so local development is unaffected.

## 4. Verify

```bash
docker compose ps                      # all services healthy
docker compose logs -f tunnel          # expect "Registered tunnel connection"
curl -fsS https://api.sprint.your-domain.tld/api/health
```

Then open `https://sprint.your-domain.tld` in a browser.

## Operating notes

- **Restart behaviour:** every service is `restart: unless-stopped`, and Docker
  starts on boot on a default Ubuntu install, so the stack survives reboots.
- **Firewall:** nothing needs opening. Keep inbound closed except SSH.
- **Published ports:** the `ports:` entries in `docker-compose.yml` exist for
  local development. On a server they are unnecessary — the tunnel reaches every
  service over the Compose network — and you can drop them so Postgres (5432)
  and InfluxDB (8086) are not bound on the host at all. The Komodo stack never
  publishes them.
- **Access control:** Cloudflare Access can put a login in front of the web
  hostname. Never in front of the api hostname: the desktop app and Discord's
  sign-in callback cannot pass it.
- **Streaming:** WebSockets (live telemetry from the desktop) and server-sent
  events (live view on the web) pass through the tunnel. Cloudflare drops a
  connection that is idle for 100 s, so both keep themselves alive.

## Backups

Both stores keep their data in named Docker volumes (`postgres_data`,
`influxdb_data`, prefixed with the project or Komodo stack name) on the host.
Nothing about the tunnel backs them up.

```bash
# Postgres
docker compose exec -T db pg_dump -U sprint sprint | gzip > sprint-$(date +%F).sql.gz

# InfluxDB
docker compose exec influxdb influx backup /tmp/influx-backup -t "$INFLUXDB_TOKEN"
docker compose cp influxdb:/tmp/influx-backup ./influx-$(date +%F)
```

On a Komodo stack, run the same commands with `docker exec <stack>-db-1` and
`docker exec <stack>-influxdb-1` instead of `docker compose exec`. Put them in a
cron job (or a Komodo Procedure) and copy the output off the host.

## Updating a checkout

```bash
git pull
docker compose --profile tunnel up -d --build
```

The API applies its schema on startup (new tables and columns included — see
[the schema note](../internals/cloud-sync.md#server-schema-upgrades)), so no separate migration
step is needed.

## Troubleshooting

- **`Cannot find module '@sprint/types'` while building the web image:** a stale
  `tsconfig.tsbuildinfo` reached the build context. The `composite` packages then
  trust it, emit nothing, and leave `dist/` empty. `.dockerignore` excludes
  `**/*.tsbuildinfo` for exactly this reason — check it is still there.
- **API restarts with `28P01: password authentication failed`:**
  `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` disagree. They are
  two separate values in `.env` and must match (the Komodo stack derives
  `DATABASE_URL` from `POSTGRES_PASSWORD`, so there it cannot drift). Note that the Postgres volume
  keeps the password it was first initialised with, so changing `.env` alone is
  not enough — recreate the volume or alter the role.
- **`502` from Cloudflare:** the hostname points at a service the tunnel cannot
  reach. Check the Public Hostname target uses the Docker service name and port
  (`web:3000`, `api:8080`), not `localhost`.
- **API cannot reach the database:** `DATABASE_URL` or `INFLUXDB_URL` still
  points at `localhost`. See step 3. (The Komodo stack builds both itself.)
- **Komodo deploy fails with `denied` or `unauthorized` pulling `ghcr.io`:** the
  packages are still private. See [Komodo step 1](#komodo).
- **Discord says `Invalid OAuth2 redirect_uri`:** the redirect registered in the
  Discord application is not exactly `SPRINT_PUBLIC_API_URL` +
  `/api/auth/discord/callback` (scheme, host, no trailing slash).
- **Tunnel container restarts in a loop:** `CLOUDFLARE_TUNNEL_TOKEN` is empty or
  missing in `.env`. Compose deliberately does not hard-fail on it, so that
  runs without the `tunnel` profile keep working — an empty token only surfaces
  once cloudflared starts.
- **Tunnel logs `Provided Tunnel token is not valid`:** the token is truncated or
  belongs to a deleted tunnel. Copy it again from the dashboard.
