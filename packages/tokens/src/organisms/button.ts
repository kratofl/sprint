/**
 * Button organism tokens — composed from atoms and molecules.
 */
import { gradientAccent, gradientTeal } from '../molecules/gradients'
import { componentTokens } from '../component'

export const button = {
  primary: componentTokens.button.primary,
  secondary: componentTokens.button.secondary,
  destructive: componentTokens.button.destructive,
  /** Default (primary): compatibility gradient that renders as flat orange. */
  defaultBackground: gradientAccent,
  /** Secondary: compatibility gradient that renders as neutral, not cyan-first. */
  secondaryBackground: gradientTeal,
  /** Pressed: subtle scale-down for tactile feedback */
  pressedScale: '0.97',
} as const
