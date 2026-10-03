import type { SessionSummary, SetupSummary } from '@/lib/gql/generated'
import { formatDay } from '@/lib/period'
import type { Column } from './Table'

// Session table columns, straight from the API's SessionSummary.
export const sessionColumns: readonly Column<SessionSummary>[] = [
  { header: 'Date', cell: (row) => <span className="cell-muted">{formatDay(row.createdAt)}</span> },
  { header: 'Track', cell: (row) => <span className="cell-strong">{row.track}</span> },
  { header: 'Car', cell: (row) => row.car },
  { header: 'Type', cell: (row) => row.sessionType },
  { header: 'Game', cell: (row) => <span className="cell-muted">{row.game}</span> },
]
export const sessionTemplate = '64px minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1fr) 80px'

export const sessionText = (row: SessionSummary) => [row.track, row.car, row.sessionType, row.game]

// Setup table columns, straight from the API's SetupSummary.
export const setupColumns: readonly Column<SetupSummary>[] = [
  { header: 'Name', cell: (row) => <span className="cell-strong">{row.name}</span> },
  { header: 'Car', cell: (row) => row.car },
  { header: 'Track', cell: (row) => row.track },
  { header: 'Game', cell: (row) => <span className="cell-muted">{row.game}</span> },
  { header: 'Updated', align: 'end', cell: (row) => <span className="cell-muted">{formatDay(row.updatedAt)}</span> },
]
export const setupTemplate = 'minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1.2fr) 80px 72px'

export const setupText = (row: SetupSummary) => [row.name, row.car, row.track, row.game]
