import 'server-only'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import {
  EngineerInviteDocument,
  EngineersDocument,
  LiveSessionsDocument,
  MeDocument,
  ServerSettingsDocument,
  SessionDetailDocument,
  SessionsDocument,
  SessionTelemetryDocument,
  SettingsDocument,
  SetupsDocument,
  type Operation,
} from '../gql/operations'
import { requestPathHeader, safeNext, signInPath } from '../auth/route.ts'
import { sessionCookieName } from '../auth/session.ts'
import { parsePreferences, preferencesCookieName, type Preferences } from '../preferences.ts'
import type {
  EngineerInvitePreview,
  Engineers,
  LiveSession,
  Loaded,
  Overview,
  ServerSettings,
  Session,
  SessionDetail,
  SessionTelemetry,
  SettingsData,
  Setup,
  ViewerState,
} from '../records.ts'
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

// Every session the signed-in user may see: their own and their drivers'.
export async function loadSessions(): Promise<Loaded<readonly Session[]>> {
  return load(SessionsDocument, {}, (data) => data.visibleSessions)
}

// Sessions being streamed right now that the signed-in user may watch.
export async function loadLiveSessions(): Promise<Loaded<readonly LiveSession[]>> {
  return load(LiveSessionsDocument, {}, (data) => data.liveSessions)
}

// The signed-in user's setup bank.
export async function loadSetups(): Promise<Loaded<readonly Setup[]>> {
  return load(SetupsDocument, {}, (data) => data.setups)
}

// Sessions, setups and who is driving right now, for the overview.
export async function loadOverview(): Promise<Loaded<Overview>> {
  const [sessions, setups, live] = await Promise.all([loadSessions(), loadSetups(), loadLiveSessions()])
  if (sessions.kind === 'unavailable') return sessions
  if (setups.kind === 'unavailable') return setups
  if (live.kind === 'unavailable') return live
  return { kind: 'ok', data: { sessions: sessions.data, setups: setups.data, live: live.data } }
}

// The signed-in user's engineers, the drivers they engineer for and their open invite links.
export async function loadEngineers(): Promise<Loaded<Engineers>> {
  return load(EngineersDocument, {}, (data) => data)
}

// One session the signed-in user may see. A session that does not exist or is not
// theirs to see is a 404, not an error: the two are deliberately indistinguishable.
export async function loadSession(id: string): Promise<Loaded<SessionDetail>> {
  const loaded = await load(SessionDetailDocument, { id }, (data) => data.visibleSession)
  if (loaded.kind === 'unavailable') return loaded
  if (loaded.data === null) notFound()
  return { kind: 'ok', data: loaded.data }
}

// A session's recorded telemetry, downsampled by the API to at most 600 points
// (enough for a chart the width of the content area).
export async function loadSessionTelemetry(id: string): Promise<Loaded<SessionTelemetry>> {
  return load(SessionTelemetryDocument, { sessionId: id, maxPoints: 600 }, (data) => data.sessionTelemetry)
}

// What an engineer invite link is. Anonymous, so the landing page works signed out.
export async function loadEngineerInvite(token: string): Promise<Loaded<EngineerInvitePreview>> {
  const result = await callApi(EngineerInviteDocument, { token }, null)
  switch (result.kind) {
    case 'data':
      return { kind: 'ok', data: result.data.engineerInvite }
    case 'error':
      return { kind: 'unavailable', message: result.message }
    case 'unauthenticated':
    case 'network':
      return { kind: 'unavailable', message: 'Can’t reach the Sprint API.' }
  }
}

// The account and, for an admin, the server settings, for the settings page.
export async function loadSettings(): Promise<Loaded<SettingsData>> {
  const loaded = await load(SettingsDocument, {}, (data) => data)
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
  return result.kind === 'data' ? result.data.serverSettings : { instanceName: 'Sprint', allowRegistration: true, discordSignIn: false }
}

// This browser's appearance preferences (theme, motion, glass) from their cookie.
export async function getPreferences(): Promise<Preferences> {
  return parsePreferences((await cookies()).get(preferencesCookieName)?.value)
}

// Runs one authenticated query and maps the result for a view.
async function load<TData, TVariables, T>(operation: Operation<TData, TVariables>, variables: TVariables, pick: (data: TData) => T): Promise<Loaded<T>> {
  const token = (await cookies()).get(sessionCookieName)?.value
  const here = safeNext((await headers()).get(requestPathHeader))
  // proxy.ts normally catches a missing cookie before the page renders.
  if (token === undefined) redirect(signInPath(here))
  const result = await callApi(operation, variables, token)
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
