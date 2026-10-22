# Web App (`/web`)

Next.js frontend for the Sprint platform. All data comes from the .NET GraphQL
API server, called server-side only (server components and Server Actions); the
browser never talks to the API. TypeScript types for the API are generated from
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
│   ├── layout.tsx          ← Document root (html/body, globals.css)
│   ├── globals.css         ← @sprint/tokens/web.css + web component styles (Web App mockup)
│   ├── fonts/              ← Bundled Figtree (the non-Apple face of --font-sans)
│   ├── (app)/              ← Everything inside the app shell
│   │   ├── layout.tsx      ← Sidebar (with the signed-in user) + scrolling content
│   │   ├── page.tsx        ← Overview (loads data; Overview.tsx is the client view)
│   │   ├── sessions/       ← Session library (page.tsx loads, Sessions.tsx renders)
│   │   ├── setups/         ← Setup bank (page.tsx loads, Setups.tsx renders)
│   │   ├── engineer/       ← Race engineer portal
│   │   ├── dash/           ← Dash layout editor
│   │   └── settings/       ← Account, appearance (this browser) and server (admins only)
│   ├── sign-in/            ← Sign in / register, outside the shell
│   ├── sign-out/           ← Clears a session the API rejected
│   └── api/health/         ← Health check (calls the API's)
├── components/
│   ├── Sidebar.tsx         ← App navigation (collapsible) + account footer
│   ├── Page.tsx            ← Glass toolbar band + page body
│   ├── Backdrop.tsx        ← Glowing light trails (sign-in, behind the glass sidebar)
│   ├── Unavailable.tsx     ← Page body when the API cannot be reached
│   └── Card.tsx, Table.tsx, SearchField.tsx, MonthStepper.tsx, columns.tsx
├── lib/
│   ├── server/             ← Page loaders, Server Actions, the server-side API call
│   ├── api/, auth/         ← GraphQL request + session/route decisions (tested)
│   ├── records.ts          ← Types the pages hand to client views
│   ├── preferences.ts      ← Theme / motion / glass cookie → <html> attributes (tested)
│   ├── settings.ts         ← Settings field rules and save results (tested)
│   ├── overview.ts, period.ts, search.ts, navigation.ts  ← Pure view logic (tested)
│   └── gql/                ← GraphQL operations + codegen output
├── proxy.ts                ← Route guard: no live session → /sign-in?next=…
├── schema.graphql          ← Committed API schema (source for codegen)
├── codegen.ts              ← graphql-codegen config
├── next.config.ts          ← Standalone output (no rewrites)
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

## Sign-in

`/sign-in` posts to a Server Action that calls the API's `login`/`register` and
stores the JWT in the httpOnly `sprint_session` cookie; client JS never sees it.
`proxy.ts` sends requests without a live cookie to `/sign-in?next=…`, and a token
the API rejects goes through `/sign-out`, which clears the cookie.

## Appearance

Theme, motion and glass are per browser, in the plain `sprint_prefs` cookie
(`lib/preferences.ts`). The settings page writes it and applies changes live; the
root layout renders `<html>` with `data-theme` and the `--motion` / `--chrome-*`
custom properties from it, so the first paint is already right. Every animation
derives its duration from `--motion` (0 = off; `prefers-reduced-motion` forces 0)
and is finite and triggered — nothing loops.

## Environment

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `http://localhost:8080` | .NET GraphQL API server URL |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL of this app |
