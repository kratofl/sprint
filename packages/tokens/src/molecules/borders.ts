import { primitiveColor } from '../primitive'

/**
 * Border tokens — Figma flat-UI 1px hairlines.
 *
 * `outline` is the quiet structural separator (Border/Default #2E2E2E) used
 * everywhere; emphasis uses Border/Strong #424242. Status borders take the
 * family/700 (Error uses 800) per the Figma semantic set.
 */

export const borders = {
  /** Structural outline — Border/Default #2E2E2E */
  outline:       primitiveColor.neutral[700],
  /** Stronger outline — Border/Strong #424242 */
  outlineSubtle: primitiveColor.neutral[600],
  /** Accent — Primary/Border Orange/700 #BF4D00 */
  accent:        primitiveColor.orange[700],
  /** Error/Border Red/800 #851727 */
  danger:        primitiveColor.red[800],
  /** Success/Border Green/700 #0E7445 */
  success:       primitiveColor.green[700],
  /** Info/Border Blue/700 #114F99 (legacy `teal` alias retained) */
  teal:          primitiveColor.blue[700],
} as const
