import type { Account } from '../bridge'
import { accountName } from './account'
import { ContentDialog } from './ContentDialog'

/**
 * What the navigation pane's account row opens while signed in: who, on which server, and
 * Sign out or Change server. Signing in (and connecting later) is the Sprint web setup
 * (onboarding/Onboarding.tsx), which the row opens instead while signed out.
 */
export function AccountDialog({
  account,
  signOut,
  onChangeServer,
  onClose,
}: {
  account: Extract<Account, { signedIn: true }>
  signOut: () => Promise<void>
  onChangeServer: () => void
  onClose: () => void
}) {
  return (
    <ContentDialog
      title="Sprint account"
      onCancel={onClose}
      footer={
        <>
          <button type="button" className="button" onClick={() => void signOut().finally(onClose)}>
            Sign out
          </button>
          <button type="button" className="button" onClick={onChangeServer}>
            Change server…
          </button>
          <button type="button" className="button primary" autoFocus onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className="content-dialog-text">
        Signed in as {accountName(account)} ({account.email}) on {account.serverUrl}.
      </p>
    </ContentDialog>
  )
}
