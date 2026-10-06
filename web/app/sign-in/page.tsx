import type { Metadata } from 'next'
import { getServerSettings } from '@/lib/server/data'
import SignIn from './SignIn'

export const metadata: Metadata = { title: 'Sign in – Sprint' }

// Sign-in page, outside the app shell. `next` is where to go afterwards; the
// Server Action checks it is a same-origin path. Signed-in visitors never get
// here: proxy.ts sends them on to `next`. The server's settings name it and
// say whether it takes new accounts.
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [{ next }, server] = await Promise.all([searchParams, getServerSettings()])
  return <SignIn next={typeof next === 'string' ? next : '/'} server={server} />
}
