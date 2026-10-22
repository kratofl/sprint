import { User } from 'lucide-react'
import type { Account } from '../bridge'
import { accountName, initialsFor } from './account'

/**
 * The account row at the foot of the navigation pane. Signed in: a 24px initials
 * avatar and the account's name. Signed out: "Sign in". Either way it opens the
 * account dialog (AccountDialog.tsx): the sign-in form, or who is signed in.
 * `account` is null until the host's first state arrives.
 */
export function AccountRow({ account, collapsed, onOpen }: { account: Account | null; collapsed: boolean; onOpen: () => void }) {
  const name = account?.signedIn ? accountName(account) : null
  const label = name ?? 'Sign in'
  const tooltip = name ? 'Sprint account' : 'Sign in to Sprint'
  return (
    <button
      type="button"
      className="account-row"
      title={collapsed ? `${label} — ${tooltip}` : tooltip}
      disabled={account === null}
      onClick={onOpen}
    >
      <span className="account-avatar" aria-hidden="true">
        {name ? initialsFor(name) : <User size={14} strokeWidth={1.6} />}
      </span>
      <span className="account-name">{label}</span>
    </button>
  )
}
