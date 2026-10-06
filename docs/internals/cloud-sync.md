# Sprint web: setup, sync and the server schema

How the desktop connects to a Sprint server (self-hosted or official) and moves data. The
setup flow is `app/desktop/src/onboarding/flow.ts`. The sync is
`app/Sprint.Desktop.Core/Features/Sharing/CloudSync.cs`.

## Setup

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
  rather than mixing ids.
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

## Server schema upgrades

The API creates its schema with `EnsureCreated`, which never alters an existing database. Every
column or table added later needs an idempotent statement in
`api/Sprint.Api/Data/SchemaUpgrades.cs`, or existing deployments fail on the first query that
touches the new column. Two traps:

- `ExecuteSqlRaw` runs the SQL through `string.Format`, so a literal `{` in SQL must be written
  `{{`.
- The API tests use the in-memory provider, which skips these statements. Exercise a change
  against a real Postgres that already has the previous schema.
