/**
 * Card organism tokens.
 * Cards have a solid neutral outline border; accent variants are opt-in.
 */
import { borders } from '../molecules/borders'
import { surfaces } from '../molecules/surfaces'
import { componentTokens } from '../component'

export const card = {
  background: componentTokens.card.bg,
  border:     componentTokens.card.border,
  radius:     componentTokens.card.radius,
  padding:    componentTokens.card.padding,
  /** Highlighted card (active session, selected item) — accent border */
  accentBorder: borders.accent,
  /** Compatibility cyan variant — explicit comparison call-out only. */
  tealBorder: borders.teal,
} as const
