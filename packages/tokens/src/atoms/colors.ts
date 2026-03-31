/**
 * Raw color palette — primitive values only.
 * Do not use these directly in components; consume semantic tokens from tailwind.config.ts.
 */

export const orange = {
  400: '#FB923C',
  500: '#EF8118',
  600: '#D96A10',
  700: '#C2570D',
} as const

export const teal = {
  400: '#25C4A8',
  500: '#1EA58C',
  600: '#15847A',
  700: '#0E6B63',
} as const

/** Near-neutral with a faint warm undertone to complement the orange accent. */
export const neutral = {
  950: '#080809',
  900: '#0F0F11',
  850: '#151518',
  800: '#1C1C21',
  750: '#242429',
  700: '#2E2E35',
  600: '#3B3B42',
  500: '#52525C',
  400: '#71717A',
  300: '#A1A1AA',
  200: '#D4D4D8',
  100: '#F4F4F5',
} as const

export const semantic = {
  success:     '#34D399',
  warning:     '#FBBF24',
  destructive: '#F87171',
  info:        '#60A5FA',
} as const

/** Six-color data visualization palette — verified ≥3:1 contrast on dark bg. */
export const dataViz = {
  1: '#60A5FA', // sky blue
  2: '#A78BFA', // violet
  3: '#34D399', // emerald
  4: '#FBBF24', // amber
  5: '#F472B6', // pink
  6: '#22D3EE', // cyan
} as const
