/**
 * Surface tokens — solid background fills for the tonal depth system.
 * Depth is expressed through stacking progressively lighter tones.
 * No blur/transparency for base surfaces — glassmorphism reserved for overlays only.
 */

export const surfaces = {
  base:     '#0e0e0e',
  surface:  '#1a1919',
  elevated: '#1f1f1f',
  overlay:  '#262626',
  /** 60% opacity variant — for glassmorphic floating surfaces (modals, dropdowns, nav) */
  variant:  'rgba(26, 25, 25, 0.60)',
} as const
