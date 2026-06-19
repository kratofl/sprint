import { primitiveColor } from '../primitive'

/** Surface tokens from the true-neutral Sprint design language. */

export const surfaces = {
  screen: primitiveColor.neutral[950],
  deep: primitiveColor.neutral[950],
  panel: primitiveColor.neutral[900],
  tile2: primitiveColor.neutral[800],
  tile3: primitiveColor.neutral[750],
  tile4: primitiveColor.neutral[700],

  base: primitiveColor.neutral[950],
  shell: primitiveColor.neutral[950],
  container: primitiveColor.neutral[900],
  elevated: primitiveColor.neutral[800],
  overlay: primitiveColor.neutral[950],
  overlayPanel: primitiveColor.neutral[900],
  /** Deepest inset fill for sliders, nested fields, and hover states. */
  variant: primitiveColor.neutral[750],
} as const

/** Backward-compat alias */
export const surface = surfaces.container

/** Structural outline border — used for all section/card/table dividers */
export const outlineColor = primitiveColor.neutral[600]

/** Stronger outline — reserved for floating surfaces and active shell boundaries */
export const outlineStrongColor = primitiveColor.neutral[500]
