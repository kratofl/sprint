import type { MeQuery, ServerSettingsQuery, SessionsQuery, SettingsQuery, SetupsQuery } from './gql/operations'

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

// One row of the session library (the fields sessions.graphql selects).
export type Session = SessionsQuery['sessions'][number]

// One row of the setup bank (the fields setups.graphql selects).
export type Setup = SetupsQuery['setups'][number]

// Everything the overview page shows.
export type Overview = { sessions: readonly Session[]; setups: readonly Setup[] }

// What a page loader returns. A signed-out or rejected session never gets
// here: the loader redirects to sign-in instead.
export type Loaded<T> = { kind: 'ok'; data: T } | { kind: 'unavailable'; message: string }

// State of the sign-in / register form for React's useActionState: null until
// a submit fails, then the API's message and the email to refill the field
// (React resets the form after an action).
export type AuthFormState = { error: string; email: string } | null

// The server's public settings: its name and whether new accounts may register.
export type ServerSettings = ServerSettingsQuery['serverSettings']

// The signed-in account, as the settings page edits it.
export type Account = NonNullable<SettingsQuery['me']>

// Everything the settings page shows. Only an admin gets the Server section.
export type SettingsData = {
  account: Account
  server: { kind: 'admin'; settings: ServerSettings } | { kind: 'member' }
}
