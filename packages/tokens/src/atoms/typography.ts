/**
 * Typography atoms.
 * Inter is the UI family. Numeric telemetry inherits the UI face with
 * tabular numerals so values stay stable without a separate display family.
 */

export const fontFamily: Record<'display' | 'sans' | 'mono' | 'wordmark' | 'ui' | 'numeric', string[]> = {
  display: ['Inter', 'system-ui', 'sans-serif'],
  wordmark: ['Inter', 'system-ui', 'sans-serif'],
  sans: ['Inter', 'system-ui', 'sans-serif'],
  ui: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['Inter', 'system-ui', 'sans-serif'],
  numeric: ['Inter', 'system-ui', 'sans-serif'],
}

export const fontWeight = {
  normal:    '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const
