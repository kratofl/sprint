import COLORS from '../assets/makers/colors.json'

// Each make's primary colour, keyed like its logo file (makerKey). Sources: assets/makers/README.md.
const colors: Readonly<Record<string, string | undefined>> = COLORS

/** A make as its logo file and colour are named: lower-case letters only ("Mercedes-AMG" → "mercedesamg"). */
export const makerKey = (make: string): string => make.toLowerCase().replace(/[^a-z]/g, '')

/** A maker's badge colours: its primary colour as the fill, and the ink (light or dark) that reads best on it. */
export type MakerColors = { fill: string; ink: 'light' | 'dark' }

// The two inks' relative luminance: white (--on-class) and the near-black --on-brand (#1d1d1f).
const LIGHT_INK = 1
const DARK_INK = 0.0122

/** The badge colours for a make, or null for a make Sprint has no colour for (it stays neutral). */
export function makerColors(make: string | null): MakerColors | null {
  const fill = make ? colors[makerKey(make)] : undefined
  if (!fill) return null
  const fillLuminance = luminance(fill)
  const onLight = (LIGHT_INK + 0.05) / (fillLuminance + 0.05)
  const onDark = (fillLuminance + 0.05) / (DARK_INK + 0.05)
  return { fill, ink: onLight >= onDark ? 'light' : 'dark' }
}

/** WCAG relative luminance of a "#rrggbb" colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
