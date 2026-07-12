/**
 * Typography atoms.
 * IBM Plex Sans is the UI family. Numeric telemetry inherits the UI face with
 * tabular numerals so values stay stable without a separate display family.
 */

export const fontFamily: Record<'display' | 'sans' | 'mono' | 'wordmark' | 'ui' | 'numeric', string[]> = {
  display: ['IBM Plex Sans', 'Archivo', 'system-ui', 'sans-serif'],
  wordmark: ['IBM Plex Sans', 'Archivo', 'system-ui', 'sans-serif'],
  sans: ['IBM Plex Sans', 'Archivo', 'system-ui', 'sans-serif'],
  ui: ['IBM Plex Sans', 'Archivo', 'system-ui', 'sans-serif'],
  mono: ['IBM Plex Sans', 'Archivo', 'system-ui', 'sans-serif'],
  numeric: ['IBM Plex Sans', 'Archivo', 'system-ui', 'sans-serif'],
}

export const fontWeight = {
  normal:    '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const
