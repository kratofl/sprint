/**
 * Card organism tokens.
 * Cards have a solid outline border (#2a2a2a) — structural, always visible.
 * Accent/teal border variants are opt-in emphasis on top of the outline.
 */
import { borders } from '../molecules/borders'
import { surfaces } from '../molecules/surfaces'

export const card = {
  background: surfaces.container,
  border:     borders.outline,
  /** Highlighted card (active session, selected item) — accent border */
  accentBorder: borders.accent,
  /** Cyan variant — secondary call-out */
  tealBorder: borders.teal,
} as const
