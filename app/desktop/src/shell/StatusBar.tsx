import { User } from 'lucide-react'
import type { Account, SprintState } from '../bridge'
import { homeDevices } from '../views/HomeDomain'
import { accountName, initialsFor } from './account'
import { summarizeDevices } from './deviceSummary'
import type { RunningBuild } from './build'
import { Status } from './Status'
import { TELEMETRY_STATUS_TONE, describeTelemetry } from './telemetry'

/**
 * The 24px bar along the foot of the window: what is connected, always in view. The game link
 * (opens Help & diagnostics), the screen devices counted by state, however many there are
 * ("2 connected · 1 not found", each by name in the tooltip; opens Devices), then on the right
 * the account (with Sprint web on) and the running build: a dev run's branch, else the version,
 * with a tag on a development or pre-release build. `sprint` is null until the host's first state.
 */
export function StatusBar({
  sprint,
  build,
  account,
  onOpenDiagnostics,
  onOpenDevices,
}: {
  sprint: SprintState | null
  build: RunningBuild | null
  /** Null hides it: Sprint web is off. */
  account: { account: Account | null; onOpen: () => void } | null
  onOpenDiagnostics: () => void
  onOpenDevices: () => void
}) {
  const link = sprint ? describeTelemetry(sprint.telemetry) : null
  const devices = sprint
    ? summarizeDevices(homeDevices(sprint).map((entry) => ({ name: entry.device.name, connected: entry.connected, status: entry.status })))
    : null
  return (
    <footer className="statusbar">
      <button type="button" className="statusbar-item" disabled={link === null} title={link?.detail ?? undefined} onClick={onOpenDiagnostics}>
        <Status tone={link ? TELEMETRY_STATUS_TONE[link.tone] : 'neutral'} quiet>
          {link?.label ?? 'Loading…'}
        </Status>
      </button>
      {devices && (
        <button type="button" className="statusbar-item" aria-label={`Devices: ${devices.parts.join(', ')}`} title={devices.detail} onClick={onOpenDevices}>
          <Status tone={devices.tone} quiet>
            Devices · {devices.parts.join(' · ')}
          </Status>
        </button>
      )}
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
