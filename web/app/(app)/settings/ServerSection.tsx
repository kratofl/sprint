'use client'

import { startTransition, useActionState, useId, useOptimistic } from 'react'
import { TextField } from '@/components/app/field'
import { SettingsBlock, SettingsRow, SettingsSection } from '@/components/app/settings-surface'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { EditableServerSettings } from '@/lib/records'
import { saveServerSettings } from '@/lib/server/actions'
import { idle, instanceNameError } from '@/lib/settings'
import { SaveError, useSavedToast } from './feedback'

// Server settings, for admins only (the API enforces that too): the server's
// name, saved with a button, and whether new accounts may register — a switch
// that applies at once and flips optimistically.
export default function ServerSection({ settings }: { settings: EditableServerSettings }) {
  const [nameState, nameAction, isSavingName] = useActionState(saveServerSettings, idle)
  const [registrationState, registrationAction] = useActionState(saveServerSettings, idle)
  const [allowRegistration, setAllowRegistration] = useOptimistic(settings.allowRegistration)
  const switchLabel = useId()
  useSavedToast(nameState, 'Server name saved')
  useSavedToast(registrationState, allowRegistration ? 'New accounts allowed' : 'New accounts closed')

  // The API takes both fields together, so the switch sends the current name along.
  const setRegistration = (allow: boolean) => {
    const form = new FormData()
    form.set('instanceName', settings.instanceName)
    form.set('allowRegistration', String(allow))
    startTransition(() => {
      setAllowRegistration(allow)
      registrationAction(form)
    })
  }

  return (
    <SettingsSection title="Server" description="Applies to everyone on this server">
      <SettingsBlock>
        <form className="space-y-3" action={nameAction}>
          <input type="hidden" name="allowRegistration" value={String(settings.allowRegistration)} />
          <div className="flex flex-wrap items-end gap-2">
            <TextField
              className="w-full max-w-72"
              label="Server name"
              name="instanceName"
              autoComplete="off"
              defaultValue={settings.instanceName}
              validate={instanceNameError}
            />
            <Button type="submit" variant="secondary" disabled={isSavingName}>
              {isSavingName ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <SaveError state={nameState} />
        </form>
      </SettingsBlock>
      <SettingsRow
        title={<span id={switchLabel}>Allow new accounts</span>}
        description="When off, only people who already have an account can sign in."
      >
        <Switch checked={allowRegistration} onCheckedChange={setRegistration} aria-labelledby={switchLabel} />
      </SettingsRow>
      {registrationState.kind === 'failed' ? (
        <SettingsBlock>
          <SaveError state={registrationState} />
        </SettingsBlock>
      ) : null}
    </SettingsSection>
  )
}
