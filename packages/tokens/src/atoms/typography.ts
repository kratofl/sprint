/**
 * Typography atoms.
 * Barlow Condensed: primary UI font — condensed, technical, racing data feel.
 * JetBrains Mono: all numeric/monospace content — tabular, data-accurate.
 */

export const fontFamily = {
  display: ['Barlow Condensed', 'system-ui', 'sans-serif'],
  sans:    ['Barlow Condensed', 'system-ui', 'sans-serif'],
  mono:    ['JetBrains Mono Variable', 'JetBrains Mono', 'monospace'],
} as const

export const fontWeight = {
  normal:    '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const
