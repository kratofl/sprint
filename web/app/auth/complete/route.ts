import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { completionStep, signInFlowCookieName, signInWithError } from '@/lib/auth/discord'
import { authOutcome, servedOverHttps } from '@/lib/auth/session'
import { RedeemSignInTicketDocument } from '@/lib/gql/operations'
import { callApi } from '@/lib/server/api'

// Where the API sends the browser after Discord: checks the flow started in this
// browser, trades the single-use ticket for a session server-side, sets the
// httpOnly session cookie exactly like the email sign-in does, then goes on to
// `next`. Failures return to sign-in with an error code.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams
  const jar = await cookies()
  const flowCookie = jar.get(signInFlowCookieName)?.value
  // One flow, one completion: the id is spent whatever happens next.
  jar.delete({ name: signInFlowCookieName, path: '/auth' })
  const step = completionStep({ ticket: query.get('ticket'), error: query.get('error'), next: query.get('next'), flowCookie })
  if (step.kind === 'fail') redirect(step.to)

  const result = await callApi(RedeemSignInTicketDocument, { ticket: step.ticket }, null)
  const outcome = authOutcome(result, {
    secure: servedOverHttps(request.headers.get('x-forwarded-proto'), request.url),
    now: Date.now(),
  })
  if (outcome.kind === 'failed') redirect(signInWithError(step.next, result.kind === 'network' ? 'unreachable' : 'expired'))
  jar.set(outcome.cookie)
  redirect(step.next)
}
