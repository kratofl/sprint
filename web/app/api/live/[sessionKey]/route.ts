import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { sessionCookieName } from '@/lib/auth/session'
import { sseFrame, upstreamFailure } from '@/lib/live'
import { apiUrl } from '@/lib/server/api'

// The live view's stream: bridges the API's SSE for one session with the session
// cookie as its bearer token, so the browser never holds the JWT. Events pass
// through untouched. When the API refuses the stream (not live, no access, signed
// out, unreachable), this answers with one `unavailable` event instead, since an
// EventSource cannot read HTTP statuses. Closing the EventSource aborts the
// upstream request.
export const dynamic = 'force-dynamic'

const sseHeaders = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  // Reverse proxies (nginx) must not buffer the stream.
  'x-accel-buffering': 'no',
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionKey: string }> }) {
  const { sessionKey } = await params
  const token = (await cookies()).get(sessionCookieName)?.value
  if (token === undefined) return refused(401)

  let upstream: Response
  try {
    upstream = await fetch(`${apiUrl()}/api/live/sessions/${encodeURIComponent(sessionKey)}/stream`, {
      headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
      cache: 'no-store',
      signal: request.signal,
    })
  } catch {
    return refused(null)
  }
  if (!upstream.ok || upstream.body === null) return refused(upstream.status)
  return new Response(upstream.body, { headers: sseHeaders })
}

// A one-event stream saying why there is no live data. For a server error the
// browser retries after 5 s on its own; the view closes the stream otherwise.
function refused(status: number | null): Response {
  return new Response(`retry: 5000\n${sseFrame('unavailable', upstreamFailure(status))}`, { headers: sseHeaders })
}
