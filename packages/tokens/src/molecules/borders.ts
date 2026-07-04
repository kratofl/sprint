import { primitiveColor } from '../primitive'

/**
 * Border tokens.
 *
 * `outline` is the quiet structural separator used everywhere: cards, rows,
 * dividers, and chart areas. Emphasis uses the stronger neutral border.
 */

export const borders = {
  /** Structural outline — cards, table rows, chart areas */
  outline:     primitiveColor.neutral[700],
  /** Stronger neutral outline — inputs, buttons, active boundaries */
  outlineSubtle: primitiveColor.neutral[600],
  /** Accent — racing orange at 30% opacity, highlighted/active cards */
  accent:      primitiveColor.orange[700],
  danger:      primitiveColor.red[800],
  success:     primitiveColor.green[700],
  /** Compatibility cyan — explicit comparison call-outs only */
  teal:        primitiveColor.blue[700],
} as const
