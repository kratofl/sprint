# Web App (`/web`)

Next.js frontend for the Sprint platform. All data comes from the .NET GraphQL
API server, called server-side only (server components and Server Actions); the
browser never talks to the API. TypeScript types for the API are generated from
`web/schema.graphql` via graphql-codegen (`pnpm --filter @sprint/web codegen`).

## Responsibilities

- Telemetry analysis and session history
- Dash layout editor (syncs with desktop app via API)
- Setup management
- Race engineers: invite links, per-session access, live view of a driver's session
- Discord sign-in (primary when the server has it on), email and password as fallback

## Structure

```
web/
├── app/
│   ├── layout.tsx          ← Document root (html/body, globals.css)
│   ├── globals.css         ← Tailwind: @sprint/tokens/web.css mapped to utilities, type + radius scales
│   ├── fonts/              ← Bundled Figtree (the non-Apple face of --font-sans)
│   ├── (app)/              ← Everything inside the app shell
│   │   ├── layout.tsx      ← AppShell: sidebar, toolbar band, toasts over the ambient backdrop
│   │   ├── page.tsx        ← Overview (loads data; Overview.tsx is the client view)
│   │   ├── sessions/       ← Session library; [id]/ session detail, [id]/live/ live view
│   │   ├── setups/         ← Setup bank (page.tsx loads, Setups.tsx renders)
│   │   ├── engineer/       ← Race engineers: your engineers, invite links, drivers you engineer for
│   │   ├── dash/           ← Dash layout editor
│   │   └── settings/       ← Account, appearance (this browser) and server (admins only)
│   ├── sign-in/            ← Sign in / register, outside the shell (own frozen sign-in.css)
│   ├── sign-out/           ← Clears a session the API rejected
│   ├── auth/discord/       ← Sends the browser to the API's Discord sign-in
│   ├── auth/complete/      ← Redeems the API's sign-in ticket, sets the session cookie
│   ├── engineer/invite/    ← Invite link landing page (public, outside the shell)
│   ├── api/live/           ← Bridges the API's live SSE stream with the session cookie
│   └── api/health/         ← Health check (calls the API's)
├── components/
│   ├── ui/                 ← shadcn/ui primitives (Radix): button, input, select, sheet, chart, …
│   ├── app/                ← Shared patterns: app shell, sidebar, toolbar + PageHeader, toast,
│   │                         sheets, metrics, DataTable, charts, empty/error states
│   ├── Backdrop.tsx        ← Glowing light trails (sign-in, behind the shell glass)
│   └── Brand.tsx, columns.tsx
├── lib/
│   ├── server/             ← Page loaders, Server Actions, the server-side API call
│   ├── api/, auth/         ← GraphQL request + session/route decisions (tested)
│   ├── records.ts          ← Types the pages hand to client views
│   ├── preferences.ts      ← Theme / motion / glass cookie → <html> attributes (tested)
│   ├── settings.ts         ← Settings field rules and save results (tested)
│   ├── live.ts             ← Live view: SSE event parsing and its state reducer (tested)
│   ├── engineers.ts, laps.ts, telemetry.ts  ← Engineer access wording, laps, chart points (tested)
│   ├── overview.ts, period.ts, search.ts, navigation.ts  ← Pure view logic (tested)
│   └── gql/                ← GraphQL operations + codegen output
├── proxy.ts                ← Route guard: no live session → /sign-in?next=…
├── schema.graphql          ← Committed API schema (source for codegen)
├── codegen.ts              ← graphql-codegen config
├── next.config.ts          ← Standalone output (no rewrites)
└── package.json            ← @sprint/web
```

The UI follows `docs/design/DESIGN.md` → Web app. Build pages from
`components/ui` and `components/app`; colours come only from the Tailwind utilities
mapped to `@sprint/tokens/web.css` (no hex in `app/`, `components/` or `lib/`;
`app/styleContract.test.ts` checks it). Tests: `pnpm --filter @sprint/web test`.

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

"Continue with Discord" links to `/auth/discord`, which redirects to the API's
`/api/auth/discord/start`. After Discord, the API sends the browser to
`/auth/complete?ticket=…`; that route handler redeems the single-use ticket with
`redeemSignInTicket` server-side and sets the same cookie. The JWT never appears in
a URL. `/auth/discord` also sets a flow id cookie and passes the id through the API
inside `next`; `/auth/complete` redeems only when they match, so a ticket started
in another browser cannot sign this one in. Errors come back as
`/sign-in?error=<code>`, and the page shows fixed text per code (`lib/auth/discord.ts`).

## Appearance

Theme, motion and glass are per browser, in the plain `sprint_prefs` cookie
(`lib/preferences.ts`). The settings page writes it and applies changes live; the
root layout renders `<html>` with `data-theme` and the `--motion` / `--chrome-*`
custom properties from it, so the first paint is already right; Tailwind's `dark:`
variant follows the same attribute (or the OS while the theme is System). Every
animation derives its duration from `--motion` (0 = off; `prefers-reduced-motion`
forces 0) and is finite and triggered — nothing loops.

## Environment

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `http://localhost:8080` | The API as this server reaches it (internal) |
| `SPRINT_PUBLIC_API_URL` | — | The API as browsers reach it; Discord sign-in redirects there |

Both are read per request on the server, never at build time, so one image serves
any deployment. There are no `NEXT_PUBLIC_*` variables. Invite links come absolute
from the API (its `SPRINT_PUBLIC_WEB_URL`), so the web needs no URL of its own.

The session cookie is `Secure` only when the browser reached the web over https
(the proxy's `X-Forwarded-Proto`, else the request itself), so plain http on a
LAN address signs in too; a TLS proxy in front must forward that header.
