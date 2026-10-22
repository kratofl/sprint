import test from 'node:test'
import assert from 'node:assert/strict'
import { authOutcome } from './session.ts'

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
  const outcome = authOutcome({ kind: 'data', data: { session: { token } } }, { production: false, now })

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

test('the cookie is Secure in production only', () => {
  const signIn = (production: boolean) => authOutcome({ kind: 'data', data: { session: { token } } }, { production, now })

  const secure = (outcome: ReturnType<typeof signIn>) => (outcome.kind === 'signed-in' ? outcome.cookie.secure : null)
  assert.equal(secure(signIn(true)), true)
  assert.equal(secure(signIn(false)), false)
})

test('a token that is not a readable JWT fails the sign-in instead of setting a cookie', () => {
  for (const malformed of ['not-a-jwt', 'a.%%%.c', jwt({ user_id: 'u1' })]) {
    const outcome = authOutcome({ kind: 'data', data: { session: { token: malformed } } }, { production: false, now })

    assert.deepEqual(outcome, { kind: 'failed', message: 'The Sprint API returned an unreadable session. Try again.' })
  }
})

test('an API error is shown verbatim and an unreachable API says so', () => {
  const env = { production: false, now }

  assert.deepEqual(authOutcome({ kind: 'error', message: 'Email already registered.' }, env), {
    kind: 'failed',
    message: 'Email already registered.',
  })
  assert.deepEqual(authOutcome({ kind: 'network' }, env), {
    kind: 'failed',
    message: 'Can’t reach the Sprint API. Try again in a moment.',
  })
})
