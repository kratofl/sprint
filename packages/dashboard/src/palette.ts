// Resolves a layout's color palette and theme presets, ported from the desktop client's
// `Features/Dashes/DashPalette.cs` and `DashThemePresets.cs`. Colors are CSS color strings
// (mostly hex) rather than a parsed color type, since the consumer here is HTML/CSS/SVG, not
// a Skia canvas.
//
// The dash is hardware output, not app UI: it owns its palette and does not follow the app's
// design tokens. Change these values only as a deliberate dash change — they are what the
// wheel screen shows.

import type { DashColorSystem, DashLayout, DashTheme } from './index'

/**
 * The resolved on-wheel color set for a dash. Functional dashboards keep focal values
 * neutral and reserve orange for warnings; styled themes may replace optical accents.
 * The canvas remains a near-black surface.
 */
export interface DashPaletteColors {
  background: string
  surface: string // bar track / container
  border: string // wheel-instrument outline
  foreground: string // large values
  secondary: string // secondary text
  muted: string // labels
  primary: string // functional focal value
  accent: string // comparison/system
  success: string
  warning: string // attention required
  danger: string
  raceControlYellow: string
  rpmNormal: string
  rpmNearLimit: string
  rpmShift: string
  neutral: string
  goodOnTarget: string
  coldLow: string
  assistActive: string
  critical: string
  fault: string
  timingFastestOverall: string
  timingPersonalBest: string
}

/** The raw on-wheel colors every palette slot and theme preset is built from. */
const dashColor = {
  background: '#08080A',
  surface: '#1B1B1E',
  border: 'rgba(255,255,255,.12)',
  text: '#F5F5F7',
  text2: '#A1A1AA',
  text3: '#6F6F78',
  orange: '#FF6A00',
  green: '#16B566',
  red: '#F02744',
  yellow: '#E0A30C',
  blue: '#1F7FE6',
  purple: '#A06BFF',
  suzukiPrimary: '#7C3AED',
  suzukiAccent: '#B15CFF',
  monoPrimary: '#F6F6F6',
  monoAccent: '#7A7A7A',
} as const

export const defaultDashPalette: DashPaletteColors = {
  background: dashColor.background,
  surface: dashColor.surface,
  border: dashColor.border,
  foreground: dashColor.text,
  secondary: dashColor.text2,
  muted: dashColor.text3,
  primary: dashColor.text,
  accent: dashColor.blue,
  success: dashColor.green,
  warning: dashColor.orange,
  danger: dashColor.red,
  raceControlYellow: dashColor.yellow,
  rpmNormal: dashColor.green,
  rpmNearLimit: dashColor.red,
  rpmShift: dashColor.blue,
  neutral: dashColor.text,
  goodOnTarget: dashColor.green,
  coldLow: dashColor.blue,
  assistActive: dashColor.blue,
  critical: dashColor.red,
  fault: dashColor.red,
  timingFastestOverall: dashColor.purple,
  timingPersonalBest: dashColor.green,
}

const THEME_KEYS = [
  'neutral', 'goodOnTarget', 'coldLow', 'assistActive', 'critical', 'fault',
  'timingFastestOverall', 'timingPersonalBest', 'primary', 'accent', 'foreground',
  'surface', 'border', 'success', 'warning', 'danger',
] as const

function isThemeEmpty(theme: DashTheme | undefined): boolean {
  return !theme || THEME_KEYS.every((key) => !theme[key])
}

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** A theme override is only honored when it parses as a hex color; anything else inherits the default. */
function hex(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && HEX_COLOR_PATTERN.test(trimmed) ? trimmed : undefined
}

/**
 * Resolves a layout theme into a concrete palette: the default palette with each supplied
 * hex override applied. Unparseable or missing values inherit the default. Styled themes
 * recolor the optical RPM endpoints while protected safety states (critical/fault/danger)
 * stay functional regardless of the theme.
 */
