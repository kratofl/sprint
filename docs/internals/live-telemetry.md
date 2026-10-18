# Discord sign-in, live telemetry and race engineers

How the API signs people in with Discord, takes the desktop's live stream, and decides which race
engineer sees what. Code: `api/Sprint.Api/Auth/Discord/`, `api/Sprint.Api/Live/`,
`api/Sprint.Api/Services/EngineerService.cs`. Wire shapes: `app/Sprint.Contracts/Live.cs` and
`Engineer.cs`.

## Discord sign-in ends in a ticket, never a token in a URL

- One flow serves the web and the desktop: `/api/auth/discord/start` → Discord →
  `/api/auth/discord/callback`, which redirects to the caller with a single-use `ticket` (60 s).
  The caller trades it for a JWT with `redeemSignInTicket`. A JWT in a redirect URL would land in
  browser history and proxy logs.
- The desktop's redirect must be plain `http` to `127.0.0.1`, `localhost` or `[::1]`, any port. The
  desktop also passes its own `state` nonce, echoed back, so its listener can reject a callback it did
  not start. The web's `next` must be a path on the web app; `//host` and `/\host` are refused.
- The OAuth `state` lives in server memory and in a cookie set on `/start`; the callback needs both.
  Without the cookie, a callback URL somebody else started would sign this browser in as them. The
  cookie must be set on the callback's host, so a `/start` on any other origin (a desktop that found
  the server on the LAN, an IP address) first redirects once to the same `/start` on
  `SPRINT_PUBLIC_API_URL`; a `hopped` marker stops a proxy that hides the real host from looping it.
- The web binds the second leg too: `/auth/discord` sets an httpOnly `sprint_signin_flow` cookie and
  passes its id inside `next` (`/?flow=<id>&next=<path>`); `/auth/complete` redeems the ticket only
  when they match. Otherwise a ticket minted for an attacker could sign a victim's browser in as the
  attacker (login CSRF).
- Pending states and tickets are in memory. A restart only means "sign in again". Running more than
  one API replica would need them in Postgres.
- Discord's redirect URI is `${SPRINT_PUBLIC_API_URL}/api/auth/discord/callback` and must be
  registered in the Discord application exactly. Without `SPRINT_PUBLIC_API_URL` the API uses the
  request's own origin, which is wrong behind a reverse proxy.
- Sprint asks Discord for `identify` only, never `email`: drivers are known by name, and the consent
  screen asks for less. A Discord account therefore has no email and no password, and signs in
  through Discord only; `changePassword` sets a first password only when there is an email to sign
  in with.
- Account matching: the linked `DiscordId`; else a new account, if registration is open (the first
  account on a server is its admin either way). A password account is never linked by email; the
  same person signing in through Discord gets a second, separate account.
- Emails are stored trimmed and lower-cased and compared case-insensitively, so `Ada@x.gg` and
  `ada@x.gg` cannot become two accounts.

## Session key

- A session's identity across the server is the desktop's own session id, `SessionKey`. The live
  stream, the InfluxDB tag `session_key`, the synced session row and engineer exclusions all join on
  `(driver, SessionKey)`. Keys come from clients, so only the pair is unique.
- The first live `start` creates the session row, so a streamed session is listed and its history is
  reachable before the desktop's next sync (every 10 minutes). The sync's `saveSession` then finds the
  row by key and fills in the laps. Desktops that predate `SaveSessionInput.sessionKey` still join up:
  the API reads the payload's `id`.
- A key never changes once set. Rows from before keys existed are keyed by their own server id, so an
  exclusion made on one cannot be orphaned by a later upload.

## Live stream

- Ingest is a WebSocket (`/api/live/ingest`) because the desktop sends continuously. Viewing is SSE
  (`/api/live/sessions/{sessionKey}/stream`): one-way, it passes through the web's Next route handler
  as a plain response (the browser never holds the JWT), and `EventSource` reconnects on its own.
- The web's bridge (`web/app/api/live/[sessionKey]/route.ts`) always answers 200: an `EventSource`
  cannot read HTTP statuses, so the API's 404/403/401 or an unreachable API become one `unavailable`
  event the view can word. The view closes the stream on everything final; only a server error is
  left to the browser's retry. Its states live in `web/lib/live.ts`.
- The hub is in memory, one entry per `(driver, SessionKey)`. It never blocks the sender: a viewer that falls behind
  loses its oldest unread events. The desktop drops samples while disconnected rather than queueing,
  so live means now, not "eventually".
- A dropped desktop connection leaves the session live but `connected: false` for 30 s; a `start` with
  the same key resumes it and viewers stay on. Only an explicit `end` or the grace running out sends
  `ended`.
- The SSE URL has only the key, so the endpoint picks the viewer's own live session under it, else one
  of a driver they engineer for. Another account streaming under a copied key (an engineer sees the
  driver's keys) gets its own entry: it can neither block the driver from resuming nor reach the
  driver's other engineers.
- Ingest is bounded per connection: 100 samples a message, and on average 40 a second (twice the
  desktop's rate) with a burst of 600 for the desktop's buffered flush; faster closes the socket. A
  live session keeps its last 1000 laps and its last 30 s of samples (by sample timestamp, at most
  600 — the desktop's 20/s) for new viewers' snapshots, so a late viewer's rolling trace starts full.
- Laps are detected on the server, when a sample's `lastLapTime` changes; the first sample only primes
  the detector. They go out as SSE `lap` events and to InfluxDB as `live_lap`.

## Engineer access

- One rule, `ViewerGrants.CanView`: the driver sees their own sessions; a linked engineer sees all of
  the driver's sessions, live and past, except the ones the driver excluded them from. Every surface —
  lists, `sessionTelemetry`, the live stream — goes through it.
- Taking access away is immediate. Excluding an engineer from a session, removing an engineer and an
  engineer leaving all write the database first, then close that engineer's affected live streams with
  `revoked`. The SSE endpoint subscribes before its final access check, so a revoke racing a connect
  still reaches the new stream.
- Exclusions outlive the link. A driver who hid a session, removed the engineer and invited them again
  still expects that session hidden.
- Invite links are single-use (the accept races on a concurrency token), valid for 7 days and
  revocable while unused. Accepting a link of a driver one already engineers for does not use it up.
- The old per-session invite-code relay (GraphQL subscriptions) is gone. Engineer → driver commands
  are not part of this model; `app/Sprint.Desktop.Api/Engineer` still describes them for the desktop.

## InfluxDB

- Measurements `live_sample` (one point per `LiveSample`, fields named as its JSON properties) and
  `live_lap` (`lap`, `lapTime`, `valid`), tags `driver_id` and `session_key`, millisecond precision.
- Writes go through the client's batching write API: the ingest socket never waits on Influx, and a
  refused batch is logged and dropped.
- `sessionTelemetry` downsamples on the server with `aggregateWindow(fn: last)` to a bounded number of
  points. `last`, not `mean`: every value is one the car really had (no gear 3.5), and it works for the
  boolean `lapValid`.
- Without `INFLUXDB_URL` live viewing still works; history is empty.
