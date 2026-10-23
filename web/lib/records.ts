import type {
  EngineerInviteQuery,
  EngineersQuery,
  LiveSessionsQuery,
  MeQuery,
  ServerSettingsQuery,
  SessionDetailQuery,
  SessionsQuery,
  SessionTelemetryQuery,
  SettingsQuery,
  SetupsQuery,
} from './gql/operations'

// Types the pages hand to their client views. Type-only, so client components
// may import them; the loaders that produce them live in lib/server/.

// The signed-in user, as the sidebar shows them.
export type Viewer = NonNullable<MeQuery['me']>

// Who the sidebar footer shows. `unknown` means a session cookie exists but the
// API could not confirm it (down or erroring), so sign-out must stay reachable.
export type ViewerState =
  | { kind: 'signed-in'; viewer: Viewer }
  | { kind: 'signed-out' }
  | { kind: 'unknown' }

// One row of the session library: the viewer's own sessions and those of drivers
// they engineer for (the fields sessions.graphql selects).
export type Session = SessionsQuery['visibleSessions'][number]

// Another account as the app shows it: never an email.
export type AccountSummary = Session['driver']

// A session someone is streaming right now, as the overview lists it and the live
// stream's snapshot describes it.
export type LiveSession = LiveSessionsQuery['liveSessions'][number]

// One session with its lap history (`data`, JSON) and, for one's own, which
// engineers may see it.
export type SessionDetail = NonNullable<SessionDetailQuery['visibleSession']>

// One engineer's access to one of the viewer's own sessions.
export type SessionEngineerAccess = SessionDetail['engineerAccess'][number]

// A session's recorded telemetry, from InfluxDB.
export type SessionTelemetry = SessionTelemetryQuery['sessionTelemetry']

// One telemetry sample. The live stream sends exactly this shape.
export type LiveSample = SessionTelemetry['samples'][number]

// One completed lap the API detected in the stream.
export type LiveLap = SessionTelemetry['laps'][number]

// One row of the setup bank (the fields setups.graphql selects).
export type Setup = SetupsQuery['setups'][number]

// Everything the overview page shows.
export type Overview = { sessions: readonly Session[]; setups: readonly Setup[]; live: readonly LiveSession[] }

// Everything the engineers page shows.
export type Engineers = EngineersQuery

// What an engineer invite link is, for its landing page.
export type EngineerInvitePreview = EngineerInviteQuery['engineerInvite']

// What a page loader returns. A signed-out or rejected session never gets
// here: the loader redirects to sign-in instead.
export type Loaded<T> = { kind: 'ok'; data: T } | { kind: 'unavailable'; message: string }

// State of the sign-in / register form for React's useActionState: null until
// a submit fails, then the API's message and the email to refill the field
// (React resets the form after an action).
export type AuthFormState = { error: string; email: string } | null

// The server's public settings: its name and whether new accounts may register.
export type ServerSettings = ServerSettingsQuery['serverSettings']

// The server settings an admin edits on the settings page.
export type EditableServerSettings = SettingsQuery['serverSettings']

// The signed-in account, as the settings page edits it.
export type Account = NonNullable<SettingsQuery['me']>

// Everything the settings page shows. Only an admin gets the Server section.
export type SettingsData = {
  account: Account
  server: { kind: 'admin'; settings: EditableServerSettings } | { kind: 'member' }
}
