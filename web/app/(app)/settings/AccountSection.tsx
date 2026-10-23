'use client'

import { useActionState } from 'react'
import { TextField } from '@/components/app/field'
import { SettingsBlock, SettingsRow, SettingsSection } from '@/components/app/settings-surface'
import { Button } from '@/components/ui/button'
import type { Account } from '@/lib/records'
import { changePassword, saveDisplayName } from '@/lib/server/actions'
import { confirmPasswordError, displayNameError, idle, newPasswordError } from '@/lib/settings'
import { SaveError, useSavedToast } from './feedback'

// Account settings: the display name and the password, each its own form, and
// whether the account signs in with Discord. A save confirms with a toast; a
// failure shows inline. React resets a form after its action, so the password
// fields clear and the name field shows the saved name. A Discord account without
// a password can set a first one if it has an email to sign in with.
export default function AccountSection({ account }: { account: Account }) {
  const [nameState, nameAction, isSavingName] = useActionState(saveDisplayName, idle)
  const [passwordState, passwordAction, isChangingPassword] = useActionState(changePassword, idle)
  useSavedToast(nameState, 'Display name saved')
  // One message for both: after a first password the page refreshes with hasPassword set, and a
  // message that changed with it would raise the toast again.
  useSavedToast(passwordState, 'Password saved')

  return (
    <SettingsSection title="Account" aside={<span className="text-footnote text-label-secondary">{account.email || 'Signed in with Discord'}</span>}>
      <SettingsBlock>
        <form className="space-y-3" action={nameAction}>
          <div className="flex flex-wrap items-end gap-2">
            <TextField
              className="w-full max-w-72"
              label="Display name"
              name="displayName"
              autoComplete="nickname"
              defaultValue={account.displayName}
              validate={displayNameError}
            />
            <Button type="submit" variant="secondary" disabled={isSavingName}>
              {isSavingName ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <SaveError state={nameState} />
        </form>
      </SettingsBlock>

      {account.discordLinked ? <SettingsRow title="Discord" description="You can sign in with Discord." /> : null}

      {account.hasPassword || account.email !== '' ? (
        <SettingsBlock>
          <form className="space-y-3" action={passwordAction}>
            <h3 className="text-callout font-semibold">{account.hasPassword ? 'Password' : 'Set a password'}</h3>
            {account.hasPassword ? null : (
              <p className="text-footnote text-label-secondary">Add a password to also sign in with {account.email}.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {account.hasPassword ? (
                <TextField
                  className="sm:col-span-2 sm:max-w-[calc(50%-6px)]"
                  label="Current password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                />
              ) : null}
              <TextField label="New password" name="newPassword" type="password" autoComplete="new-password" validate={newPasswordError} />
              <TextField
                label="Confirm new password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                validate={(confirmation, form) => confirmPasswordError(fieldValue(form, 'newPassword'), confirmation)}
              />
            </div>
            <SaveError state={passwordState} />
            <Button type="submit" variant="secondary" disabled={isChangingPassword}>
              {isChangingPassword ? 'Saving…' : account.hasPassword ? 'Change password' : 'Set password'}
            </Button>
          </form>
        </SettingsBlock>
      ) : (
        <SettingsRow title="Password" description="Your account has no email address, so it signs in with Discord only." />
      )}
    </SettingsSection>
  )
}

// The current value of a sibling input in the same form; '' when absent.
function fieldValue(form: HTMLFormElement | null, name: string): string {
  const input = form?.elements.namedItem(name)
  return input instanceof HTMLInputElement ? input.value : ''
}
