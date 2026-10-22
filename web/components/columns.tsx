import type { Session, Setup } from '@/lib/records'
import { drivenAt } from '@/lib/overview'
import { formatDay } from '@/lib/period'
import type { Column } from './Table'

// Session table columns, straight from the fields sessions.graphql selects.
export const sessionColumns: readonly Column<Session>[] = [
  { header: 'Date', cell: (row) => <span className="cell-muted">{formatDay(drivenAt(row))}</span> },
  { header: 'Track', cell: (row) => <span className="cell-strong">{row.track}</span> },
  { header: 'Car', cell: (row) => row.car },
  { header: 'Type', cell: (row) => row.sessionType },
  { header: 'Game', cell: (row) => <span className="cell-muted">{row.game}</span> },
]
export const sessionTemplate = '64px minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1fr) 80px'

export const sessionText = (row: Session) => [row.track, row.car, row.sessionType, row.game]

// Setup table columns, straight from the fields setups.graphql selects.
export const setupColumns: readonly Column<Setup>[] = [
  { header: 'Name', cell: (row) => <span className="cell-strong">{row.name}</span> },
  { header: 'Car', cell: (row) => row.car },
  { header: 'Track', cell: (row) => row.track },
  { header: 'Game', cell: (row) => <span className="cell-muted">{row.game}</span> },
  { header: 'Updated', align: 'end', cell: (row) => <span className="cell-muted">{formatDay(row.updatedAt)}</span> },
]
export const setupTemplate = 'minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1.2fr) 80px 72px'

export const setupText = (row: Setup) => [row.name, row.car, row.track, row.game]
