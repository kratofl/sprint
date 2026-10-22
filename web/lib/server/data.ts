import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  MeDocument,
  ServerSettingsDocument,
  SessionsDocument,
  SettingsDocument,
  SetupsDocument,
  type Operation,
} from '../gql/operations'
import { requestPathHeader, safeNext, signInPath } from '../auth/route.ts'
import { sessionCookieName } from '../auth/session.ts'
import { parsePreferences, preferencesCookieName, type Preferences } from '../preferences.ts'
import type { Loaded, Overview, ServerSettings, Session, SettingsData, Setup, ViewerState } from '../records.ts'
import { callApi } from './api.ts'

// Page loaders for server components. Each reads the session cookie, queries the
// API and returns plain data for a client view. A missing session redirects to
// sign-in; a session the API rejects goes through /sign-out, which clears the
// cookie (server components cannot).

// Who is signed in, for the app shell. Never redirects; with a rejected cookie
// it reports signed-out and the sidebar's sign-in link clears it via /sign-out.
export async function getViewer(): Promise<ViewerState> {
  const token = (await cookies()).get(sessionCookieName)?.value
  if (token === undefined) return { kind: 'signed-out' }
  const result = await callApi(MeDocument, {}, token)
  switch (result.kind) {
    case 'data':
      return result.data.me === null ? { kind: 'signed-out' } : { kind: 'signed-in', viewer: result.data.me }
    case 'unauthenticated':
      return { kind: 'signed-out' }
    case 'error':
    case 'network':
      return { kind: 'unknown' }
  }
}

// The signed-in user's sessions.
export async function loadSessions(): Promise<Loaded<readonly Session[]>> {
  return load(SessionsDocument, (data) => data.sessions)
}

// The signed-in user's setup bank.
export async function loadSetups(): Promise<Loaded<readonly Setup[]>> {
  return load(SetupsDocument, (data) => data.setups)
}

// Sessions and setups together, for the overview.
export async function loadOverview(): Promise<Loaded<Overview>> {
  const [sessions, setups] = await Promise.all([loadSessions(), loadSetups()])
  if (sessions.kind === 'unavailable') return sessions
  if (setups.kind === 'unavailable') return setups
  return { kind: 'ok', data: { sessions: sessions.data, setups: setups.data } }
}

// The account and, for an admin, the server settings, for the settings page.
export async function loadSettings(): Promise<Loaded<SettingsData>> {
  const loaded = await load(SettingsDocument, (data) => data)
  if (loaded.kind === 'unavailable') return loaded
  const { me, serverSettings } = loaded.data
  // A live token for an account that no longer exists: treat it as rejected.
  if (me === null) redirect(`/sign-out?next=${encodeURIComponent('/settings')}`)
  return {
    kind: 'ok',
    data: { account: me, server: me.isAdmin ? { kind: 'admin', settings: serverSettings } : { kind: 'member' } },
  }
}

// The server's name and whether it takes new accounts, for the sign-in page.
// Anonymous. Falls back to the API's defaults when it cannot be reached; the
// sign-in attempt then reports that itself.
export async function getServerSettings(): Promise<ServerSettings> {
  const result = await callApi(ServerSettingsDocument, {}, null)
  return result.kind === 'data' ? result.data.serverSettings : { instanceName: 'Sprint', allowRegistration: true }
}

// This browser's appearance preferences (theme, motion, glass) from their cookie.
export async function getPreferences(): Promise<Preferences> {
  return parsePreferences((await cookies()).get(preferencesCookieName)?.value)
}

// Runs one authenticated query and maps the result for a view.
async function load<TData, T>(operation: Operation<TData, Record<string, never>>, pick: (data: TData) => T): Promise<Loaded<T>> {
  const token = (await cookies()).get(sessionCookieName)?.value
  const here = safeNext((await headers()).get(requestPathHeader))
  // proxy.ts normally catches a missing cookie before the page renders.
  if (token === undefined) redirect(signInPath(here))
  const result = await callApi(operation, {}, token)
  switch (result.kind) {
    case 'data':
      return { kind: 'ok', data: pick(result.data) }
    case 'unauthenticated':
      redirect(`/sign-out?next=${encodeURIComponent(here)}`)
    case 'error':
      return { kind: 'unavailable', message: result.message }
    case 'network':
      return { kind: 'unavailable', message: 'Can’t reach the Sprint API.' }
  }
}
