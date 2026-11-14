import { isRecord } from './frames.js'

/** What the host wants of the training HUD, read off each state poll. */
export type HudWanted = {
  /** Training or arranging: either puts the windows up. */
  open: boolean
  /** Arranging: the windows take clicks and the palette is up. Otherwise they are click-through. */
  arranging: boolean
  /** Which windows the set holds. A change reopens the set, since each window is one reading. */
  panelIds: string[]
  showDelta: boolean
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

export const HUD_CLOSED: HudWanted = { open: false, arranging: false, panelIds: [], showDelta: false }

/** The set of windows as one string, so a reading added or removed is one comparison. */
export const readingsKey = (wanted: HudWanted): string => `${wanted.showDelta ? 'delta,' : ''}${wanted.panelIds.join(',')}`

/** `compare.hudOpen`/`compare.arranging` and the `settings.liveCompare` readings, or closed when anything is missing. */
export function readHudWanted(state: unknown): HudWanted {
  if (!isRecord(state) || !isRecord(state.compare) || !isRecord(state.settings)) return HUD_CLOSED
  const settings = state.settings.liveCompare
  const arranging = state.compare.arranging === true
  if ((state.compare.hudOpen !== true && !arranging) || !isRecord(settings)) return HUD_CLOSED
  return {
    open: true,
    arranging,
    panelIds: Array.isArray(settings.panelIds) ? settings.panelIds.filter((id): id is string => typeof id === 'string') : [],
    showDelta: settings.showDelta === true,
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

/** The palette shown while arranging: add a reading, or finish. Not a reading, and never saved. */
export const ARRANGE_WINDOW_ID = 'arrange'

/** Where the palette sits: centred along the top of the primary display's work area. */
export function arrangePlacement(workArea: { x: number; y: number; width: number; height: number }): HudPlacement {
  const width = 520
  const height = 56
  return {
    id: ARRANGE_WINDOW_ID,
    title: 'Arrange the HUD',
    minWidth: width,
    minHeight: height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + 16,
    width,
    height,
  }
}

/**
 * What one window is sent of a `/api/compare/frame` snapshot: the delta window its numbers,
 * a chart window only its own panel, the palette only the readings. Every message carries
 * whether the set is being arranged and which readings are on, so a window can offer its ×.
 * The renderer narrows it (hud/hudModel.ts `parseHudMessage`); this only picks, so a window
 * is never handed every chart to throw away.
 */
export function hudMessageFor(windowId: string, title: string, frame: unknown, wanted: HudWanted): Record<string, unknown> {
  const snapshot = isRecord(frame) ? frame : {}
  const common = { id: windowId, title, arranging: wanted.arranging, readings: { panelIds: wanted.panelIds, showDelta: wanted.showDelta } }
  if (windowId === ARRANGE_WINDOW_ID) return { kind: 'arrange', ...common }
  if (windowId === DELTA_WINDOW_ID) {
    return { kind: 'delta', ...common, targetName: snapshot.targetName ?? null, deltaSeconds: snapshot.deltaSeconds ?? null, carMeters: snapshot.carMeters ?? null }
  }
  const panels = Array.isArray(snapshot.panels) ? snapshot.panels : []
  const panel = panels.find((candidate) => isRecord(candidate) && candidate.id === windowId) ?? null
  return { kind: 'chart', ...common, panel, domain: snapshot.domain ?? null, carMeters: snapshot.carMeters ?? null }
}
