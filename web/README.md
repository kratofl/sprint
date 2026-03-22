# Web App (`/web`)

Next.js 15 frontend for the Sprint platform. Pure client — all data comes from the Go API server.

## Responsibilities

- Telemetry analysis and session history
- Dash layout editor (syncs with desktop app via API)
- Setup management
- Race Engineer portal (live telemetry + commands via WebSocket)
- Multi-user session sharing

## Structure

```
web/
├── app/
│   ├── layout.tsx          ← Root layout with Nav
│   ├── page.tsx            ← Dashboard
│   ├── sessions/           ← Session history + analysis
│   ├── engineer/           ← Race engineer portal
│   ├── setups/             ← Setup management
│   ├── dash/               ← Dash layout editor
│   └── api/health/         ← Health check (proxies to Go API)
├── components/
│   └── nav.tsx             ← Top navigation
├── lib/
│   └── utils.ts            ← Re-exports from @sprint/ui
├── next.config.ts          ← Rewrites /api/* → Go API server
├── tailwind.config.ts      ← Imports tokens from @sprint/tokens
└── package.json            ← @sprint/web
```

## Running

```bash
# Development
make dev-web

# Production build
make build-web

# Docker
docker compose up web
```

## API Proxy

All `/api/*` requests are rewritten to the Go API server via `next.config.ts`:

```
/api/* → ${API_URL:-http://localhost:8080}/api/*
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `http://localhost:8080` | Go API server URL |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL of this app |
