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

/** Figma heat accent used for small alert labels and progress fills. */
export const heat = {
  400: '#ff8a2a',
  500: '#ff6a00',
  600: '#e85e00',
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

/** Warm neutral scale from the flat Figma theme. */
export const neutral = {
  950: '#090907',
  900: '#12110f',
  850: '#1a1815',
  800: '#24100d',
  750: '#343027',
  700: '#6f675f',
  600: '#8e867d',
  500: '#a9a095',
  400: '#c8bfb2',
  300: '#e6dacb',
  200: '#f6f0e6',
  100: '#fffaf2',
} as const

export const semantic = {
  success:     '#34D399',
  warning:     '#FBBF24',
  destructive: '#ff3b30',
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
