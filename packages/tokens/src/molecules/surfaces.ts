import { primitiveColor } from '../primitive'

/** Surface tokens from the true-neutral Sprint design language. */

export const surfaces = {
  screen: primitiveColor.neutral[950],
  deep: primitiveColor.neutral[900],
  panel: primitiveColor.neutral[850],
  tile2: primitiveColor.neutral[800],
  tile3: primitiveColor.neutral[750],
  tile4: primitiveColor.neutral[700],

  base: primitiveColor.neutral[950],
  shell: primitiveColor.neutral[900],
  container: primitiveColor.neutral[850],
  elevated: primitiveColor.neutral[800],
  overlay: primitiveColor.neutral[900],
  overlayPanel: primitiveColor.neutral[850],
  /** Deepest inset fill for sliders, nested fields, and hover states. */
  variant: primitiveColor.neutral[750],
} as const

/** Backward-compat alias */
export const surface = surfaces.container

/** Structural outline border — used for all section/card/table dividers */
export const outlineColor = primitiveColor.neutral[600]

/** Stronger outline — reserved for floating surfaces and active shell boundaries */
export const outlineStrongColor = primitiveColor.neutral[500]
