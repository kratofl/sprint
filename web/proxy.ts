import { NextResponse, type NextRequest } from 'next/server'
import { requestPathHeader, routeDecision } from '@/lib/auth/route'
import { sessionCookieName } from '@/lib/auth/session'

// Route guard: a request without a live session cookie goes to /sign-in?next=…
// before any page renders. The decision is lib/auth/route.ts; this only adapts
// it to Next. Passing requests carry their path in `x-sprint-path` for the page
// loaders (see lib/server/data.ts).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const decision = routeDecision({
    token: request.cookies.get(sessionCookieName)?.value,
    now: Date.now(),
    pathname,
    search,
  })
  if (decision.kind === 'redirect') return NextResponse.redirect(new URL(decision.to, request.url))

  const headers = new Headers(request.headers)
  headers.set(requestPathHeader, `${pathname}${search}`)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Everything except Next's static output, image optimizer and files with an
  // extension (icons, fonts, public assets).
  matcher: ['/((?!_next/static|_next/image|.*\\.[A-Za-z0-9]+$).*)'],
}
