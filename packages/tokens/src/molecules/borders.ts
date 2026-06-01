/**
 * Border tokens.
 *
 * `outline` is the quiet structural separator used everywhere — header bars, sidebar,
 * card edges, table rows, chart areas.
 *
 * Ghost borders (semi-transparent) are reserved for interactive state overlays
 * and hover highlights only.
 */
import { orange, cyan, semantic } from '../atoms/colors'

export const borders = {
  /** Structural outline — header, sidebar, cards, table rows, chart areas */
  outline:     '#343027',
  /** Subtle variant — dividers inside surfaces */
  outlineSubtle: 'rgba(246, 240, 230, 0.08)',
  /** Accent — orange-500 at 30% opacity, highlighted/active cards */
  accent:      `${orange[500]}4d`,
  /** Red-orange focus/error border from the Figma chip/input states */
  danger:      `${semantic.destructive}cc`,
  /** Cyan — cyan-500 at 30% opacity, secondary call-out highlights */
  teal:        `${cyan[500]}4d`,
} as const
