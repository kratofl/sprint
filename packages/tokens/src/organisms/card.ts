/**
 * Card organism tokens.
 * Tonal depth — no border on base cards. Background contrast vs page base provides depth.
 * Use the `accent`/`teal` border variants only for intentional call-out emphasis.
 */
import { borders } from '../molecules/borders'
import { surfaces } from '../molecules/surfaces'

export const card = {
  background: surfaces.surface,
  /** Highlighted card (active session, selected item) — opt-in accent border */
  accentBorder: borders.accent,
  /** Teal variant — engineer-originated call-out */
  tealBorder: borders.teal,
} as const
