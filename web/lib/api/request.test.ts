import test from 'node:test'
import assert from 'node:assert/strict'
import type { Operation } from '../gql/operations'
import { graphqlRequest } from './request.ts'

type Me = { me: { email: string } | null }
const me: Operation<Me, Record<string, never>> = { query: 'query Me { me { email } }' }

// A fetch stand-in that records the request and answers with a fixed response.
function answer(status: number, body: string) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  }
  return { calls, fetch }
}

test('a successful query returns its data and sends the bearer token', async () => {
  const api = answer(200, '{"data":{"me":{"email":"alex@example.com"}}}')

  const result = await graphqlRequest(me, {}, { url: 'http://api:8080', token: 'abc.def.ghi', fetch: api.fetch })

  assert.deepEqual(result, { kind: 'data', data: { me: { email: 'alex@example.com' } } })
  assert.equal(api.calls[0].url, 'http://api:8080/graphql')
  const headers = new Headers(api.calls[0].init?.headers)
  assert.equal(headers.get('authorization'), 'Bearer abc.def.ghi')
  assert.deepEqual(JSON.parse(String(api.calls[0].init?.body)), { query: 'query Me { me { email } }', variables: {} })
})

const target = (fetch: ReturnType<typeof answer>['fetch']) => ({ url: 'http://api:8080', token: 'abc.def.ghi', fetch })

test('HotChocolate rejecting the token reads as unauthenticated', async () => {
  // HotChocolate answers an [Authorize] field without a valid user with HTTP 200.
  const body = JSON.stringify({
    errors: [{
      message: 'The current user is not authorized to access this resource.',
      path: ['me'],
      extensions: { code: 'AUTH_NOT_AUTHENTICATED' },
    }],
    data: { me: null },
  })

  const result = await graphqlRequest(me, {}, target(answer(200, body).fetch))

  assert.deepEqual(result, { kind: 'unauthenticated' })
})

test('HTTP 401 reads as unauthenticated', async () => {
  const result = await graphqlRequest(me, {}, target(answer(401, '').fetch))

  assert.deepEqual(result, { kind: 'unauthenticated' })
})

test('a GraphQL error surfaces its message verbatim', async () => {
  const body = JSON.stringify({ errors: [{ message: 'Invalid credentials.', path: ['login'] }], data: null })

  const result = await graphqlRequest(me, {}, target(answer(200, body).fetch))

  assert.deepEqual(result, { kind: 'error', message: 'Invalid credentials.' })
})

test('a request that never reaches the API reads as network', async () => {
  const refused = async () => {
    throw new TypeError('fetch failed')
  }

  const result = await graphqlRequest(me, {}, target(refused))

  assert.deepEqual(result, { kind: 'network' })
})

test('a response that is not GraphQL reports its HTTP status', async () => {
  const result = await graphqlRequest(me, {}, target(answer(502, '<html>Bad Gateway</html>').fetch))

  assert.deepEqual(result, { kind: 'error', message: 'Unexpected response from the API (HTTP 502).' })
})
