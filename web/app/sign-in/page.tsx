import type { Metadata } from 'next'
import { signInErrorMessage } from '@/lib/auth/discord'
import { getServerSettings } from '@/lib/server/data'
import SignIn from './SignIn'

export const metadata: Metadata = { title: 'Sign in – Sprint' }

// Sign-in page, outside the app shell. `next` is where to go afterwards; the
// Server Action and /auth/discord check it is a same-origin path. Signed-in
// visitors never get here: proxy.ts sends them on to `next`. The server's
// settings name it, say whether it takes new accounts and whether Discord
// sign-in is on. `error` is a code for why a Discord sign-in failed (from
// /auth/complete); only known codes show, as fixed text, so a crafted link cannot
// put its own words on the page.
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const [{ next, error }, server] = await Promise.all([searchParams, getServerSettings()])
  return <SignIn next={typeof next === 'string' ? next : '/'} error={signInErrorMessage(typeof error === 'string' ? error : null)} server={server} />
}
