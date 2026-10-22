# Sprint web: setup, sync and the server schema

How the desktop connects to a Sprint server (self-hosted or official) and moves data. The
setup flow is `app/desktop/src/onboarding/flow.ts`. The sync is
`app/Sprint.Desktop.Core/Features/Sharing/CloudSync.cs`.

## Setup

- All of Sprint web on the desktop sits behind one feature flag, `Sprint:Features:SprintWeb` in
  `app/Sprint.Desktop.Host/appsettings.json`, shipped `false` until the server side is ready. Off,
  the host starts neither the sync nor the live uplink, so a sign-in left over from an earlier build
  sends nothing, and the renderer hides the setup, the account row and the Settings group. The live
  link to an engineer ([live-link.md](live-link.md)) needs no server and is not behind it.
- First launch opens the setup once. `AppSettings.Cloud.SetupDone` records the answer, including
  "only this PC". A host that sends no `cloud` state reads as set up, so an older host never
  traps the UI in the setup.
- The official server's address ships in `app/Sprint.Desktop.Host/appsettings.json`
  (`Sprint:OfficialServerUrl`). While it is empty the option shows "Coming soon".
- Discovery is a plain HTTP sweep, with no mDNS or broadcast. It probes localhost and each
  private IPv4 /24 the machine sits on, port 8080, `GET /api/health`. It accepts only
  `service == "sprint-api"`. The check reads the raw JSON field, not the `HealthStatus` DTO,
  whose default would make any `{"status":"ok"}` look like Sprint.

## Sync rules

- What syncs: recorded sessions (lap history), the driver's own setups (never templates) and
  dashes. Lap traces do not sync; they are too large for the GraphQL path.
- The ledger (`cloud-sync.json`) stores, per `server|email`, each item's remote id and the
  content hash last seen on both sides. Switching account or server starts a fresh ledger
  rather than mixing ids. A Discord account can have no email; it is keyed `server|id:<user id>`
  instead. Accounts with an email keep the old key, because a new key forgets every remote id and
  re-uploads setups and dashes as duplicates.
- Upload sends only items whose hash changed since the last sync. Download takes items missing
  here, or changed only remotely. If both sides changed an item, this PC wins and the item is
  counted as a conflict. There is no merge.
- A dash's "default" flag belongs to the PC: it is stripped on upload and kept as it was on
  download.
- "Web only" (`Remote`) deletes a session here only after the server confirmed that exact
  content, and only once the session has ended. Setups and dashes always stay local, because
  driving needs them. A downloaded session is removed again by the next upload. That is what
  "web only" means, not a bug.
- With `Both` or `Remote`, the host uploads every 10 minutes while signed in
  (`CloudSyncRunner`). Only one sync runs at a time.
- A session uploads with its desktop session id as `sessionKey`. The server may already hold that
  session, created by its live stream; the upload fills it in rather than adding a second one. See
  [live-telemetry.md](live-telemetry.md#session-key).
- Pull skips server sessions whose payload has no `id`: a session the live stream created and no sync
  has filled in yet has nothing to write locally.

## Discord sign-in on the desktop

- The browser leg returns to the native host's own loopback server, `GET /auth/discord/callback`
  (`DiscordCallbackPage.Path`). It is the one host route without the bearer token, because a browser
  cannot carry it. `DiscordSignIn` guards it instead: a fresh nonce per attempt as the `state`,
  compared in constant time, taken once. A new attempt, Cancel, the 5-minute timeout, or leaving the
  setup step retires it.
- Electron, not the host, opens the system browser (`shell.openExternal`): the host is headless and
  has no portable way to. The renderer sees one call that resolves when the sign-in ended.
- The callback page is served before the ticket is redeemed, so it says "return to Sprint", never
  "signed in". The result shows in the app.
- The sign-in step asks the server's public `serverSettings` whether to offer Discord, and waits
  1.5 s at most before showing the email form alone.

## Live uplink

`LiveUplink` (Core) streams the session being driven; see [live-telemetry.md](live-telemetry.md)
for the server side.

- On only while signed in with `Both` or `Remote`: live data goes where synced data goes.
- "A session being driven" is the lap-history recorder's open session plus a new frame within the
  last 10 s. The recorder keeps a session open after the game closes, so the frame age, not the
  open session, is what ends a live session.
- The telemetry loop only sets fields and appends to a small buffer (`Update`, `Observe`); a
  100 ms worker owns the WebSocket. Samples are capped at 20 Hz by frame timestamp and dropped,
  not queued, while disconnected. Reconnects back off 1 s to 30 s.

## Server schema upgrades

The API creates its schema with `EnsureCreated`, which never alters an existing database. Every
column or table added later needs an idempotent statement in
`api/Sprint.Api/Data/SchemaUpgrades.cs`, or existing deployments fail on the first query that
touches the new column. Two traps:

- `ExecuteSqlRaw` runs the SQL through `string.Format`, so a literal `{` in SQL must be written
  `{{`.
- The API tests use the in-memory provider, which skips these statements. Exercise a change
  against a real Postgres that already has the previous schema.
