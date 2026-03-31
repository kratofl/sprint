/**
 * Raw color palette — primitive values only.
 * Do not use these directly in components; consume semantic tokens from tailwind.config.ts.
 */

export const orange = {
  400: '#FFAA8A',
  500: '#ff906c',
  600: '#ff784d',
  700: '#E55C30',
} as const

/** Vibrant cyan — secondary accent, system status, comparison data */
export const cyan = {
  400: '#8afcff',
  500: '#5af8fb',
  600: '#2ae4e8',
  700: '#18c4c8',
} as const

/**
 * @deprecated Use `cyan` for the secondary accent.
 * Kept as alias for any references that haven't been migrated.
 */
export const teal = cyan

/** Near-neutral with a faint warm undertone to complement the orange accent. */
export const neutral = {
  950: '#0a0a0a',
  900: '#0f0f0f',
  850: '#141414',
  800: '#1a1a1a',
  750: '#1f1f1f',
  700: '#2a2a2a',
  600: '#3a3a3a',
  500: '#525252',
  400: '#808080',
  300: '#A1A1AA',
  200: '#D4D4D8',
  100: '#ffffff',
} as const

export const semantic = {
  success:     '#34D399',
  warning:     '#FBBF24',
  destructive: '#F87171',
  info:        '#60A5FA',
  /** Telemetry alert chips (Live, Pit, Gear) */
  tertiary:    '#f1afff',
} as const

/** Six-color data visualization palette — verified ≥3:1 contrast on dark bg. */
export const dataViz = {
  1: '#ff906c', // primary orange — ref/best lap
  2: '#5af8fb', // cyan
  3: '#34D399', // emerald
  4: '#FBBF24', // amber
  5: '#F472B6', // pink
  6: '#A78BFA', // violet
} as const
