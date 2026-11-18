// The multi-dial popup: when the driver turns a wheel's multi-position dial, the dash shows the
// new position's name in its colour for a moment ("MULTI" above or beside it, the name big). The
// dial position comes from the host's input tracker, not the frame; whether the popup shows, its
// size, inversion and duration are the `dial_change` alert's settings (alerts.ts), and the Rust
// renderer (renderer/src/multi_dial.rs) decides on the wheel when it is up and draws it.
// Here: the popup as a `DashAlertBanner`, for the desktop's Controls tab to draw as a preview, and
// the colours a position can take.

import type { DashAlertSize } from './alerts'
import { dashColor } from './palette'

/**
 * What the popup draws (banner kind `multiDial`): full screen or a strip. `inverted` swaps the
 * colours: a colour fill with dark lettering.
 */
export interface DashMultiDialPopup {
  kind: 'multiDial'
  caption: string
  label: string
  color: string
  inverted: boolean
  displayMode: DashAlertSize
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
