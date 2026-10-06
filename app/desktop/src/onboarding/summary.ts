import type { SprintState, SyncDirection, SyncReport } from '../bridge'

/** What this PC holds that the sync would move. */
export type LocalCounts = { sessions: number; setups: number; dashes: number }

/** Counts from the polled state: recorded sessions, the driver's own setups (no templates) and dashes. */
export const localCounts = (state: SprintState): LocalCounts => ({
  sessions: state.lapHistory.length,
  setups: state.setupPrograms.filter((program) => program.isTemplate !== true).length,
  dashes: state.dashLayouts.length,
})

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "3 sessions, 1 setup and 2 dashes" — the transfer step's sentence. */
export const localSummary = (counts: LocalCounts): string => {
  const parts = [
    counts.sessions > 0 ? plural(counts.sessions, 'session', 'sessions') : null,
    counts.setups > 0 ? plural(counts.setups, 'setup', 'setups') : null,
    counts.dashes > 0 ? plural(counts.dashes, 'dash', 'dashes') : null,
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) return 'nothing to move yet'
  const last = parts.pop()
  return parts.length > 0 ? `${parts.join(', ')} and ${last}` : `${last}`
}

/** One sentence about a finished sync: what moved, what was kept, and why it stopped if it did. */
export const syncReportText = (direction: SyncDirection, report: SyncReport): string => {
  const moved = direction === 'upload' ? report.uploaded : report.downloaded
  const parts: string[] = []
  if (!report.ok) {
    parts.push(report.error)
    if (moved > 0) parts.push(`${moved} ${direction === 'upload' ? 'uploaded' : 'downloaded'} before it stopped.`)
    return parts.join(' ')
  }
  if (moved > 0) parts.push(`${direction === 'upload' ? 'Uploaded' : 'Downloaded'} ${plural(moved, 'item', 'items')}.`)
  else parts.push(direction === 'upload' ? 'Everything was already on the web.' : 'This PC already had everything.')
  if (report.conflicts > 0) parts.push(`Kept this PC’s version of ${report.conflicts} changed on both sides.`)
  if (report.removedLocally > 0) parts.push(`${plural(report.removedLocally, 'finished session now lives', 'finished sessions now live')} only on the web.`)
  return parts.join(' ')
}
