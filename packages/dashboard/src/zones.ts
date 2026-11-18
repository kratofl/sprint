// A zoned dash's zones and what may go where (mirrored by `DashZones.cs`, which the host
// validates every saved dash with). The grid is 11 x 9 cells (`ZONE_COLS`/`ZONE_ROWS` in
// `grid.ts`): bar spots down both sides and across the top, a 4 x 8 grid either side, and the
// centre column, whose top three rows are the gear's. The renderer always draws the gear there,
// so no widget may cover it.

import type { GridSpan } from './grid'

export type DashZone = 'barLeft' | 'barRight' | 'top' | 'left' | 'centre' | 'right'

export const ZONED_COLS = 11
export const ZONED_ROWS = 9

export const DASH_ZONES: Readonly<Record<DashZone, GridSpan>> = {
  barLeft: { col: 0, row: 0, colSpan: 1, rowSpan: 9 },
  barRight: { col: 10, row: 0, colSpan: 1, rowSpan: 9 },
  top: { col: 1, row: 0, colSpan: 9, rowSpan: 1 },
  left: { col: 1, row: 1, colSpan: 4, rowSpan: 8 },
  centre: { col: 5, row: 4, colSpan: 1, rowSpan: 5 },
  right: { col: 6, row: 1, colSpan: 4, rowSpan: 8 },
}

/** The gear's spot: the centre column's top three rows. */
export const GEAR_SPOT: GridSpan = { col: 5, row: 1, colSpan: 1, rowSpan: 3 }

/** Widgets with a bar look: the only ones a side bar spot takes. */
export const BAR_WIDGET_TYPES: ReadonlySet<string> = new Set(['bar', 'rpm_bar'])
/** Widgets small enough for the top bar spot, besides the bars. */
export const TOP_WIDGET_TYPES: ReadonlySet<string> = new Set(['position', 'laps', 'time_left', 'flag'])

const inside = (rect: GridSpan, zone: GridSpan): boolean =>
  rect.col >= zone.col && rect.row >= zone.row && rect.col + rect.colSpan <= zone.col + zone.colSpan && rect.row + rect.rowSpan <= zone.row + zone.rowSpan

const same = (a: GridSpan, b: GridSpan): boolean => a.col === b.col && a.row === b.row && a.colSpan === b.colSpan && a.rowSpan === b.rowSpan

const ZONE_ORDER: readonly DashZone[] = ['barLeft', 'barRight', 'top', 'left', 'centre', 'right']

/** The zone `rect` lies wholly in, or null when it straddles zones or covers the gear. */
export function zoneOf(rect: GridSpan): DashZone | null {
  if (rect.colSpan <= 0 || rect.rowSpan <= 0) return null
  return ZONE_ORDER.find((zone) => inside(rect, DASH_ZONES[zone])) ?? null
}

/** Whether a zone takes a widget of `type` at all. */
export function zoneTakes(zone: DashZone, type: string): boolean {
  switch (zone) {
    case 'barLeft':
    case 'barRight':
      return BAR_WIDGET_TYPES.has(type)
    case 'top':
      return BAR_WIDGET_TYPES.has(type) || TOP_WIDGET_TYPES.has(type)
    default:
      return true
  }
}

/** Whether a widget of `type` may sit at `rect`: in one zone that takes it, a side bar spot filled whole. */
export function fitsZone(type: string, rect: GridSpan): boolean {
  const zone = zoneOf(rect)
  if (zone === null || !zoneTakes(zone, type)) return false
  return zone === 'barLeft' || zone === 'barRight' ? same(rect, DASH_ZONES[zone]) : true
}

/** The zone the cell at (`col`, `row`) is in; null on the gear. */
export function zoneAtCell(col: number, row: number): DashZone | null {
  return zoneOf({ col, row, colSpan: 1, rowSpan: 1 })
}

/**
 * Where a new widget of `type` dropped on cell (`col`, `row`) goes: a side bar spot whole, a bar
 * across the whole top, anything else two cells wide (one in the centre column), pulled back inside
 * its zone. Null when that zone does not take it.
 */
export function dropRect(type: string, col: number, row: number): GridSpan | null {
  const zone = zoneAtCell(col, row)
  if (zone === null || !zoneTakes(zone, type)) return null
  const area = DASH_ZONES[zone]
  if (zone === 'barLeft' || zone === 'barRight' || (zone === 'top' && BAR_WIDGET_TYPES.has(type))) return { ...area }
  const colSpan = Math.min(zone === 'centre' ? 1 : 2, area.colSpan)
  return { col: Math.min(col, area.col + area.colSpan - colSpan), row, colSpan, rowSpan: 1 }
}
