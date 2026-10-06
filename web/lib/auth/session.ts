import type { ApiResult } from '../api/request.ts'

// Name of the httpOnly cookie that holds the API's JWT. The browser never reads it.
export const sessionCookieName = 'sprint_session'

// The cookie a sign-in sets, in the shape `cookies().set()` takes.
export type SessionCookie = {
  name: typeof sessionCookieName
  value: string
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: '/'
  maxAge: number
}

// What a sign-in or register attempt ends in.
export type AuthOutcome =
  | { kind: 'signed-in'; cookie: SessionCookie }
  | { kind: 'failed'; message: string }

// The `login` / `register` result, both aliased to `session` in auth.graphql.
type AuthData = { session: { token: string } }

// Turns the API's answer to `login` / `register` into the cookie to set or the
// message to show. `now` is epoch milliseconds.
export function authOutcome(result: ApiResult<AuthData>, env: { production: boolean; now: number }): AuthOutcome {
  switch (result.kind) {
    case 'error':
      return { kind: 'failed', message: result.message }
    case 'network':
      return { kind: 'failed', message: 'Can’t reach the Sprint API. Try again in a moment.' }
    case 'unauthenticated':
      // login/register are anonymous; the API never answers them this way.
      return { kind: 'failed', message: 'The Sprint API refused the request. Try again.' }
  }
  const token = result.data.session.token
  const expiry = tokenExpiry(token)
  if (expiry === null) return { kind: 'failed', message: 'The Sprint API returned an unreadable session. Try again.' }
  return {
    kind: 'signed-in',
    cookie: {
      name: sessionCookieName,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: env.production,
      path: '/',
      maxAge: expiry - Math.floor(env.now / 1000),
    },
  }
}

// The `exp` claim (epoch seconds) of a JWT, decoded without verifying the
// signature — the API verifies. Null when the token is not a readable JWT.
export function tokenExpiry(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let payload: unknown
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    payload = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null || !('exp' in payload)) return null
  return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null
}
