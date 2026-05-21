/**
 * Surface tokens.
 * Desktop neutrals are intentionally flattened to one black base.
 * Only floating overlays stay slightly lifted through opacity/blur.
 */

export const surfaces = {
  base:      '#0a0a0a',
  shell:     '#0a0a0a',
  container: '#0a0a0a',
  elevated:  '#0a0a0a',
  overlay:   '#0a0a0a',
  overlayPanel: 'rgba(10, 10, 10, 0.94)',
  /** restrained inline fill for hover/selected states on the flat base */
  variant:   'rgba(255, 255, 255, 0.02)',
} as const

/** Backward-compat alias */
export const surface = surfaces.container

/** Structural outline border — used for all section/card/table dividers */
export const outlineColor = '#202020'

/** Stronger outline — reserved for floating surfaces and active shell boundaries */
export const outlineStrongColor = '#262626'
