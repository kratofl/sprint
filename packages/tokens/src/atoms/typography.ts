/**
 * Typography atoms.
 *
 * Figma font stack (self-hosted via Fontsource, offline Wails app — no CDN):
 * - Inter            — primary UI / body / sans
 * - Space Grotesk    — SPRINT wordmark / display
 * - Saira            — numeric telemetry, input hints/counters
 * - Saira Semi Cond. — badges/chips (uppercase)
 * - Sora             — incidental
 *
 * Base UI size is 13px with tabular numerals for telemetry.
 * The exact `font-family` strings match the @fontsource packages exactly.
 */

export const fontFamily: Record<
  'display' | 'sans' | 'mono' | 'wordmark' | 'ui' | 'numeric' | 'condensed' | 'incidental',
  string[]
> = {
  display:    ['Space Grotesk', 'system-ui', 'sans-serif'],
  wordmark:   ['Space Grotesk', 'system-ui', 'sans-serif'],
  sans:       ['Inter', 'system-ui', 'sans-serif'],
  ui:         ['Inter', 'system-ui', 'sans-serif'],
  numeric:    ['Saira', 'system-ui', 'sans-serif'],
  condensed:  ['Saira Semi Condensed', 'system-ui', 'sans-serif'],
  incidental: ['Sora', 'system-ui', 'sans-serif'],
  mono:       ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
}

export const fontWeight = {
  normal:    '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const

/**
 * Type size scale (px) as seen in the Figma file.
 * 9 tagline · 10 section labels · 11 small labels · 12 hints/badges ·
 * 13 base UI · 22 large numeric · 28 wordmark.
 */
export const fontSize = {
  9:  '9px',
  10: '10px',
  11: '11px',
  12: '12px',
  13: '13px',
  22: '22px',
  28: '28px',
} as const
