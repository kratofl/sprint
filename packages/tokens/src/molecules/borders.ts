/**
 * Border tokens.
 *
 * `outline` is the structural separator used everywhere — header bars, sidebar,
 * card edges, table rows, chart areas. Value matches the HTML reference: #2a2a2a.
 *
 * Ghost borders (semi-transparent) are reserved for interactive state overlays
 * and hover highlights only.
 */
import { orange, cyan } from '../atoms/colors'

export const borders = {
  /** Structural outline — header, sidebar, cards, table rows, chart areas */
  outline:     '#2a2a2a',
  /** Subtle variant — dividers inside surfaces */
  outlineSubtle: 'rgba(255, 255, 255, 0.08)',
  /** Accent — orange tint on highlighted/active cards */
  accent:      'rgba(255, 144, 108, 0.30)',
  /** Cyan — secondary call-out highlights */
  teal:        'rgba(90, 248, 251, 0.30)',
} as const
