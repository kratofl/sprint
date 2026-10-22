'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AccountAvatar } from '@/components/app/account'
import { Group, Row, RowText } from '@/components/app/grouped'
import { SettingsEmpty } from '@/components/app/settings-surface'
import { useToast } from '@/components/app/toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { accessRow, accessSummary } from '@/lib/engineers'
import type { SessionEngineerAccess } from '@/lib/records'
import { setSessionAccess } from '@/lib/server/actions'

// The driver's control over who sees one of their sessions: one switch per
// engineer. Turning one off hides the session from them at once, a live view
// included; turning it on shows it again. The page refreshes with the API's answer.
export default function EngineerAccess({ sessionId, access }: { sessionId: string; access: readonly SessionEngineerAccess[] }) {
  const toast = useToast()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Group title="Engineer access" footer={accessSummary(access)}>
      {access.length === 0 ? (
        <SettingsEmpty>
          <Link href="/engineer" className="text-link hover:underline">
            Invite a race engineer
          </Link>{' '}
          to share your sessions.
        </SettingsEmpty>
      ) : (
        access.map((entry) => {
          const row = accessRow(entry)
          return (
            <Row key={row.engineer.id}>
              <AccountAvatar account={row.engineer} size="sm" />
              <RowText title={row.engineer.displayName} meta={row.status} />
              <Switch
                checked={entry.hasAccess}
                disabled={pending}
                aria-label={row.action.label}
                title={row.action.label}
                onCheckedChange={() =>
                  start(async () => {
                    setError(null)
                    const result = await setSessionAccess(sessionId, row.engineer.id, row.action.change)
                    if (result.kind === 'failed') setError(result.message)
                    if (result.kind === 'saved') {
                      toast(row.action.change === 'exclude' ? `Hidden from ${row.engineer.displayName}` : `Shown to ${row.engineer.displayName}`)
                    }
                  })
                }
              />
            </Row>
          )
        })
      )}
      {error !== null ? (
        <div className="px-4 py-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </Group>
  )
}
