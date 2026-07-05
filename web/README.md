# Web App (`/web`)

Next.js 15 frontend for the Sprint platform. Pure client — all data comes from the
.NET GraphQL API server. TypeScript types for the API are generated from
`web/schema.graphql` via graphql-codegen (`pnpm --filter @sprint/web codegen`).

## Responsibilities

- Telemetry analysis and session history
- Dash layout editor (syncs with desktop app via API)
- Setup management
- Race Engineer portal (live telemetry + commands via GraphQL subscriptions)
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
│   └── api/health/         ← Health check (proxies to the API)
├── components/
│   └── nav.tsx             ← Top navigation
├── lib/
│   ├── utils.ts            ← Re-exports from @sprint/ui
│   └── gql/                ← GraphQL operations + codegen output (generated.ts)
├── schema.graphql          ← Committed API schema (source for codegen)
├── codegen.ts              ← graphql-codegen config
├── next.config.ts          ← Rewrites /api/* and /graphql → API server
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

`/api/*` (REST health) and `/graphql` requests are rewritten to the API server via
`next.config.ts`:

```
/api/*   → ${API_URL:-http://localhost:8080}/api/*
/graphql → ${API_URL:-http://localhost:8080}/graphql
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `http://localhost:8080` | .NET GraphQL API server URL |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL of this app |
