# Web App (`/web`)

Next.js frontend for the Sprint platform. Pure client — all data comes from the
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
│   ├── layout.tsx          ← App shell: sidebar + scrolling content
│   ├── globals.css         ← @sprint/tokens/web.css + web component styles (Web App mockup)
│   ├── fonts/              ← Bundled Figtree (the non-Apple face of --font-sans)
│   ├── page.tsx            ← Overview (Overview.tsx is the client view)
│   ├── sessions/           ← Session library
│   ├── engineer/           ← Race engineer portal
│   ├── setups/             ← Setup bank
│   ├── dash/               ← Dash layout editor
│   └── api/health/         ← Health check (proxies to the API)
├── components/
│   ├── Sidebar.tsx         ← App navigation (collapsible)
│   ├── Page.tsx            ← Frosted toolbar band + page body
│   └── Card.tsx, Table.tsx, SearchField.tsx, MonthStepper.tsx, columns.tsx
├── lib/
│   ├── data.ts             ← Sessions/setups the pages render (empty until GraphQL is wired)
│   ├── overview.ts, period.ts, search.ts, navigation.ts  ← Pure view logic (tested)
│   └── gql/                ← GraphQL operations + codegen output (generated.ts)
├── schema.graphql          ← Committed API schema (source for codegen)
├── codegen.ts              ← graphql-codegen config
├── next.config.ts          ← Rewrites /api/* and /graphql → API server
└── package.json            ← @sprint/web
```

The UI follows the Web App mockup and `docs/design/DESIGN.md`.
Use only the custom properties from `@sprint/tokens/web.css`; no hex values in
`app/` or `components/`. Tests: `pnpm --filter @sprint/web test`.

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
