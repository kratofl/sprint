'use client'

import { useActionState } from 'react'
import { Card } from '@/components/Card'
import Field from '@/components/Field'
import SaveFeedback from '@/components/SaveFeedback'
import type { Account } from '@/lib/records'
import { changePassword, saveDisplayName } from '@/lib/server/actions'
import { confirmPasswordError, displayNameError, idle, newPasswordError } from '@/lib/settings'

// Account settings: the display name and the password, each its own form with
// inline feedback. React resets a form after its action, so the password
// fields clear and the name field shows the saved name.
export default function AccountSection({ account }: { account: Account }) {
  const [nameState, nameAction, isSavingName] = useActionState(saveDisplayName, idle)
  const [passwordState, passwordAction, isChangingPassword] = useActionState(changePassword, idle)

  return (
    <Card title="Account" action={<span className="card-meta">{account.email}</span>}>
      <form className="setting-form" action={nameAction}>
        <div className="inline-form">
          <Field
            label="Display name"
            name="displayName"
            autoComplete="nickname"
            defaultValue={account.displayName}
            validate={displayNameError}
          />
          <button type="submit" className="btn btn-secondary" disabled={isSavingName}>
            {isSavingName ? 'Saving…' : 'Save'}
          </button>
          <SaveFeedback state={nameState} />
        </div>
      </form>

      <form className="setting-form setting-divided" action={passwordAction}>
        <h3 className="setting-heading">Password</h3>
        <div className="field-grid">
          <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" />
          <Field
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            validate={newPasswordError}
          />
          <Field
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            validate={(confirmation, form) => confirmPasswordError(fieldValue(form, 'newPassword'), confirmation)}
          />
        </div>
        <div className="setting-actions">
          <button type="submit" className="btn btn-secondary" disabled={isChangingPassword}>
            {isChangingPassword ? 'Changing…' : 'Change password'}
          </button>
          <SaveFeedback state={passwordState} />
        </div>
      </form>
    </Card>
  )
}

// The current value of a sibling input in the same form; '' when absent.
function fieldValue(form: HTMLFormElement | null, name: string): string {
  const input = form?.elements.namedItem(name)
  return input instanceof HTMLInputElement ? input.value : ''
}