export function resolveDashPalette(
  theme: DashTheme | undefined,
  colorSystem: DashColorSystem = 'styled',
): DashPaletteColors {
  if (colorSystem === 'functional' || isThemeEmpty(theme)) {
    return defaultDashPalette
  }

  const t = theme ?? {}
  return {
    ...defaultDashPalette,
    primary: hex(t.primary) ?? defaultDashPalette.primary,
    accent: hex(t.accent) ?? defaultDashPalette.accent,
    foreground: hex(t.foreground) ?? defaultDashPalette.foreground,
    surface: hex(t.surface) ?? defaultDashPalette.surface,
    border: hex(t.border) ?? defaultDashPalette.border,
    success: hex(t.success) ?? defaultDashPalette.success,
    warning: hex(t.warning) ?? defaultDashPalette.warning,
    danger: defaultDashPalette.critical,
    rpmNormal: hex(t.primary) ?? defaultDashPalette.rpmNormal,
    rpmNearLimit: defaultDashPalette.critical,
    rpmShift: hex(t.accent) ?? defaultDashPalette.rpmShift,
    neutral: hex(t.neutral) ?? hex(t.foreground) ?? defaultDashPalette.neutral,
    goodOnTarget: hex(t.goodOnTarget) ?? hex(t.success) ?? defaultDashPalette.goodOnTarget,
    coldLow: hex(t.coldLow) ?? hex(t.accent) ?? defaultDashPalette.coldLow,
    assistActive: hex(t.assistActive) ?? hex(t.accent) ?? defaultDashPalette.assistActive,
    critical: defaultDashPalette.critical,
    fault: defaultDashPalette.fault,
    timingFastestOverall: hex(t.timingFastestOverall) ?? defaultDashPalette.timingFastestOverall,
    timingPersonalBest: hex(t.timingPersonalBest) ?? hex(t.success) ?? defaultDashPalette.timingPersonalBest,
  }
}

/** The style-color token names offered by the widget style inspector, in swatch order. */
export const styleColorTokens = ['ember', 'blue', 'green', 'yellow', 'red', 'white', 'muted'] as const

/**
 * Resolves a per-widget style color token to a palette color, or `undefined` when the token
 * is empty/unrecognized (inherit). Tokens are on-brand names so widget styling can't invent
 * off-palette colors.
 */
export function resolveStyleColor(token: string | undefined, palette: DashPaletteColors): string | undefined {
  switch (token?.trim().toLowerCase()) {
    case 'ember':
    case 'primary': return palette.primary
    case 'blue':
    case 'info': return palette.accent
    case 'green':
    case 'success': return palette.success
    case 'yellow':
    case 'warning': return palette.warning
    case 'red':
    case 'danger': return palette.danger
    case 'white':
    case 'text': return palette.foreground
    case 'muted':
    case 'label': return palette.muted
    default: return undefined
  }
}

/** Temperature-coded color for a tyre readout (Celsius), matching the desktop painter thresholds. */
export function resolveTyreColor(celsius: number, palette: DashPaletteColors): string {
  if (celsius > 110) return palette.critical
  if (celsius > 100) return palette.warning
  if (celsius > 70) return palette.goodOnTarget
  return palette.coldLow
}

/**
 * Dims an opaque hex color toward black (0..1 factor) — used for bar tracks/unlit segments.
 * Accepts `#rgb`, `#rrggbb`, or AARRGGBB-ordered `#aarrggbb` hex only (the palette colors this
 * is applied to are always resolved hex, never the CSS `rgba()` literals used elsewhere).
 */
export function dimColor(color: string, factor: number): string {
  const { r, g, b, a } = parseHexColor(color)
  const scaled = {
    r: clampByte(Math.trunc(r * factor)),
    g: clampByte(Math.trunc(g * factor)),
    b: clampByte(Math.trunc(b * factor)),
  }
  const body = `${toHexByte(scaled.r)}${toHexByte(scaled.g)}${toHexByte(scaled.b)}`
  return a === 255 ? `#${body}` : `#${toHexByte(a)}${body}`
}

/**
 * Applies an alpha value (0..1) to an opaque hex color, returning a CSS `rgba()` string — used
 * for the flag-state screen tints in DashRenderer.tsx.
 */
