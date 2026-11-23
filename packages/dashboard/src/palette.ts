// Resolves a layout's color palette and theme presets, ported from the desktop client's
// `Features/Dashes/DashPalette.cs` and `DashThemePresets.cs`. The editor reads it for its
// swatches and pickers; the Rust renderer resolves the same palette for the pixels
// (renderer/src/palette.rs, whose tests are ported from palette.test.ts).
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
  /** Each driver-adjustable setting's identity colour (`dashSettingColors` unless the theme overrides it). */
  settingTc: string
  settingAbs: string
  settingBrakeBias: string
  settingEngineMap: string
  settingMigration: string
  settingArb: string
}

/** The raw on-wheel colors every palette slot and theme preset is built from. */
export const dashColor = {
  background: '#08080A',
  surface: '#1B1B1E',
  // A solid mid-grey, not a translucent white: USB wheel panels wash out near-black, and a
  // faint hairline disappears on them entirely.
  border: '#3F3F46',
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

/**
 * Each driver-adjustable setting's default identity color. A knob widget carries it in its
 * frame and its change popup fills the screen with it, so the driver knows which knob they
 * turned before reading the value. Identity, not a condition: it never colors a value at rest.
 * A theme may override each (`settingTc`, ...). `tc` is TC, TC 2 and TC slip; `arb` both bars.
 */
export const dashSettingColors = {
  tc: dashColor.blue,
  abs: dashColor.yellow,
  brakeBias: dashColor.yellow,
  engineMap: dashColor.green,
  migration: dashColor.red,
  arb: dashColor.orange,
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
  // Amber, the warm of the colour scale, as the app's pit wall and Analysis draw it.
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
  settingTc: dashSettingColors.tc,
  settingAbs: dashSettingColors.abs,
  settingBrakeBias: dashSettingColors.brakeBias,
  settingEngineMap: dashSettingColors.engineMap,
  settingMigration: dashSettingColors.migration,
  settingArb: dashSettingColors.arb,
}

/**
 * Sprint's colour themes (Settings › Colours, `ColourTheme` in Core): each sets the scale's cold
 * and good colours. Warm stays amber and hot red; timing and knob colours are the same in all.
 */
export type ColourTheme = 'Sprint' | 'Calm' | 'Strict'
export const colourThemes: readonly ColourTheme[] = ['Sprint', 'Calm', 'Strict']

/**
 * Where values change colour (`ColourLimits` in Core), °C and percent. Tyres against the
 * compound's ideal: cold more than `tyreColdBelow` under it, warm and hot more than
 * `tyreWarmAbove` and `tyreHotAbove` over it. Brakes in plain °C; tyre wear (tread left) and fuel
 * and energy bars turn low, then critical, under their marks.
 */
export interface DashColourLimits {
  tyreColdBelow: number
  tyreWarmAbove: number
  tyreHotAbove: number
  brakeColdBelow: number
  brakeWarmAbove: number
  brakeHotAbove: number
  wearLowBelow: number
  wearCriticalBelow: number
  energyLowBelow: number
  energyCriticalBelow: number
}

/** The app-wide Colours setting: what colours mean (the theme) and where values change colour. */
export interface DashColours {
  theme: ColourTheme
  limits: DashColourLimits
}

/** The Colours setting a fresh install has (`ColourSettings` in Core). */
export const defaultDashColours: DashColours = {
  theme: 'Sprint',
  limits: {
    tyreColdBelow: 10, tyreWarmAbove: 10, tyreHotAbove: 20,
    brakeColdBelow: 300, brakeWarmAbove: 650, brakeHotAbove: 800,
    wearLowBelow: 60, wearCriticalBelow: 30,
    energyLowBelow: 50, energyCriticalBelow: 20,
  },
}

/**
 * The palette every dash draws in, in the driver's colour theme: the default with the scale's
 * cold and good recoloured (the renderer's `themed_palette`). A layout's own theme is not read.
 */
export function themedPalette(theme: ColourTheme): DashPaletteColors {
  switch (theme) {
    case 'Sprint': return defaultDashPalette
    case 'Calm': return { ...defaultDashPalette, coldLow: defaultDashPalette.secondary, goodOnTarget: defaultDashPalette.foreground }
    case 'Strict': return { ...defaultDashPalette, coldLow: defaultDashPalette.critical }
  }
}

const THEME_KEYS = [
  'neutral', 'goodOnTarget', 'coldLow', 'assistActive', 'critical', 'fault',
  'timingFastestOverall', 'timingPersonalBest', 'primary', 'accent', 'foreground',
  'surface', 'border', 'success', 'warning', 'danger',
  'settingTc', 'settingAbs', 'settingBrakeBias', 'settingEngineMap', 'settingMigration', 'settingArb',
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
    settingTc: hex(t.settingTc) ?? defaultDashPalette.settingTc,
    settingAbs: hex(t.settingAbs) ?? defaultDashPalette.settingAbs,
    settingBrakeBias: hex(t.settingBrakeBias) ?? defaultDashPalette.settingBrakeBias,
    settingEngineMap: hex(t.settingEngineMap) ?? defaultDashPalette.settingEngineMap,
    settingMigration: hex(t.settingMigration) ?? defaultDashPalette.settingMigration,
    settingArb: hex(t.settingArb) ?? defaultDashPalette.settingArb,
  }
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
