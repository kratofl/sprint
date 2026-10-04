import { User } from 'lucide-react'
import { initialsFor } from './account'

/**
 * The account row at the foot of the navigation pane: a 24px initials avatar
 * and the driver name from Settings. Accounts live on the web app, so the row
 * opens its sign-in page in the system browser (`target="_blank"` is routed
 * there by `main.ts`'s `setWindowOpenHandler`) rather than reproducing a
 * sign-in form here.
 *
 * The host exposes no signed-in/account state (no `CloudSession` in
 * `/api/state`), so the name is the local driver profile; with no name set the
 * row reads "Sign in".
 */
export function AccountRow({ webAppUrl, driverName, collapsed }: { webAppUrl: string | null; driverName: string | null; collapsed: boolean }) {
  const href = webAppUrl === null ? undefined : `${webAppUrl.replace(/\/+$/, '')}/sign-in`
  const name = driverName ?? 'Sign in'
  const tooltip = href ? 'Sign in on the Sprint web app' : 'Set the Sprint web app address in Settings to sign in'
  return (
    <a
      className="account-row"
      href={href}
      target={href ? '_blank' : undefined}
      rel={href ? 'noreferrer' : undefined}
      aria-disabled={!href}
      title={collapsed ? `${name} — ${tooltip}` : tooltip}
      onClick={(event) => {
        if (!href) event.preventDefault()
      }}
    >
      <span className="account-avatar" aria-hidden="true">
        {driverName ? initialsFor(driverName) : <User size={14} strokeWidth={1.6} />}
      </span>
      <span className="account-name">{name}</span>
    </a>
  )
}
