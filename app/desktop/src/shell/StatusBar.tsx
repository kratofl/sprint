import { User } from 'lucide-react'
import type { Account, SprintState } from '../bridge'
import { homeDevices } from '../views/HomeDomain'
import { accountName, initialsFor } from './account'
import type { RunningBuild } from './build'
import { Status } from './Status'
import { TELEMETRY_STATUS_TONE, describeTelemetry } from './telemetry'

/**
 * The 24px bar along the foot of the window: what is connected, always in view. The game link
 * (opens Help & diagnostics), each screen device (opens its page), then on the right
 * the account (with Sprint web on) and the running build: a dev run's branch, else the version,
 * with a tag on a development or pre-release build. `sprint` is null until the host's first state.
 */
export function StatusBar({
  sprint,
  build,
  account,
  onOpenDiagnostics,
  onOpenDevice,
}: {
  sprint: SprintState | null
  build: RunningBuild | null
  /** Null hides it: Sprint web is off. */
  account: { account: Account | null; onOpen: () => void } | null
  onOpenDiagnostics: () => void
  onOpenDevice: (deviceId: string) => void
}) {
  const link = sprint ? describeTelemetry(sprint.telemetry) : null
  const devices = sprint ? homeDevices(sprint) : []
  return (
    <footer className="statusbar">
      <button type="button" className="statusbar-item" disabled={link === null} title={link?.detail ?? undefined} onClick={onOpenDiagnostics}>
        <Status tone={link ? TELEMETRY_STATUS_TONE[link.tone] : 'neutral'} quiet>
          {link?.label ?? 'Loading…'}
        </Status>
      </button>
      {devices.map((entry) => (
        // A live link is the dot alone after the name; any other state says its word too, since
        // status is never colour alone.
        <button
          key={entry.device.id}
          type="button"
          className="statusbar-item"
          aria-label={`${entry.device.name}, ${entry.status.label}`}
          title={`${entry.status.label}: ${entry.status.detail}`}
          onClick={() => onOpenDevice(entry.device.id)}
        >
          <Status tone={entry.status.tone} quiet>
            {entry.connected ? entry.device.name : `${entry.device.name} · ${entry.status.label}`}
          </Status>
        </button>
      ))}
      <span className="statusbar-spacer" />
      {account && <AccountItem account={account.account} onOpen={account.onOpen} />}
      {build && <BuildItem build={build} />}
    </footer>
  )
}

/** Signed in: initials and the account's name; signed out: "Sign in". Either way it opens the account (AccountDialog.tsx). */
function AccountItem({ account, onOpen }: { account: Account | null; onOpen: () => void }) {
  const name = account?.signedIn ? accountName(account) : null
  return (
    <button type="button" className="statusbar-item" title={name ? 'Sprint account' : 'Sign in to Sprint'} disabled={account === null} onClick={onOpen}>
      <span className="account-avatar" aria-hidden="true">
        {name ? initialsFor(name) : <User size={11} strokeWidth={1.8} />}
      </span>
      {name ?? 'Sign in'}
    </button>
  )
}

/**
 * The running build. Dev and beta are one chip in the colour of their app icon: the channel on
 * the darker half, the branch or version on the brighter one (dev red, beta green). Stable is
 * the version alone.
 */
function BuildItem({ build }: { build: RunningBuild }) {
  if (build.kind === 'stable') {
    return (
      <span className="statusbar-item static tabular" title={`Version ${build.version}`}>
        {build.version}
      </span>
    )
  }
  const dev = build.kind === 'development'
  return (
    <span className="statusbar-item static" title={dev ? 'Development build' : `Beta, version ${build.version}`}>
      <span className={dev ? 'build-chip dev' : 'build-chip beta'}>
        <span className="build-chip-channel">{dev ? 'Dev' : 'Beta'}</span>
        <span className="build-chip-name tabular">{dev ? (build.branch ?? 'local') : build.version}</span>
      </span>
    </span>
  )
}
