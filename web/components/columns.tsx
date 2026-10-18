import { AccountAvatar } from '@/components/app/account'
import type { Column } from '@/components/app/data-table'
import { Badge } from '@/components/ui/badge'
import { drivenAt } from '@/lib/overview'
import { formatDay } from '@/lib/period'
import type { Session, Setup } from '@/lib/records'

// Session table columns, straight from the fields sessions.graphql selects. The
// driver reads "You" for the viewer's own sessions; a session streaming right now
// is tagged Live.
export const sessionColumns: readonly Column<Session>[] = [
  { header: 'Date', width: 'w-24', cell: (row) => <span className="text-label-secondary tabular-nums">{formatDay(drivenAt(row))}</span> },
  {
    header: 'Track',
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{row.track}</span>
        {row.isLive ? <Badge tone="red">Live</Badge> : null}
      </span>
    ),
  },
  { header: 'Car', cell: (row) => row.car },
  {
    header: 'Driver',
    width: 'w-44',
    hideOnPhone: true,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <AccountAvatar account={row.driver} size="sm" />
        <span className="truncate">{row.isMine ? 'You' : row.driver.displayName}</span>
      </span>
    ),
  },
  { header: 'Type', width: 'w-28', hideOnPhone: true, cell: (row) => row.sessionType },
  { header: 'Game', width: 'w-20', hideOnPhone: true, cell: (row) => <span className="text-label-secondary">{row.game}</span> },
]

export const sessionText = (row: Session) => [row.track, row.car, row.sessionType, row.game, row.driver.displayName]

// Setup table columns, straight from the fields setups.graphql selects.
export const setupColumns: readonly Column<Setup>[] = [
  { header: 'Name', cell: (row) => <span className="font-medium">{row.name}</span> },
  { header: 'Car', cell: (row) => row.car },
  { header: 'Track', hideOnPhone: true, cell: (row) => row.track },
  { header: 'Game', width: 'w-24', hideOnPhone: true, cell: (row) => <span className="text-label-secondary">{row.game}</span> },
  { header: 'Updated', width: 'w-28', align: 'end', cell: (row) => <span className="text-label-secondary tabular-nums">{formatDay(row.updatedAt)}</span> },
]

export const setupText = (row: Setup) => [row.name, row.car, row.track, row.game]
