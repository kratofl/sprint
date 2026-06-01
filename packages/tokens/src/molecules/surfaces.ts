/**
 * Surface tokens from the flat Figma theme.
 * Warm black base with quiet, solid panels and minimal elevation.
 */

export const surfaces = {
  base:      '#090907',
  shell:     '#090907',
  container: '#12110f',
  elevated:  '#1a1815',
  overlay:   '#090907',
  overlayPanel: 'rgba(9, 9, 7, 0.96)',
  /** restrained inline fill for hover/selected states on the flat base */
  variant:   '#1a1815',
} as const

/** Backward-compat alias */
export const surface = surfaces.container

/** Structural outline border — used for all section/card/table dividers */
export const outlineColor = '#343027'

/** Stronger outline — reserved for floating surfaces and active shell boundaries */
export const outlineStrongColor = '#6f675f'
