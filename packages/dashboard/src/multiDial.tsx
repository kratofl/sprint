// The multi-dial popup: when the driver turns a wheel's multi-position dial, the dash shows the
// new position's name in its colour for a moment ("MULTI" above, the name big below). Its own
// file because it is not a telemetry alert -- the dial position comes from the host's input
// tracker, not the frame -- and the desktop's Controls tab renders the same component as preview.

import type React from 'react'
import { TextLine } from './primitives'
import { dashColor } from './palette'

/** What the popup draws. `inverted` swaps the colours: a colour fill with black lettering. */
export interface DashMultiDialPopup {
  kind: 'multiDial'
  caption: string
  label: string
  color: string
  inverted: boolean
}

/** The dial as the host reports it, narrowed to what the popup needs. */
export interface MultiDialReading {
  caption: string
  position: number | null
  /** Counts real turns only; the popup shows whenever it moves. */
  changes: number
  positions: ReadonlyArray<{ label: string; color: string }>
  invertPopup: boolean
}

/**
 * The colours a dial position can take: the on-wheel colours the dash palette is built from,
 * so a popup reads well on a USB panel. The desktop offers these as swatches.
 */
export const multiDialSwatches: readonly string[] = [
  dashColor.blue, dashColor.green, dashColor.yellow, dashColor.orange,
  dashColor.red, dashColor.purple, dashColor.text,
]

/**
 * Black or white lettering, whichever reads better on a position's colour (WCAG contrast) --
 * the dash's own ink, so the desktop's coloured dial boxes letter the way the wheel does.
 */
export function multiDialInk(color: string): string {
  const channel = (offset: number): number => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return dashColor.background
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? dashColor.background : dashColor.text
}

/** How long the popup stays up when the layout does not set its own alert duration. */
export const MULTI_DIAL_POPUP_SECONDS = 1.5

/**
 * Decides when the popup is up. The first reading only sets where counting starts -- a dash
 * opening, or the host restarting, is not a turn -- and each later change of `changes` shows
 * the popup for `durationSeconds`. No clock of its own: callers pass `now` in milliseconds.
 */
export class MultiDialPopupWatcher {
  private seen: number | null = null
  private until = 0
  private popup: DashMultiDialPopup | null = null

  observe(reading: MultiDialReading | null, now: number, durationSeconds: number): DashMultiDialPopup | null {
    if (!reading) {
      this.seen = null
      this.popup = null
      return null
    }

    if (this.seen !== null && reading.changes !== this.seen && reading.position !== null) {
      const position = reading.positions[reading.position]
      if (position) {
        this.popup = { kind: 'multiDial', caption: reading.caption, label: position.label, color: position.color, inverted: reading.invertPopup }
        this.until = now + durationSeconds * 1000
      }
    }

    this.seen = reading.changes
    return this.current(now)
  }

  /** The popup still up at `now`, or null once it has run out. */
  current(now: number): DashMultiDialPopup | null {
    if (this.popup && now >= this.until) this.popup = null
    return this.popup
  }

  /** Milliseconds until the popup runs out, for the caller's one timer; null when none is up. */
  remaining(now: number): number | null {
    return this.current(now) ? this.until - now : null
  }
}

/** The popup itself, full screen at an explicit pixel size: the caption small, the name big. */
export function MultiDialPopup({ popup, width, height, background = dashColor.background }: { popup: DashMultiDialPopup; width: number; height: number; background?: string }): React.ReactElement {
  const ink = popup.inverted ? background : popup.color
  return (
    <div style={{ position: 'absolute', inset: 0, width, height, background: popup.inverted ? popup.color : background }}>
      <TextLine text={popup.caption} left={width / 2} top={height * 0.3} size={height * 0.1} color={ink} align="center" maxWidth={width * 0.9} weight="labelBold" sizing="fit" />
      <TextLine text={popup.label} left={width / 2} top={height * 0.58} size={height * 0.4} color={ink} align="center" maxWidth={width * 0.92} weight="labelBold" sizing="fit" />
    </div>
  )
}
