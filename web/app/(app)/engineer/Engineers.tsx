'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { IconCopy, IconHeadset, IconLink, IconSteeringWheel } from '@tabler/icons-react'
import { AccountAvatar } from '@/components/app/account'
import { FormSheet } from '@/components/app/form-sheet'
import { Group, IconTile, Row, RowText } from '@/components/app/grouped'
import { PageHeader } from '@/components/app/page-header'
import { SettingsEmpty } from '@/components/app/settings-surface'
import { EmptyState } from '@/components/app/states'
import { useToast } from '@/components/app/toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/period'
import type { AccountSummary, Engineers as EngineersData } from '@/lib/records'
import { createEngineerInvite, leaveDriver, removeEngineer, revokeEngineerInvite } from '@/lib/server/actions'
import type { SaveState } from '@/lib/settings'

// Who confirms what: removing an engineer or leaving a driver takes access away
// at once, so both ask first in a sheet.
type Confirm = { kind: 'remove'; account: AccountSummary } | { kind: 'leave'; account: AccountSummary }

// Race engineers, both ways round: the people who engineer for you (and the
// invite links that make more), and the drivers you engineer for. Every change is
// a Server Action; the page refreshes with the API's answer.
export default function Engineers({ data }: { data: EngineersData }) {
  const toast = useToast()
  const [creating, startCreate] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  // Runs an action; confirms with a toast, or shows its error above the cards.
  async function run(action: () => Promise<SaveState>, confirmation: string): Promise<SaveState> {
    setError(null)
    const result = await action()
    if (result.kind === 'saved') toast(confirmation)
    if (result.kind === 'failed') setError(result.message)
    return result
  }

  return (
    <>
      <PageHeader
        title="Race engineers"
        caption="Engineers see all your sessions, live and afterwards, unless you hide one"
        primaryAction={{
          label: 'Create invite link',
          icon: <IconLink />,
          disabled: creating,
          onClick: () => startCreate(async () => void (await run(createEngineerInvite, 'Invite link created'))),
        }}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {data.me !== null && data.me.displayName.trim() === '' ? (
        <Alert variant="info">
          <AlertDescription>
            You have no display name yet, so your race engineers and drivers see you as “Sprint user”.{' '}
            <Link href="/settings" className="font-semibold underline">
              Add one in Settings
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Group title="Your engineers" trailing={data.myEngineers.length > 0 ? `${data.myEngineers.length}` : undefined}>
          {data.myEngineers.length === 0 ? (
            <EmptyState
              icon={IconHeadset}
              title="No race engineers yet"
              body="Create an invite link and send it to the person who should follow your driving."
            />
          ) : (
            data.myEngineers.map(({ engineer, createdAt }) => (
              <Row key={engineer.id}>
                <AccountAvatar account={engineer} size="sm" />
                <RowText title={engineer.displayName} meta={`Engineer since ${formatDay(createdAt)}`} />
                <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'remove', account: engineer })}>
                  Remove
                </Button>
              </Row>
            ))
          )}
        </Group>

        <Group title="Invite links" footer="Each link works once and expires after 7 days. Anyone who has it can use it, so send it directly.">
          {data.myEngineerInvites.length === 0 ? (
            <SettingsEmpty>No open invite links.</SettingsEmpty>
          ) : (
            data.myEngineerInvites.map((invite) => (
              <InviteRow
                key={invite.token}
                url={invite.url}
                expiresAt={invite.expiresAt}
                onCopied={() => toast('Invite link copied')}
                onRevoke={() => run(() => revokeEngineerInvite(invite.token), 'Invite link withdrawn')}
              />
            ))
          )}
        </Group>
      </div>

      <Group title="Drivers you engineer for">
        {data.myDrivers.length === 0 ? (
          <EmptyState
            icon={IconSteeringWheel}
            title="You don’t engineer for anyone yet"
            body="When a driver sends you an invite link, open it to see their sessions here."
          />
        ) : (
          data.myDrivers.map(({ driver, createdAt }) => (
            <Row key={driver.id}>
              <AccountAvatar account={driver} size="sm" />
              <RowText title={driver.displayName} meta={`Since ${formatDay(createdAt)}`} />
              <Button asChild size="sm" variant="secondary">
                <Link href={`/sessions?driver=${encodeURIComponent(driver.id)}`}>Sessions</Link>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'leave', account: driver })}>
                Leave
              </Button>
            </Row>
          ))
        )}
      </Group>

      <FormSheet
        open={confirm !== null}
        title={confirm === null ? '' : confirm.kind === 'remove' ? `Remove ${confirm.account.displayName}?` : `Leave ${confirm.account.displayName}?`}
        description={
          confirm?.kind === 'leave'
            ? 'You stop seeing their sessions, including one they are driving now.'
            : 'They stop seeing your sessions right away, including one you are driving now.'
        }
        submitLabel={confirm?.kind === 'leave' ? 'Leave' : 'Remove'}
        submitVariant="destructive"
        close={() => setConfirm(null)}
        submit={async () => {
          if (confirm === null) return { ok: true }
          const { account } = confirm
          const result =
            confirm.kind === 'remove'
              ? await run(() => removeEngineer(account.id), `${account.displayName} removed`)
              : await run(() => leaveDriver(account.id), `You left ${account.displayName}`)
          return result.kind === 'failed' ? { ok: false, message: result.message } : { ok: true }
        }}
      >
        <p className="text-body text-label-secondary">
          {confirm?.kind === 'leave'
            ? 'To engineer for them again, they need to send you a new invite link.'
            : 'To give them access again, send them a new invite link. Sessions you hid from them stay hidden.'}
        </p>
      </FormSheet>
    </>
  )
}

// One open invite link: the link, its expiry, Copy and Withdraw. The API returns
// only a path when its public web URL is not set, so Copy makes it absolute.
function InviteRow({ url, expiresAt, onCopied, onRevoke }: { url: string; expiresAt: string; onCopied: () => void; onRevoke: () => Promise<SaveState> }) {
  const [revoking, startRevoke] = useTransition()
  return (
    <Row>
      <IconTile icon={IconLink} tone="brand" size={28} />
      <RowText title={url.replace(/^https?:\/\//, '')} meta={`Expires ${formatDay(expiresAt)}`} />
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          const link = new URL(url, window.location.origin).href
          // The clipboard API only exists on https (and localhost); a home server on
          // plain http gets the link in a prompt to copy by hand.
          try {
            await navigator.clipboard.writeText(link)
            onCopied()
          } catch {
            window.prompt('Copy this invite link', link)
          }
        }}
      >
        <IconCopy />
        Copy
      </Button>
      <Button size="sm" variant="secondary" disabled={revoking} onClick={() => startRevoke(async () => void (await onRevoke()))}>
        Withdraw
      </Button>
    </Row>
  )
}
