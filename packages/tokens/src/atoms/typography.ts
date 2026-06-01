/**
 * Typography atoms.
 * Bahnschrift: compact Figma display/readout face.
 * IBM Plex Sans: primary app text face.
 * IBM Plex Mono: compact numeric fallback when a true monospace is useful.
 */

export const fontFamily: Record<'display' | 'sans' | 'mono', string[]> = {
  display: ['Bahnschrift', 'IBM Plex Sans Condensed', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
  sans: ['IBM Plex Sans', 'Bahnschrift', 'system-ui', 'sans-serif'],
  mono: ['Bahnschrift', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
}

export const fontWeight = {
  normal:    '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const
