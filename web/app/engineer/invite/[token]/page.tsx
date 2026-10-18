import type { Metadata } from 'next'
import Link from 'next/link'
import { IconHeadset, IconLinkOff } from '@tabler/icons-react'
import Backdrop from '@/components/Backdrop'
import Brand from '@/components/Brand'
import { AccountAvatar } from '@/components/app/account'
import { listCardClass } from '@/components/app/grouped'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { signInPath } from '@/lib/auth/route'
import { invitePreview } from '@/lib/engineers'
import { formatDay } from '@/lib/period'
import { getViewer, loadEngineerInvite } from '@/lib/server/data'
import { viewerName } from '@/lib/viewer'
import AcceptInvite from './AcceptInvite'

export const metadata: Metadata = { title: 'Race engineer invite – Sprint' }

// Where an engineer invite link lands. Public, outside the app shell: it says who
// sent the invite before anyone signs in. Signed in, it accepts; signed out, it
// goes through sign-in (email or Discord) and comes back here.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const here = `/engineer/invite/${encodeURIComponent(token)}`
  const [preview, viewer] = await Promise.all([loadEngineerInvite(token), getViewer()])
  const signedIn = viewer.kind === 'signed-in' ? viewer.viewer : null

  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-label">
      <Backdrop tone="ambient" />
      <div className="content-veil absolute inset-0 -z-1" aria-hidden />
      <Link href="/" className="flex items-center gap-2">
        <Brand />
      </Link>
      <section className={`${listCardClass} w-full max-w-sm`} aria-labelledby="invite-title">
        {preview.kind === 'unavailable' ? (
          <ErrorState
            title="Couldn’t load this invite"
            body={preview.message}
            action={
              <Button asChild variant="secondary">
                <a href={here}>Try again</a>
              </Button>
            }
          />
        ) : (
          <InviteBody view={invitePreview(preview.data, signedIn?.id ?? null)} token={token} here={here} signedInAs={signedIn ? viewerName(signedIn) : null} />
        )}
      </section>
    </main>
  )
}

function InviteBody({
  view,
  token,
  here,
  signedInAs,
}: {
  view: ReturnType<typeof invitePreview>
  token: string
  here: string
  signedInAs: string | null
}) {
  if (view.kind === 'closed') {
    return (
      <ErrorState
        icon={IconLinkOff}
        title={view.title}
        body={view.body}
        action={
          <Button asChild variant="secondary">
            <Link href="/">Go to Sprint</Link>
          </Button>
        }
      />
    )
  }
  const { driver, expiresAt } = view
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <AccountAvatar account={driver} size="lg" />
      <h1 id="invite-title" className="text-title-3 text-balance">
        {driver.displayName} invited you to be their race engineer
      </h1>
      <p className="text-body text-pretty text-label-secondary">
        You’ll see all of their sessions, live and afterwards, unless they hide one from you. You can leave at any time.
      </p>
      {signedInAs !== null ? (
        <AcceptInvite token={token} signedInAs={signedInAs} />
      ) : (
        <Button asChild size="lg" className="mt-2">
          <Link href={signInPath(here)}>
            <IconHeadset />
            Sign in to accept
          </Link>
        </Button>
      )}
      {expiresAt !== null ? <p className="text-footnote text-label-secondary">This link works until {formatDay(expiresAt)}.</p> : null}
    </div>
  )
}
