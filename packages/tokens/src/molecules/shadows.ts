/** Shadow tokens. Cards and controls stay flat; only the desktop window lifts. */
export const shadows = {
  sm: 'none',
  md: 'none',
  lg: 'none',

  glow:         'none',
  'glow-teal':  'none',
  window:       '0 4px 2px rgba(0,0,0,.14), 0 8px 16px rgba(0,0,0,.14)',

  /** @deprecated compatibility alias; cards are flat. */
  card:  'none',
  /** @deprecated compatibility alias; use borders for separation. */
  modal: 'none',
} as const
