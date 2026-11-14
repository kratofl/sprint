import { isRecord } from './frames.js'

/**
 * Pure halves of the pit wall windows (pitWallWindows.ts), testable without Electron: what the
 * renderer may ask for, and which windows the host's layout wants open.
 */

export type Bounds = { x: number; y: number; width: number; height: number }

/** A window of the pit wall: the wall itself, a page or a single tile in its own window. */
export type PitWallWindowKey = { kind: 'main' } | { kind: 'page' | 'tile'; id: string }

/** The pages and tiles the layout has in their own windows, with where each last was. */
export type PitWallWindowsWanted = { mainBounds: Bounds | null; detached: { kind: 'page' | 'tile'; id: string; bounds: Bounds | null }[] }

/** Long enough for any id the host makes, short enough that a stray value cannot become a huge query. */
const MAX_ID_LENGTH = 200

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH

/** Narrows `openPitWall(target?)` from the renderer: nothing is the wall, else a page or tile id. Throws on anything else. */
export function readPitWallTarget(value: unknown): PitWallWindowKey {
  if (value === undefined || value === null) return { kind: 'main' }
  if (isRecord(value) && (value.kind === 'page' || value.kind === 'tile') && isId(value.id)) return { kind: value.kind, id: value.id }
  throw new Error('A pit wall page or tile is required.')
}

const TRACE_LAPS = ['current', 'last', 'best', 'target'] as const
export type TraceLap = (typeof TRACE_LAPS)[number]

/** Narrows `pitWallTrace(lap)`; throws on anything but the four laps the host serves. */
export function readTraceLap(value: unknown): TraceLap {
  const lap = TRACE_LAPS.find((candidate) => candidate === value)
  if (!lap) throw new Error('A trace lap is required.')
  return lap
}

const readBounds = (value: unknown): Bounds | null =>
  isRecord(value) && [value.x, value.y, value.width, value.height].every((part) => typeof part === 'number' && Number.isFinite(part))
    ? { x: Number(value.x), y: Number(value.y), width: Number(value.width), height: Number(value.height) }
    : null

/**
 * The windows `state.pitWallLayout` wants beside the wall. Null when the state carries no layout
 * (a failed or partial poll), so a bad poll never closes a window.
 */
export function readPitWallWindows(state: unknown): PitWallWindowsWanted | null {
  if (!isRecord(state) || !isRecord(state.pitWallLayout) || !Array.isArray(state.pitWallLayout.pages)) return null
  const detached: PitWallWindowsWanted['detached'] = []
  for (const page of state.pitWallLayout.pages) {
    if (!isRecord(page) || !isId(page.id)) continue
    if (page.detached === true) detached.push({ kind: 'page', id: page.id, bounds: readBounds(page.bounds) })
    if (!Array.isArray(page.tiles)) continue
    for (const tile of page.tiles) {
      if (isRecord(tile) && isId(tile.id) && tile.detached === true) detached.push({ kind: 'tile', id: tile.id, bounds: readBounds(tile.bounds) })
    }
  }
  return { mainBounds: readBounds(state.pitWallLayout.mainBounds), detached }
}

/** The renderer query that picks a pit wall window's root (src/main.tsx). */
export const pitWallQuery = (key: PitWallWindowKey): string => (key.kind === 'main' ? 'main' : `${key.kind}:${key.id}`)

/**
 * Saved bounds to reopen a window at, or null when they would put it off every screen (a monitor
 * since unplugged): at least 120 × 80 px of its top must sit inside one display's work area.
 */
export function onScreen(bounds: Bounds | null, displays: readonly Bounds[]): Bounds | null {
  if (!bounds || bounds.width < 200 || bounds.height < 150) return null
  const visible = displays.some((display) => {
    const width = Math.min(bounds.x + bounds.width, display.x + display.width) - Math.max(bounds.x, display.x)
    const top = bounds.y >= display.y && bounds.y < display.y + display.height - 80
    return width >= 120 && top
  })
  return visible ? bounds : null
}
