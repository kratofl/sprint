import test from 'node:test'
import assert from 'node:assert/strict'
import { apiErrorCode, completionStep, discordStartUrl, signInErrorMessage } from './discord.ts'

// The `next` the API hands back to /auth/complete for a flow started with `flow` and `next`.
const carried = (flow: string, next: string) => `/?${new URLSearchParams({ flow, next })}`

test('Discord sign-in starts at the public API with the web client, the flow id and a safe return path', () => {
  const start = (url: string | undefined, next: string | null) => {
    const href = discordStartUrl(url, next, 'f1')
    return href === null ? null : new URL(href)
  }

  const url = start('https://sprint-api.example.com', '/sessions?q=spa')
  assert.equal(url?.origin + (url?.pathname ?? ''), 'https://sprint-api.example.com/api/auth/discord/start')
  assert.equal(url?.searchParams.get('client'), 'web')
  assert.equal(url?.searchParams.get('next'), carried('f1', '/sessions?q=spa'))
  // A trailing slash on the env value does not double up.
  assert.equal(start('https://sprint-api.example.com/', null)?.pathname, '/api/auth/discord/start')
  // An unsafe next falls back to the overview instead of leaving the site afterwards.
  assert.equal(start('https://api.example', '//evil.example')?.searchParams.get('next'), carried('f1', '/'))
})

test('without a usable public API URL there is nowhere to send the browser', () => {
  for (const url of [undefined, '', '  ', 'api:8080', 'ftp://api.example']) {
    assert.equal(discordStartUrl(url, '/', 'f1'), null, String(url))
  }
})

test('a ticket is redeemed in the browser that started the flow, then the browser goes on to next', () => {
  assert.deepEqual(completionStep({ ticket: 'abc', error: null, next: carried('f1', '/engineer/invite/t1'), flowCookie: 'f1' }), {
    kind: 'redeem',
    ticket: 'abc',
    next: '/engineer/invite/t1',
  })
  assert.deepEqual(completionStep({ ticket: 'abc', error: null, next: carried('f1', 'https://evil.example'), flowCookie: 'f1' }), {
    kind: 'redeem',
    ticket: 'abc',
    next: '/',
  })
})

test('a ticket from a flow this browser did not start is not redeemed', () => {
  // Somebody else's ticket, linked to a browser with no flow, or with a different one.
  for (const flowCookie of [undefined, 'f2', '']) {
    assert.deepEqual(completionStep({ ticket: 'abc', error: null, next: carried('f1', '/settings'), flowCookie }), {
      kind: 'fail',
      to: '/sign-in?next=%2Fsettings&error=expired',
    })
  }
  // A next without a flow id is not a flow at all.
  for (const next of ['/settings', null, carried('', '/')]) {
    assert.equal(completionStep({ ticket: 'abc', error: null, next, flowCookie: '' }).kind, 'fail', String(next))
  }
})

test('an error from the callback goes back to sign-in with its code and the return path', () => {
  assert.deepEqual(completionStep({ ticket: null, error: 'Registration is closed on this server. Ask its admin for an account.', next: carried('f1', '/sessions'), flowCookie: 'f1' }), {
    kind: 'fail',
    to: '/sign-in?next=%2Fsessions&error=closed',
  })
  assert.deepEqual(completionStep({ ticket: null, error: null, next: null, flowCookie: undefined }), { kind: 'fail', to: '/sign-in?error=failed' })
  // An error wins over a ticket: the API never sends both, so both is not trusted.
  assert.equal(completionStep({ ticket: 'abc', error: 'Denied', next: carried('f1', '/'), flowCookie: 'f1' }).kind, 'fail')
})

test('the API’s known refusals get their own code; anything else is a generic failure', () => {
  assert.equal(apiErrorCode('Discord sign-in was cancelled.'), 'cancelled')
  assert.equal(apiErrorCode('Registration is closed on this server. Ask its admin for an account.'), 'closed')
  assert.equal(apiErrorCode('Your account was locked. Verify at sprint-support.example'), 'failed')
})

test('the sign-in page shows fixed text for known codes and nothing for anything else', () => {
  assert.equal(signInErrorMessage('closed'), 'Registration is closed on this server. Ask its admin for an account.')
  assert.equal(signInErrorMessage('expired'), 'This sign-in expired or started in another browser. Try again.')
  for (const code of [null, '', 'Your account was locked. Verify at sprint-support.example', 'toString', '__proto__']) {
    assert.equal(signInErrorMessage(code), null, String(code))
  }
})
