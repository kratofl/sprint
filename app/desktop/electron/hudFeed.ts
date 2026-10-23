import { isRecord } from './frames.js'

/** What the host wants of the training HUD, read off each state poll. */
export type HudWanted = {
  open: boolean
  locked: boolean
  /** Which windows the set holds. A change reopens the set, since each window is one reading. */
  readings: string
}

/** One HUD window as the host places it (`/api/compare/hud/windows`), in device-independent pixels. */
export type HudPlacement = {
  id: string
  title: string
  minWidth: number
  minHeight: number
  x: number
  y: number
  width: number
  height: number
}

export const HUD_CLOSED: HudWanted = { open: false, locked: false, readings: '' }

/** `compare.hudOpen` and the `settings.liveCompare` readings and lock, or closed when anything is missing. */
export function readHudWanted(state: unknown): HudWanted {
  if (!isRecord(state) || !isRecord(state.compare) || !isRecord(state.settings)) return HUD_CLOSED
  const settings = state.settings.liveCompare
  if (state.compare.hudOpen !== true || !isRecord(settings)) return HUD_CLOSED
  const panelIds = Array.isArray(settings.panelIds) ? settings.panelIds.filter((id): id is string => typeof id === 'string') : []
  return {
    open: true,
    locked: settings.locked === true,
    readings: `${settings.showDelta === true ? 'delta,' : ''}${panelIds.join(',')}`,
  }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** The host's placements, dropping any entry that is not a whole rectangle. */
export function readHudPlacements(value: unknown): HudPlacement[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): HudPlacement[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.title !== 'string') return []
    const { minWidth, minHeight, x, y, width, height } = entry
    if (![minWidth, minHeight, x, y, width, height].every(isFiniteNumber)) return []
    return [{
      id: entry.id,
      title: entry.title,
      minWidth: Number(minWidth),
      minHeight: Number(minHeight),
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
    }]
  })
}

/** The delta window's id, `HudWindowPlan.DeltaWindowId` on the host. */
export const DELTA_WINDOW_ID = 'delta'

/**
 * What one window is sent of a `/api/compare/frame` snapshot: the delta window its numbers,
 * a chart window only its own panel. The renderer narrows it (bridge.ts `parseHudMessage`);
 * this only picks, so a window is never handed every chart to throw away.
 */
export function hudMessageFor(windowId: string, frame: unknown, locked: boolean): Record<string, unknown> {
  const snapshot = isRecord(frame) ? frame : {}
  if (windowId === DELTA_WINDOW_ID) {
    return { kind: 'delta', locked, targetName: snapshot.targetName ?? null, deltaSeconds: snapshot.deltaSeconds ?? null }
  }
  const panels = Array.isArray(snapshot.panels) ? snapshot.panels : []
  const panel = panels.find((candidate) => isRecord(candidate) && candidate.id === windowId) ?? null
  return { kind: 'chart', locked, panel, domain: snapshot.domain ?? null, carMeters: snapshot.carMeters ?? null }
}
