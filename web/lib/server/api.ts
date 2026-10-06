import 'server-only'
import type { Operation } from '../gql/operations'
import { graphqlRequest, type ApiResult } from '../api/request.ts'

// Server-side base URL of the .NET API. The browser never talks to it.
const apiUrl = () => process.env.API_URL ?? 'http://localhost:8080'

// Calls the API from the server with the given session token (null when signed
// out). Gives up after 10 s so a hung API shows as unavailable, not a hung page.
export function callApi<TData, TVariables>(
  operation: Operation<TData, TVariables>,
  variables: TVariables,
  token: string | null,
): Promise<ApiResult<TData>> {
  return graphqlRequest(operation, variables, {
    url: apiUrl(),
    token,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  })
}
