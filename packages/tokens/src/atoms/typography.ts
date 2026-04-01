/**
 * Typography atoms.
 * Space Grotesk: primary UI font — forward-leaning, technical, racing aesthetic.
 *   Headings use Bold + Italic + All Caps.
 * JetBrains Mono: all numeric/monospace content — tabular, data-accurate.
 */

export const fontFamily: Record<'display' | 'sans' | 'mono', string[]> = {
  display: ['Space Grotesk', 'system-ui', 'sans-serif'],
  sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'monospace'],
}

export const fontWeight = {
  normal:    '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const
