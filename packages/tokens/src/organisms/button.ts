/**
 * Button organism tokens — composed from atoms and molecules.
 */
import { gradientAccent, gradientTeal } from '../molecules/gradients'

export const button = {
  /** Default (primary): gradient fill — not flat orange */
  defaultBackground: gradientAccent,
  /** Secondary: gradient teal fill */
  secondaryBackground: gradientTeal,
  /** Pressed: subtle scale-down for tactile feedback */
  pressedScale: '0.97',
} as const
