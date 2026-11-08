import { isRecord } from './frames.js'

/**
 * Pure halves of the dash designer windows (designerWindows.ts), testable without Electron.
 */

/** Long enough for any id the host makes, short enough that a stray value cannot become a huge query. */
const MAX_DASH_ID_LENGTH = 200

/** Narrows `openDashDesigner(dashId)` from the renderer; throws on anything but a plausible id. */
export function readDesignerDashId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_DASH_ID_LENGTH) {
    throw new Error('A dash id is required.')
  }
  return value
}

/**
 * The ids of every dash in a host state. Null when the state carries no dash list (a failed or
 * partial poll), so a bad poll never closes a designer.
 */
export function readDashIds(state: unknown): Set<string> | null {
  if (!isRecord(state) || !Array.isArray(state.dashLayouts)) return null
  const ids = new Set<string>()
  for (const row of state.dashLayouts) {
    if (isRecord(row) && typeof row.id === 'string') ids.add(row.id)
  }
  return ids
}
