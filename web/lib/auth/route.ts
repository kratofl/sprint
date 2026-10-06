import { tokenExpiry } from './session.ts'

// What proxy.ts does with a request: let it through, or send it elsewhere.
export type RouteDecision = { kind: 'pass' } | { kind: 'redirect'; to: string }

// The request facts the decision needs. `token` is the session cookie value,
// `now` epoch milliseconds, `search` the query string including its `?` (or '').
export type RouteRequest = { token: string | undefined; now: number; pathname: string; search: string }

// Request header proxy.ts sets to the page's path + query, so a loader that
// finds its session rejected can send the user back there after signing in.
export const requestPathHeader = 'x-sprint-path'

// Paths that work signed out. Next internals and static files never reach the
// proxy (see the matcher in proxy.ts).
const publicPaths = ['/sign-in', '/sign-out', '/api/health']

// Decides whether a request may reach its page, from the session cookie alone.
export function routeDecision(request: RouteRequest): RouteDecision {
  const signedIn = hasLiveSession(request.token, request.now)
  if (request.pathname === '/sign-in' && signedIn) {
    return { kind: 'redirect', to: safeNext(new URLSearchParams(request.search).get('next')) }
  }
  if (signedIn || publicPaths.includes(request.pathname)) return { kind: 'pass' }
  return { kind: 'redirect', to: signInPath(`${request.pathname}${request.search}`) }
}

// A `next` parameter if it is a same-origin relative path, else `/`. Rejects
// `//host` and `/\host` (browsers read both as another origin), control
// characters (browsers strip tabs and newlines, so `/<tab>/host` becomes `//host`)
// and /sign-out, which would end the session the user just started.
export function safeNext(next: string | null): string {
  if (next === null || !next.startsWith('/') || next[1] === '/' || next[1] === '\\') return '/'
  if (next === '/sign-out' || next.startsWith('/sign-out?')) return '/'
  return /[\u0000-\u001f\u007f]/.test(next) ? '/' : next
}

// The sign-in page, returning to `next` afterwards. `/` is the default, so it
// is left off.
export function signInPath(next: string): string {
  return next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`
}

// Whether the cookie holds a token that has not expired yet. Not verified: the
// API does that on every call.
function hasLiveSession(token: string | undefined, now: number): boolean {
  const expiry = token === undefined ? null : tokenExpiry(token)
  return expiry !== null && expiry * 1000 > now
}
