import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { discordStartUrl, signInFlowCookieName, signInWithError } from '@/lib/auth/discord'
import { safeNext } from '@/lib/auth/route'
import { servedOverHttps } from '@/lib/auth/session'

// "Continue with Discord" on the sign-in page links here. Starts a flow bound to
// this browser (a random id in an httpOnly cookie, see lib/auth/discord.ts) and
// sends the browser to the API's public Discord start URL, which comes back to
// /auth/complete. Read per request: SPRINT_PUBLIC_API_URL is set on the running
// container, not at build time.
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get('next')
  const flow = crypto.randomUUID()
  const start = discordStartUrl(process.env.SPRINT_PUBLIC_API_URL, next, flow)
  if (start === null) redirect(signInWithError(safeNext(next), 'unavailable'))
  const jar = await cookies()
  jar.set({
    name: signInFlowCookieName,
    value: flow,
    httpOnly: true,
    // Lax still rides along on the top-level redirect from the API back to /auth/complete.
    sameSite: 'lax',
    secure: servedOverHttps(request.headers.get('x-forwarded-proto'), request.url),
    path: '/auth',
    // Discord's side of the flow expires after ten minutes too.
    maxAge: 600,
  })
  redirect(start)
}
