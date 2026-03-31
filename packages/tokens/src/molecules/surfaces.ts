/**
 * Surface tokens.
 * Surfaces: #0a0a0a (page) → #141414 (container) → #1f1f1f (elevated).
 * Outline: #2a2a2a — used for structural borders (header, sidebar, cards, tables).
 */

export const surfaces = {
  base:      '#0a0a0a',
  container: '#141414',
  elevated:  '#1f1f1f',
  overlay:   '#262626',
  /** 60% opacity variant — for glassmorphic floating overlays (modals, dropdowns) */
  variant:   'rgba(20, 20, 20, 0.70)',
} as const

/** Backward-compat alias */
export const surface = surfaces.container

/** Structural outline border — used for all section/card/table dividers */
export const outlineColor = '#2a2a2a'
