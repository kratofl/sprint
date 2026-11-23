import type { PitWallTile } from './pitWallData'

// The timing tile's columns: the one list the table, its grid and the inspector all read. The host
// repeats the ids (PitWallLayouts.TimingColumns) to check a saved layout.

export type TimingColumn =
  | 'place'
  | 'gained'
  | 'classBar'
  | 'number'
  | 'driver'
  | 'tyre'
  | 'laps'
  | 'gap'
  | 'interval'
  | 'last'
  | 'lastSectors'
  | 'best'
  | 'pit'
  | 'classPlace'
  | 'classTag'
  | 'car'
  | 'bestSectors'
  | 'start'
  | 'penalties'

/**
 * How a column is drawn: its header cells, its name in the inspector, its grid tracks and how its
 * cells align. The sector columns are three tracks that move and hide as one.
 */
type ColumnSpec = { heads: readonly string[]; label: string; tracks: readonly string[]; align: 'r' | 'c' | null }

export const TIMING_COLUMN_SPECS: Record<TimingColumn, ColumnSpec> = {
  place: { heads: ['P'], label: 'Position', tracks: ['22px'], align: null },
  gained: { heads: ['+/−'], label: 'Places gained', tracks: ['30px'], align: null },
  classBar: { heads: [''], label: 'Class colour', tracks: ['4px'], align: null },
  number: { heads: ['#'], label: 'Car number', tracks: ['28px'], align: null },
  // The flexible one: it takes the width the others leave, and carries the flags and tags.
  driver: { heads: ['Driver'], label: 'Driver', tracks: ['minmax(0, 1fr)'], align: null },
  tyre: { heads: ['Tyre'], label: 'Tyre', tracks: ['30px'], align: 'c' },
  laps: { heads: ['Laps'], label: 'Laps', tracks: ['34px'], align: 'r' },
  gap: { heads: ['Gap'], label: 'Gap to leader', tracks: ['56px'], align: 'r' },
  interval: { heads: ['Int'], label: 'Interval', tracks: ['48px'], align: 'r' },
  last: { heads: ['Last'], label: 'Last lap', tracks: ['58px'], align: 'r' },
  lastSectors: { heads: ['S1', 'S2', 'S3'], label: 'Last sectors', tracks: ['42px', '42px', '42px'], align: 'r' },
  best: { heads: ['Best'], label: 'Best lap', tracks: ['56px'], align: 'r' },
  pit: { heads: ['Pit'], label: 'Pit stops', tracks: ['36px'], align: 'c' },
  classPlace: { heads: ['PIC'], label: 'Class position', tracks: ['28px'], align: 'r' },
  classTag: { heads: ['Class'], label: 'Class', tracks: ['52px'], align: null },
  car: { heads: ['Car'], label: 'Car', tracks: ['96px'], align: null },
  bestSectors: { heads: ['BS1', 'BS2', 'BS3'], label: 'Best sectors', tracks: ['42px', '42px', '42px'], align: 'r' },
  start: { heads: ['Grid'], label: 'Start position', tracks: ['34px'], align: 'r' },
  penalties: { heads: ['Pen'], label: 'Penalties', tracks: ['36px'], align: 'c' },
}

/** Every column, in the order the inspector offers hidden ones. */
export const TIMING_COLUMNS: readonly TimingColumn[] = [
  'place',
  'classPlace',
  'gained',
  'start',
  'classBar',
  'classTag',
  'number',
  'driver',
  'car',
  'tyre',
  'laps',
  'gap',
  'interval',
  'last',
  'lastSectors',
  'best',
  'bestSectors',
  'pit',
  'penalties',
]

/** The columns a tile shows until the engineer picks its own (`timingColumns` null). */
export const DEFAULT_TIMING_COLUMNS: readonly TimingColumn[] = ['place', 'gained', 'classBar', 'number', 'driver', 'tyre', 'laps', 'gap', 'interval', 'last', 'lastSectors', 'best', 'pit']

export const isTimingColumn = (value: unknown): value is TimingColumn => TIMING_COLUMNS.some((column) => column === value)

/** A list a tile may keep: Driver in it, nothing twice. */
export const validColumns = (columns: readonly TimingColumn[]): boolean => columns.includes('driver') && new Set(columns).size === columns.length

export const shownColumns = (tile: Pick<PitWallTile, 'timingColumns'>): readonly TimingColumn[] => tile.timingColumns ?? DEFAULT_TIMING_COLUMNS

export const hiddenColumns = (shown: readonly TimingColumn[]): TimingColumn[] => TIMING_COLUMNS.filter((column) => !shown.includes(column))

/** The table's `grid-template-columns` for the shown columns. */
export const gridTemplate = (shown: readonly TimingColumn[]): string => shown.flatMap((column) => TIMING_COLUMN_SPECS[column].tracks).join(' ')

/**
 * Where a car out of the race says so ("DNF · lap 22"): across Gap and Int when they sit side by
 * side (from whichever comes first), else in Gap, else in Int; nowhere when both are hidden.
 */
export function outNoteAt(shown: readonly TimingColumn[]): { column: 'gap' | 'interval'; span: 1 | 2 } | null {
  const gap = shown.indexOf('gap')
  const interval = shown.indexOf('interval')
  if (gap >= 0 && interval >= 0 && Math.abs(gap - interval) === 1) return { column: gap < interval ? 'gap' : 'interval', span: 2 }
  if (gap >= 0) return { column: 'gap', span: 1 }
  return interval >= 0 ? { column: 'interval', span: 1 } : null
}
