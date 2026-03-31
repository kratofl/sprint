/**
 * Card organism tokens.
 * Border is the primary depth signal — no drop shadow on base cards.
 * Use the `accent` border variant to highlight important cards.
 */
import { borders } from '../molecules/borders'
import { surfaces } from '../molecules/surfaces'

export const card = {
  background: surfaces.surface,
  border:     borders.glass,
  /** Highlighted card (active session, selected item) */
  accentBorder: borders.accent,
  /** Inset top-edge glow — simulates overhead light on glass */
  insetHighlight: 'inset 0 1px 0 rgba(255,255,255,0.08)',
} as const
