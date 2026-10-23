import test from 'node:test'
import assert from 'node:assert/strict'
import { authOutcome, servedOverHttps } from './session.ts'

// A JWT with the given payload. The signature is never checked on the web side.
const jwt = (payload: object) =>
  ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)]
    .map((part) => Buffer.from(part).toString('base64url'))
    .concat('c2lnbmF0dXJl')
    .join('.')

// 2026-10-04T12:00:00Z, and the 24h-later expiry the API stamps on a token issued then.
const now = Date.parse('2026-10-04T12:00:00Z')
const token = jwt({ user_id: 'u1', email: 'alex@example.com', exp: 1791201600 })

test('a token from the API becomes an httpOnly cookie that expires with the token', () => {
  const outcome = authOutcome({ kind: 'data', data: { session: { token } } }, { secure: false, now })

  assert.deepEqual(outcome, {
    kind: 'signed-in',
    cookie: {
      name: 'sprint_session',
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 86400,
    },
  })
})

test('the cookie is Secure exactly when the request came over https', () => {
  const signIn = (secure: boolean) => authOutcome({ kind: 'data', data: { session: { token } } }, { secure, now })

  const secure = (outcome: ReturnType<typeof signIn>) => (outcome.kind === 'signed-in' ? outcome.cookie.secure : null)
  assert.equal(secure(signIn(true)), true)
  assert.equal(secure(signIn(false)), false)
})

test('https is read from the proxy’s X-Forwarded-Proto first, else from the URL', () => {
  // Behind a TLS-terminating proxy the web itself is reached over http.
  assert.equal(servedOverHttps('https', 'http://web:3000/auth/complete'), true)
  assert.equal(servedOverHttps('https, http', null), true)
  assert.equal(servedOverHttps('HTTPS', null), true)
  // A home server on plain http on the LAN: a Secure cookie would be dropped.
  assert.equal(servedOverHttps('http', 'http://192.168.1.20:13680'), false)
  assert.equal(servedOverHttps(null, 'http://192.168.1.20:13680'), false)
  // No proxy header: the URL (or a Server Action's Origin) decides.
  assert.equal(servedOverHttps(null, 'https://sprint.example'), true)
  assert.equal(servedOverHttps('', 'https://sprint.example'), true)
  assert.equal(servedOverHttps(null, null), false)
})

test('a token that is not a readable JWT fails the sign-in instead of setting a cookie', () => {
  for (const malformed of ['not-a-jwt', 'a.%%%.c', jwt({ user_id: 'u1' })]) {
    const outcome = authOutcome({ kind: 'data', data: { session: { token: malformed } } }, { secure: false, now })

    assert.deepEqual(outcome, { kind: 'failed', message: 'The Sprint API returned an unreadable session. Try again.' })
  }
})

test('an API error is shown verbatim and an unreachable API says so', () => {
  const env = { secure: false, now }

  assert.deepEqual(authOutcome({ kind: 'error', message: 'Email already registered.' }, env), {
    kind: 'failed',
    message: 'Email already registered.',
  })
  assert.deepEqual(authOutcome({ kind: 'network' }, env), {
    kind: 'failed',
    message: 'Can’t reach the Sprint API. Try again in a moment.',
  })
})
