import type { AccountSummary, EngineerInvitePreview, SessionEngineerAccess } from './records'

// What the race-engineer views say: who can see one of your sessions, what an
// invite link is, and the sessions page's driver filter. The API decides access
// (docs/internals/live-telemetry.md → Engineer access); this only words it.

// One line about who can see one of the viewer's own sessions.
export function accessSummary(access: readonly SessionEngineerAccess[]): string {
  if (access.length === 0) return 'You have no race engineers yet.'
  const hidden = access.filter((entry) => !entry.hasAccess)
  if (hidden.length === 0) {
    return access.length === 1 ? `${access[0].engineer.displayName} can see this session.` : `All ${access.length} of your engineers can see this session.`
  }
  if (hidden.length === access.length) return access.length === 1 ? 'Hidden from your engineer.' : `Hidden from all ${access.length} of your engineers.`
  if (hidden.length === 1) return `Hidden from ${hidden[0].engineer.displayName}.`
  return `Hidden from ${hidden.length} of ${access.length} engineers.`
}

// One engineer's row in a session's access card: what they see, and the change
// the row's action makes.
export type AccessRow = {
  engineer: AccountSummary
  status: string
  action: { change: 'exclude' | 'include'; label: string }
}

export function accessRow({ engineer, hasAccess }: SessionEngineerAccess): AccessRow {
  return hasAccess
    ? { engineer, status: 'Can see this session, live and afterwards', action: { change: 'exclude', label: `Hide from ${engineer.displayName}` } }
    : { engineer, status: 'Hidden from this session', action: { change: 'include', label: `Show to ${engineer.displayName}` } }
}

// What an invite link's landing page shows: the driver and an accept button, or why
// it cannot be accepted. `viewerId` is the signed-in account, or null signed out.
export type InviteView =
  | { kind: 'valid'; driver: AccountSummary; expiresAt: string | null }
  | { kind: 'closed'; title: string; body: string }

export function invitePreview({ status, driver, expiresAt }: EngineerInvitePreview, viewerId: string | null): InviteView {
  if (driver === null || status === 'NOT_FOUND') {
    return { kind: 'closed', title: 'This invite doesn’t exist', body: 'Check that you opened the whole link, or ask the driver for a new one.' }
  }
  switch (status) {
    case 'VALID':
      return driver.id === viewerId
        ? { kind: 'closed', title: 'This is your own invite', body: 'Send this link to the person who should be your race engineer.' }
        : { kind: 'valid', driver, expiresAt }
    case 'EXPIRED':
      return { kind: 'closed', title: 'This invite has expired', body: `Invite links work for 7 days. Ask ${driver.displayName} for a new one.` }
    case 'USED':
      return { kind: 'closed', title: 'This invite was already used', body: `Each link works once. Ask ${driver.displayName} for a new one.` }
    case 'REVOKED':
      return {
        kind: 'closed',
        title: 'This invite was withdrawn',
        body: `${driver.displayName} withdrew this link. Ask them for a new one if you still engineer for them.`,
      }
  }
}

// The sessions page's driver filter: 'all', 'me' (the viewer), or another
// driver's account id.
export type DriverFilter = string

type Owned = { isMine: boolean; driver: AccountSummary }

// The filter's options: all, you, then every other driver once, by name.
export function driverFilterOptions(sessions: readonly Owned[]): readonly { value: DriverFilter; label: string }[] {
  const others = new Map<string, string>()
  for (const session of sessions) if (!session.isMine) others.set(session.driver.id, session.driver.displayName)
  const drivers = [...others].sort(([, a], [, b]) => a.localeCompare(b)).map(([value, label]) => ({ value, label }))
  return [{ value: 'all', label: 'All drivers' }, { value: 'me', label: 'You' }, ...drivers]
}

export function matchesDriver(session: Owned, filter: DriverFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'me') return session.isMine
  return !session.isMine && session.driver.id === filter
}
