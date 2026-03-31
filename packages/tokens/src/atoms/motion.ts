/**
 * Motion tokens.
 * Live telemetry values MUST use 'instant' — no animation on rapidly updating data.
 */
export const duration = {
  instant: '0ms',    // live data updates — never animate
  fast:    '100ms',  // tooltips, badge state changes
  normal:  '150ms',  // modals, dropdowns, panel transitions
  slow:    '250ms',  // page-level transitions
} as const

export const easing = {
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  out:     'cubic-bezier(0, 0, 0.2, 1)',
  in:      'cubic-bezier(0.4, 0, 1, 1)',
} as const
