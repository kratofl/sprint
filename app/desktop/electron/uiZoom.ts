import type { Input } from 'electron'

/** What a zoom key asks for. */
export type ZoomStep = 'in' | 'out' | 'reset'

/** The zoom factors Ctrl/⌘ +/− walk through, the browser's steps between 50% and 200%. */
export const ZOOM_FACTORS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2

/**
 * The zoom step a key press asks for, or null: Ctrl (⌘ on macOS) with +, = (the unshifted + on a
 * US layout), − or 0, on the main keys or the keypad. Alt rules it out, so AltGr combinations on
 * European layouts stay text.
 */
export function zoomStepFor(input: Pick<Input, 'type' | 'key' | 'control' | 'meta' | 'alt'>, isMac: boolean): ZoomStep | null {
  if (input.type !== 'keyDown' || input.alt) return null
  if (isMac ? !input.meta || input.control : !input.control || input.meta) return null
  switch (input.key) {
    case '+':
    case '=':
      return 'in'
    case '-':
    case '_':
      return 'out'
    case '0':
      return 'reset'
    default:
      return null
  }
}

/** The factor after one step from `current`: the next preset up or down, clamped at the ends. */
export function nextZoomFactor(current: number, step: ZoomStep): number {
  if (step === 'reset') return 1
  // A factor between presets (none should be, but Chromium rounds) steps to the nearest one past it.
  const epsilon = 0.001
  if (step === 'in') return ZOOM_FACTORS.find((factor) => factor > current + epsilon) ?? MAX_ZOOM
  return [...ZOOM_FACTORS].reverse().find((factor) => factor < current - epsilon) ?? MIN_ZOOM
}
