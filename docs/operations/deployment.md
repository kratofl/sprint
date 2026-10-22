# Deployment: self-hosted host behind Cloudflare Tunnel

This is the reference deployment for the Sprint API and web app: the full
`docker-compose.yml` stack (Postgres, InfluxDB, API, web) on a single Linux host,
published through Cloudflare Tunnel.

The host needs **no public IP, no port forwarding, and no inbound firewall
rule**. `cloudflared` runs next to the stack and dials *out* to the Cloudflare
edge; Cloudflare routes requests for your hostnames back down that connection.
This works behind NAT and CGNAT/DS-Lite.

The desktop client is not deployed this way — it ships as a published binary
(see [release](release.md)).

## Prerequisites

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

The `api` hostname is what the desktop client talks to. The browser does not
need it: the web app calls the API only from its server (`API_URL`, pinned to
`http://api:8080` in `docker-compose.yml`), so it works over the `sprint`
hostname alone.

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

# Public URL of the web app
NEXT_PUBLIC_APP_URL=https://sprint.your-domain.tld

# Long random secrets — do not ship the template values
JWT_SECRET=<48+ random chars>
POSTGRES_PASSWORD=<random>
INFLUXDB_TOKEN=<random>
INFLUXDB_PASSWORD=<random>

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
  and InfluxDB (8086) are not bound on the host at all.
- **Access control:** Cloudflare Access can put a login in front of a hostname.
  Useful to keep the web app private while it is still in development, without
  building auth for it first.
- **WebSockets** pass through the tunnel, so GraphQL subscriptions work.

## Backups

Both stores keep their data in named Docker volumes (`postgres_data`,
`influxdb_data`) on the host. Nothing about the tunnel backs them up.

```bash
# Postgres
docker compose exec -T db pg_dump -U sprint sprint | gzip > sprint-$(date +%F).sql.gz

# InfluxDB
docker compose exec influxdb influx backup /tmp/influx-backup -t "$INFLUXDB_TOKEN"
docker compose cp influxdb:/tmp/influx-backup ./influx-$(date +%F)
```

Put both in a cron job and copy the output off the host.

## Updating

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
  two separate values in `.env` and must match. Note that the Postgres volume
  keeps the password it was first initialised with, so changing `.env` alone is
  not enough — recreate the volume or alter the role.
- **`502` from Cloudflare:** the hostname points at a service the tunnel cannot
  reach. Check the Public Hostname target uses the Docker service name and port
  (`web:3000`, `api:8080`), not `localhost`.
- **API cannot reach the database:** `DATABASE_URL` or `INFLUXDB_URL` still
  points at `localhost`. See step 3.
- **Tunnel container restarts in a loop:** `CLOUDFLARE_TUNNEL_TOKEN` is empty or
  missing in `.env`. Compose deliberately does not hard-fail on it, so that
  runs without the `tunnel` profile keep working — an empty token only surfaces
  once cloudflared starts.
- **Tunnel logs `Provided Tunnel token is not valid`:** the token is truncated or
  belongs to a deleted tunnel. Copy it again from the dashboard.
