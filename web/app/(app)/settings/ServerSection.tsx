'use client'

import { useActionState, useId, useOptimistic } from 'react'
import { Card } from '@/components/Card'
import Field from '@/components/Field'
import SaveFeedback from '@/components/SaveFeedback'
import type { ServerSettings } from '@/lib/records'
import { saveServerSettings } from '@/lib/server/actions'
import { idle, instanceNameError } from '@/lib/settings'

// Server settings, for admins only (the API enforces that too): the server's
// name, saved with a button, and whether new accounts may register — a switch
// that applies at once (DESIGN.md → Switch) and flips optimistically.
export default function ServerSection({ settings }: { settings: ServerSettings }) {
  const [nameState, nameAction, isSavingName] = useActionState(saveServerSettings, idle)
  const [registrationState, registrationAction] = useActionState(saveServerSettings, idle)
  const [allowRegistration, setAllowRegistration] = useOptimistic(settings.allowRegistration)
  const switchLabel = useId()

  return (
    <Card title="Server" action={<span className="card-meta">Applies to everyone on this server</span>}>
      <form className="setting-form" action={nameAction}>
        <input type="hidden" name="allowRegistration" value={String(settings.allowRegistration)} />
        <div className="inline-form">
          <Field
            label="Server name"
            name="instanceName"
            autoComplete="off"
            defaultValue={settings.instanceName}
            validate={instanceNameError}
          />
          <button type="submit" className="btn btn-secondary" disabled={isSavingName}>
            {isSavingName ? 'Saving…' : 'Save'}
          </button>
          <SaveFeedback state={nameState} />
        </div>
      </form>

      <form
        className="setting-form setting-divided"
        action={(form) => {
          setAllowRegistration(!allowRegistration)
          registrationAction(form)
        }}
      >
        <input type="hidden" name="instanceName" value={settings.instanceName} />
        <input type="hidden" name="allowRegistration" value={String(!allowRegistration)} />
        <div className="setting">
          <span className="setting-text">
            <span id={switchLabel} className="setting-label">
              Allow new accounts
            </span>
            <span className="setting-hint">When off, only people who already have an account can sign in.</span>
          </span>
          <SaveFeedback state={registrationState} />
          <button type="submit" role="switch" aria-checked={allowRegistration} aria-labelledby={switchLabel} className="switch" />
        </div>
      </form>
    </Card>
  )
}
