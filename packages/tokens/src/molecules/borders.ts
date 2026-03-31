/**
 * Border tokens — named semantic values for consistent border usage.
 * More visible than the previous ghost-rgba system.
 * Borders are the primary visual separator on dark surfaces.
 */
import { neutral, orange, teal } from '../atoms/colors'

export const borders = {
  /** Faint — used inside glass surfaces (e.g. table row dividers) */
  glassSubtle:  'rgba(255,255,255,0.08)',
  /** Standard — outer edge of cards, panels */
  glass:        'rgba(255,255,255,0.11)',
  /** Strong — elevated surfaces, active/focused elements */
  glassStrong:  'rgba(255,255,255,0.17)',
  /** Hard — input fields, table borders, solid lines */
  solid:        neutral[700],
  /** Accent — orange tint, highlighted/active card borders */
  accent:       'rgba(239,129,24,0.38)',
  /** Teal — engineer-originated highlights */
  teal:         'rgba(30,165,140,0.38)',
} as const
