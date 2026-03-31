/**
 * Surface tokens — solid background fills for flat data-app design.
 * Depth is expressed through solid color differences + borders, not blur/transparency.
 */

export const surfaces = {
  base:     '#09090B',
  surface:  '#111114',
  elevated: '#191920',
  overlay:  '#1E1E25',
} as const

/** Solid border values — the primary structural element. */
export const solidBorder = {
  muted:   '#1C1C21',
  DEFAULT: '#26262B',
  strong:  '#3A3A42',
} as const
