import { primitiveColor } from '../primitive'

/** Surface tokens — Figma flat-UI dark scale (Screen → Tile 3). */

export const surfaces = {
  // Surface/Screen #050505 — dash canvas, darkest
  screen: primitiveColor.neutral[990],
  deep: primitiveColor.neutral[990],
  // Surface/App #0F0F0F — app window body
  app: primitiveColor.neutral[925],
  // Surface/Panel #141414 — sidebar, side panels
  panel: primitiveColor.neutral[900],
  // Surface/Tile #1F1F1F — controls, inputs, tiles
  tile2: primitiveColor.neutral[800],
  // Surface/Tile 2 #2E2E2E — hover/selected
  tile3: primitiveColor.neutral[700],
  // Surface/Tile 3 #424242
  tile4: primitiveColor.neutral[600],

  base: primitiveColor.neutral[990],
  shell: primitiveColor.neutral[990],
  container: primitiveColor.neutral[900],
  elevated: primitiveColor.neutral[800],
  overlay: primitiveColor.neutral[990],
  overlayPanel: primitiveColor.neutral[900],
  /** Deepest inset fill for sliders, nested fields, and hover states. */
  variant: primitiveColor.neutral[700],
} as const

/** Backward-compat alias */
export const surface = surfaces.container

/** Structural outline border — Border/Default #2E2E2E */
export const outlineColor = primitiveColor.neutral[700]

/** Stronger outline — Border/Strong #424242 */
export const outlineStrongColor = primitiveColor.neutral[600]
