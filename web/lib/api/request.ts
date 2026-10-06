import type { Operation } from '../gql/operations'

// What one GraphQL call to the Sprint API came back with.
export type ApiResult<TData> =
  | { kind: 'data'; data: TData }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string }
  | { kind: 'network' }

// Where and how to send a request. `fetch` is injected so the client is
// testable without a server; `token` is the session JWT, or null when signed out.
export type ApiTarget = {
  url: string
  token: string | null
  fetch: (input: string, init: RequestInit) => Promise<Response>
}

// HotChocolate's error code for an [Authorize] field reached without a valid user.
const notAuthenticated = 'AUTH_NOT_AUTHENTICATED'

type GraphqlError = { message: string; code: string | null }

// Sends one operation to `${url}/graphql` and classifies the answer.
export async function graphqlRequest<TData, TVariables>(
  operation: Operation<TData, TVariables>,
  variables: TVariables,
  target: ApiTarget,
): Promise<ApiResult<TData>> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' }
  if (target.token !== null) headers.authorization = `Bearer ${target.token}`
  let response: Response
  try {
    response = await target.fetch(`${target.url}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: operation.query, variables }),
    })
  } catch {
    return { kind: 'network' }
  }
  if (response.status === 401) return { kind: 'unauthenticated' }

  const body = await readJson(response)
  const errors = readErrors(body)
  if (errors.some((error) => error.code === notAuthenticated)) return { kind: 'unauthenticated' }
  if (errors.length > 0) return { kind: 'error', message: errors[0].message }
  if (!isRecord(body) || !isRecord(body.data)) {
    return { kind: 'error', message: `Unexpected response from the API (HTTP ${response.status}).` }
  }
  // The server validated the operation against the schema these types were
  // generated from, so `data` has the operation's result shape.
  return { kind: 'data', data: body.data as TData }
}

// The response body as JSON, or null when it is not JSON (e.g. a proxy error page).
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// The `errors` array of a GraphQL response, keeping only message and code.
function readErrors(body: unknown): readonly GraphqlError[] {
  if (!isRecord(body) || !Array.isArray(body.errors)) return []
  return body.errors.filter(isRecord).map((error) => ({
    message: typeof error.message === 'string' ? error.message : '',
    code: isRecord(error.extensions) && typeof error.extensions.code === 'string' ? error.extensions.code : null,
  }))
}
