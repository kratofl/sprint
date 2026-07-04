import { primitiveColor } from '../primitive'

/**
 * Raw color palette — primitive values only.
 * Components should consume semantic tokens from semantic/component layers.
 */

export const neutral = primitiveColor.neutral
export const orange = primitiveColor.orange

/** Compatibility alias for legacy heat references; orange is the primary accent. */
export const heat = orange

export const green = primitiveColor.green
export const alertRed = primitiveColor.red
export const yellow = primitiveColor.yellow
export const blue = primitiveColor.blue
export const purple = primitiveColor.purple

/** Restrained compatibility cyan for explicit comparison data only. */
export const cyan = primitiveColor.blue

/**
 * @deprecated Use `cyan` only for explicit comparison data.
 * Kept as alias for references that have not been migrated.
 */
export const teal = cyan

export const semantic = {
  success:     green[500],
  warning:     yellow[500],
  destructive: alertRed[500],
  info:        cyan[500],
  tertiary:    green[500],
} as const

/** Six-color data visualization palette — orange first, cyan retained for comparisons. */
export const dataViz = {
  1: orange[500],
  2: green[500],
  3: alertRed[500],
  4: cyan[500],
  5: orange[300],
  6: neutral[300],
} as const