export function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseHexColor(color)
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function parseHexColor(color: string): { r: number; g: number; b: number; a: number } {
  const digits = color.trim().replace('#', '')
  if (digits.length === 3) {
    const [r, g, b] = digits.split('')
    return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16), a: 255 }
  }
  if (digits.length === 6) {
    return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16), a: 255 }
  }
  if (digits.length === 8) {
    // 8-digit hex is alpha-first: AARRGGBB, e.g. "#12FFFFFF" for a near-transparent white.
    return {
      a: parseInt(digits.slice(0, 2), 16),
      r: parseInt(digits.slice(2, 4), 16),
      g: parseInt(digits.slice(4, 6), 16),
      b: parseInt(digits.slice(6, 8), 16),
    }
  }

  throw new TypeError(`dimColor: not a hex color: "${color}"`)
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value))
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}

/**
 * Named layout themes offered by the editor's theme manager. Each preset is a set of hex
 * overrides drawn from the dash colors above. "Graphite" is the empty (default) theme;
 * applying it clears the layout override.
 */
export interface DashThemePreset {
  name: string
  alertColorToken: string
  theme: DashTheme
}

export const dashThemePresets: readonly DashThemePreset[] = [
  { name: 'Graphite', alertColorToken: 'auto', theme: {} },
  { name: 'Ember', alertColorToken: 'ember', theme: { primary: dashColor.orange, accent: dashColor.yellow } },
  { name: 'Ice', alertColorToken: 'ice', theme: { primary: dashColor.blue, accent: dashColor.green } },
  { name: 'Viper', alertColorToken: 'viper', theme: { primary: dashColor.green, accent: dashColor.orange } },
  { name: 'Suzuki', alertColorToken: 'suzuki', theme: { primary: dashColor.suzukiPrimary, accent: dashColor.suzukiAccent } },
  { name: 'Crimson', alertColorToken: 'crimson', theme: { primary: dashColor.red, accent: dashColor.yellow } },
  { name: 'Mono', alertColorToken: 'mono', theme: { primary: dashColor.monoPrimary, accent: dashColor.monoAccent } },
]

/** The swatch color shown for a preset in the theme picker. */
export function presetSwatchColor(preset: DashThemePreset): string {
  return preset.theme.primary ?? dashColor.text
}

/** Maps a layout/alert color token to the theme-preset token it's a shorthand for. */
export function canonicalAlertColorToken(token: string | undefined): string {
  const normalized = (token ?? '').trim().toLowerCase()
  switch (normalized) {
    case 'blue': return 'ice'
    case 'green': return 'viper'
    case 'purple': return 'suzuki'
    case 'red': return 'crimson'
    case 'white': return 'mono'
    case 'primary': return 'ember'
    default: return normalized
  }
}

export function findPresetByAlertColorToken(token: string | undefined): DashThemePreset | undefined {
  const canonical = canonicalAlertColorToken(token)
  return dashThemePresets.find((preset) => preset.alertColorToken.toLowerCase() === canonical)
}

function sameColorToken(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.toLowerCase() === b.toLowerCase()
}

function sameTheme(a: DashTheme, b: DashTheme): boolean {
  return THEME_KEYS.every((key) => sameColorToken(a[key], b[key]))
}

/** The name of the preset whose complete override set matches `theme`, or `null` for a custom theme. */
export function matchThemeName(theme: DashTheme | undefined): string | null {
  const t = theme ?? {}
  const match = dashThemePresets.find((preset) => sameTheme(preset.theme, t))
  return match?.name ?? null
}

/** The layout's effective color system: an explicit choice, or "styled" whenever a theme override is set. */
export function effectiveColorSystem(layout: Pick<DashLayout, 'colorSystem' | 'theme'>): DashColorSystem {
  return layout.colorSystem ?? (isThemeEmpty(layout.theme) ? 'functional' : 'styled')
}

/** The preset whose output matches the layout's effective color system, or `null` for a custom styled theme. */
export function matchLayoutThemeName(layout: Pick<DashLayout, 'colorSystem' | 'theme'>): string | null {
  return effectiveColorSystem(layout) === 'functional' ? 'Graphite' : matchThemeName(layout.theme)
}
