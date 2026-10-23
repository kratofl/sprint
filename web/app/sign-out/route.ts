import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { safeNext, signInPath } from '@/lib/auth/route'
import { sessionCookieName } from '@/lib/auth/session'

// Clears the session cookie and sends the user to sign-in, returning to `next`
// afterwards. Page loaders redirect here when the API rejects a token that
// looked valid, because server components cannot delete cookies.
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get('next'))
  const jar = await cookies()
  jar.delete(sessionCookieName)
  redirect(signInPath(next))
}
