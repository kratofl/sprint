import { primitiveColor } from '../primitive'

/**
 * Border tokens.
 *
 * `outline` is the quiet structural separator used everywhere: cards, rows,
 * dividers, and chart areas. Emphasis uses the stronger neutral border.
 */

export const borders = {
  /** Structural outline — cards, table rows, chart areas */
  outline:     primitiveColor.neutral[600],
  /** Stronger neutral outline — inputs, buttons, active boundaries */
  outlineSubtle: primitiveColor.neutral[500],
  /** Accent — racing orange at 30% opacity, highlighted/active cards */
  accent:      'rgba(255,106,0,.30)',
  danger:      '#851727',
  success:     '#0e7445',
  /** Compatibility cyan — explicit comparison call-outs only */
  teal:        'rgba(31,127,230,.30)',
} as const
