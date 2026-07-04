import { primitiveColor } from '../primitive'

/** Surface tokens from the true-neutral Sprint design language. */

export const surfaces = {
  screen: primitiveColor.neutral[950],
  deep: primitiveColor.neutral[950],
  panel: primitiveColor.neutral[925],
  tile2: primitiveColor.neutral[900],
  tile3: primitiveColor.neutral[850],
  tile4: primitiveColor.neutral[800],

  base: primitiveColor.neutral[950],
  shell: primitiveColor.neutral[950],
  container: primitiveColor.neutral[925],
  elevated: primitiveColor.neutral[900],
  overlay: primitiveColor.neutral[950],
  overlayPanel: primitiveColor.neutral[925],
  /** Deepest inset fill for sliders, nested fields, and hover states. */
  variant: primitiveColor.neutral[850],
} as const

/** Backward-compat alias */
export const surface = surfaces.container

/** Structural outline border — used for all section/card/table dividers */
export const outlineColor = primitiveColor.neutral[700]

/** Stronger outline — reserved for floating surfaces and active shell boundaries */
export const outlineStrongColor = primitiveColor.neutral[600]
