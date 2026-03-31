/**
 * Border tokens — ghost borders only.
 *
 * Rule: 1px solid borders for sectioning are prohibited. Solid outlines make
 * the system look like a wireframe. Use tonal background shifts for depth.
 *
 * Borders are reserved for functional separation:
 *   - Input fields (resting + focused states)
 *   - Table row dividers
 *   - Accent/teal call-out cards (intentional emphasis)
 */
import { orange, teal } from '../atoms/colors'

export const borders = {
  /** Subtle ghost — table row dividers, inset decorations */
  ghostSubtle: 'rgba(255, 255, 255, 0.08)',
  /** Standard ghost — input field resting state */
  ghost:       'rgba(255, 255, 255, 0.15)',
  /** Strong ghost — input focused state, elevated overlays */
  ghostStrong: 'rgba(255, 255, 255, 0.22)',
  /** Accent — orange tint, highlighted/active card call-outs */
  accent:      'rgba(255, 144, 108, 0.30)',
  /** Teal — engineer-originated call-out highlights */
  teal:        'rgba(30, 165, 140, 0.30)',
} as const
