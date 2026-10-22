import test from 'node:test'
import assert from 'node:assert/strict'
import { routeDecision, safeNext } from './route.ts'

// A JWT that expires at `exp` (epoch seconds). The signature is never checked here.
const jwt = (exp: number) =>
  ['{"alg":"HS256"}', JSON.stringify({ user_id: 'u1', exp })]
    .map((part) => Buffer.from(part).toString('base64url'))
    .concat('c2lnbmF0dXJl')
    .join('.')

const now = Date.parse('2026-10-04T12:00:00Z')
// Expires 2026-10-05T12:00:00Z and 2026-10-04T11:00:00Z.
const valid = jwt(1791201600)
const expired = jwt(1791111600)

test('without a session cookie a page redirects to sign-in and remembers where it was', () => {
  assert.deepEqual(routeDecision({ token: undefined, now, pathname: '/sessions', search: '?q=spa&sort=new' }), {
    kind: 'redirect',
    to: '/sign-in?next=%2Fsessions%3Fq%3Dspa%26sort%3Dnew',
  })
})

test('a session passes until its token expires', () => {
  assert.deepEqual(routeDecision({ token: valid, now, pathname: '/setups', search: '' }), { kind: 'pass' })
  assert.deepEqual(routeDecision({ token: expired, now, pathname: '/setups', search: '' }), {
    kind: 'redirect',
    to: '/sign-in?next=%2Fsetups',
  })
  assert.deepEqual(routeDecision({ token: 'garbage', now, pathname: '/setups', search: '' }), {
    kind: 'redirect',
    to: '/sign-in?next=%2Fsetups',
  })
})

test('the overview redirects to plain sign-in, since returning to / is the default', () => {
  assert.deepEqual(routeDecision({ token: undefined, now, pathname: '/', search: '' }), { kind: 'redirect', to: '/sign-in' })
})

test('sign-in, sign-out and the health check need no session', () => {
  for (const pathname of ['/sign-in', '/sign-out', '/api/health']) {
    assert.deepEqual(routeDecision({ token: undefined, now, pathname, search: '' }), { kind: 'pass' }, pathname)
  }
  assert.deepEqual(routeDecision({ token: undefined, now, pathname: '/sign-in-later', search: '' }), {
    kind: 'redirect',
    to: '/sign-in?next=%2Fsign-in-later',
  })
})

test('a signed-in visit to sign-in goes on to where it was headed', () => {
  const visit = (search: string) => routeDecision({ token: valid, now, pathname: '/sign-in', search })

  assert.deepEqual(visit('?next=%2Fsessions%3Fq%3Dspa'), { kind: 'redirect', to: '/sessions?q=spa' })
  assert.deepEqual(visit(''), { kind: 'redirect', to: '/' })
  assert.deepEqual(visit('?next=%2F%2Fevil.example'), { kind: 'redirect', to: '/' })
})

test('only same-origin relative paths other than sign-out are accepted as a return target', () => {
  assert.equal(safeNext('/setups?q=spa'), '/setups?q=spa')
  for (const unsafe of [null, '', 'setups', '//evil.example', '/\\evil.example', '/\t/evil.example', 'https://evil.example', '/sign-out', '/sign-out?next=%2F']) {
    assert.equal(safeNext(unsafe), '/', String(unsafe))
  }
})
