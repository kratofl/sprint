// The multi-dial popup: when the driver turns a wheel's multi-position dial, the dash shows the
// new position's name in its colour for a moment ("MULTI" above, the name big below). It is not a
// telemetry alert -- the dial position comes from the host's input tracker, not the frame -- and
// the Rust renderer (renderer/src/multi_dial.rs) decides on the wheel when it is up and draws it.
// Here: the popup as a `DashAlertBanner`, for the desktop's Controls tab to draw as a preview, and
// the colours a position can take.

import { dashColor } from './palette'

/** What the popup draws (banner kind `multiDial`). `inverted` swaps the colours: a colour fill with dark lettering. */
export interface DashMultiDialPopup {
  kind: 'multiDial'
  caption: string
  label: string
  color: string
  inverted: boolean
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

/** How long the popup stays up when the layout does not set its own alert duration (the renderer's `MULTI_DIAL_POPUP_SECONDS`). */
export const MULTI_DIAL_POPUP_SECONDS = 1.5
