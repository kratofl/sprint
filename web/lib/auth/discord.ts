import { safeNext } from './route.ts'

// Discord sign-in on the web. The API runs the OAuth dance; the web only sends the
// browser to its start URL (app/auth/discord) and, once Discord is done, trades the
// single-use ticket the API hands back for a session (app/auth/complete). The JWT
// never appears in a URL. See docs/internals/live-telemetry.md.
//
// The ticket is bound to the browser that started the flow: /auth/discord sets a
// random flow id as an httpOnly cookie and sends it through the API inside `next`;
// /auth/complete redeems only when the id that comes back matches the cookie. A
// ticket somebody else obtained (and links a victim to) cannot sign that browser
// in as them.

// The httpOnly cookie that holds the flow id, scoped to /auth.
export const signInFlowCookieName = 'sprint_signin_flow'

// Why a Discord sign-in failed. Only these codes reach the sign-in page, which
// maps them to fixed text, so a crafted link cannot put words on the page.
export type SignInError = 'cancelled' | 'closed' | 'unavailable' | 'expired' | 'unreachable' | 'failed'

const signInErrors: Record<SignInError, string> = {
  cancelled: 'Discord sign-in was cancelled.',
  closed: 'Registration is closed on this server. Ask its admin for an account.',
  unavailable: 'Discord sign-in isn’t set up on this server. Ask its admin to set SPRINT_PUBLIC_API_URL.',
  expired: 'This sign-in expired or started in another browser. Try again.',
  unreachable: 'Can’t reach the Sprint API. Try again in a moment.',
  failed: 'Discord sign-in did not finish. Try again.',
}

// The text for a sign-in page's `error` code; null for anything that is not one.
export function signInErrorMessage(code: string | null): string | null {
  return code !== null && isSignInError(code) ? signInErrors[code] : null
}

function isSignInError(code: string): code is SignInError {
  return Object.hasOwn(signInErrors, code)
}

// Where /auth/discord sends the browser: the API's public start URL for a web
// sign-in returning to `next`, carrying `flow`. Null when SPRINT_PUBLIC_API_URL is
// missing or not an http(s) URL — the browser cannot reach the internal API_URL.
export function discordStartUrl(publicApiUrl: string | undefined, next: string | null, flow: string): string | null {
  const base = publicApiUrl?.trim().replace(/\/+$/, '') ?? ''
  if (!/^https?:\/\/[^/]/.test(base)) return null
  const carried = `/?${new URLSearchParams({ flow, next: safeNext(next) })}`
  const query = new URLSearchParams({ client: 'web', next: carried })
  return `${base}/api/auth/discord/start?${query}`
}

// What /auth/complete does with the API's redirect: redeem the ticket, or go back
// to sign-in saying why it failed.
export type CompletionStep = { kind: 'redeem'; ticket: string; next: string } | { kind: 'fail'; to: string }

// The query of the API's redirect to /auth/complete, and the flow cookie this
// browser holds (undefined when it started no flow).
export type CompletionRequest = { ticket: string | null; error: string | null; next: string | null; flowCookie: string | undefined }

// Decides the next step from the callback. An error wins over a ticket; a ticket
// is only redeemed in the browser whose flow cookie matches the flow it carries.
export function completionStep({ ticket, error, next, flowCookie }: CompletionRequest): CompletionStep {
  const carried = new URLSearchParams(next?.startsWith('/?') ? next.slice(2) : '')
  const target = safeNext(carried.get('next'))
  if (error !== null) return { kind: 'fail', to: signInWithError(target, apiErrorCode(error)) }
  if (ticket === null || ticket === '') return { kind: 'fail', to: signInWithError(target, 'failed') }
  const flow = carried.get('flow')
  if (flow === null || flow === '' || flow !== flowCookie) return { kind: 'fail', to: signInWithError(target, 'expired') }
  return { kind: 'redeem', ticket, next: target }
}

// The code for an error the API's Discord callback reported. The API sends text;
// the known refusals get their own code, anything else is a generic failure.
export function apiErrorCode(message: string): SignInError {
  if (message.includes('cancelled')) return 'cancelled'
  if (message.includes('Registration is closed')) return 'closed'
  return 'failed'
}

// The sign-in page showing the message for `error`, returning to `next` afterwards.
export function signInWithError(next: string, error: SignInError): string {
  const query = new URLSearchParams()
  if (next !== '/') query.set('next', next)
  query.set('error', error)
  return `/sign-in?${query}`
}
