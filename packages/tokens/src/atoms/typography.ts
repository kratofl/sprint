/**
 * Typography atoms.
 * Inter is the UI family, Saira is used for tabular telemetry values, and
 * Saira Semi Condensed / Space Grotesk cover Sprint brand moments.
 */

export const fontFamily: Record<'display' | 'sans' | 'mono' | 'wordmark' | 'ui' | 'numeric', string[]> = {
  display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
  wordmark: ['Saira Semi Condensed', 'Inter', 'system-ui', 'sans-serif'],
  sans: ['Inter', 'system-ui', 'sans-serif'],
  ui: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['Saira', 'Inter', 'system-ui', 'sans-serif'],
  numeric: ['Saira', 'Inter', 'system-ui', 'sans-serif'],
}

export const fontWeight = {
  normal:    '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const
