import { DEFAULT_DASH_THEME, DEFAULT_DOMAIN_PALETTE } from './defaults.ts'
import type { DashTheme, DashThemeOverrides, DomainPalette, RGBAColor } from './types.ts'

const LEGACY_DASH_THEME: DashTheme = {
  primary: { R: 255, G: 144, B: 108, A: 255 },
  accent: { R: 90, G: 248, B: 251, A: 255 },
  fg: { R: 255, G: 255, B: 255, A: 255 },
  muted: { R: 128, G: 128, B: 128, A: 255 },
  muted2: { R: 161, G: 161, B: 170, A: 255 },
  success: { R: 52, G: 211, B: 153, A: 255 },
  warning: { R: 251, G: 191, B: 36, A: 255 },
  danger: { R: 248, G: 113, B: 113, A: 255 },
  surface: { R: 20, G: 20, B: 20, A: 255 },
  bg: { R: 10, G: 10, B: 10, A: 255 },
  border: { R: 42, G: 42, B: 42, A: 255 },
  rpmRed: { R: 248, G: 113, B: 113, A: 255 },
}

function sameColor(a: RGBAColor | undefined, b: RGBAColor): boolean {
  return a != null && a.R === b.R && a.G === b.G && a.B === b.B && a.A === b.A
}

export function migrateLegacyDashThemeOverrides(
  theme: DashThemeOverrides | undefined,
): DashThemeOverrides | undefined {
  if (!theme) return undefined

  const migrated: DashThemeOverrides = {}
  for (const key of Object.keys(theme) as Array<keyof DashTheme>) {
    const value = theme[key]
    if (!value) continue
    migrated[key] = sameColor(value, LEGACY_DASH_THEME[key])
      ? DEFAULT_DASH_THEME[key]
      : value
  }
  return normalizeThemeOverrides(migrated)
}

export function resolveDashTheme(
  globalTheme?: DashThemeOverrides,
  layoutTheme?: DashThemeOverrides,
): DashTheme {
  return {
    ...DEFAULT_DASH_THEME,
    ...migrateLegacyDashThemeOverrides(globalTheme),
    ...migrateLegacyDashThemeOverrides(layoutTheme),
  }
}

export function resolveDomainPalette(
  globalDomain?: DomainPalette,
  layoutDomain?: DomainPalette,
): DomainPalette {
  return {
    ...DEFAULT_DOMAIN_PALETTE,
    ...globalDomain,
    ...layoutDomain,
  }
}

export function setThemeColorOverride(
  theme: DashThemeOverrides | undefined,
  key: keyof DashTheme,
  value: RGBAColor,
): DashThemeOverrides {
  return { ...(theme ?? {}), [key]: value }
}

export function clearThemeColorOverride(
  theme: DashThemeOverrides | undefined,
  key: keyof DashTheme,
): DashThemeOverrides | undefined {
  if (!theme || theme[key] === undefined) return normalizeThemeOverrides(theme)
  const next = { ...theme }
  delete next[key]
  return normalizeThemeOverrides(next)
}

export function normalizeThemeOverrides(
  theme: DashThemeOverrides | undefined,
): DashThemeOverrides | undefined {
  if (!theme) return undefined

  const entries = Object.entries(theme).filter(([, value]) => value !== undefined)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries) as DashThemeOverrides
}

export function setDomainColorOverride(
  domain: DomainPalette | undefined,
  key: keyof DomainPalette,
  value: RGBAColor,
): DomainPalette {
  return { ...(domain ?? {}), [key]: value }
}

export function clearDomainColorOverride(
  domain: DomainPalette | undefined,
  key: keyof DomainPalette,
): DomainPalette | undefined {
  if (!domain || domain[key] === undefined) return normalizeDomainPaletteOverrides(domain)
  const next = { ...domain }
  delete next[key]
  return normalizeDomainPaletteOverrides(next)
}

export function normalizeDomainPaletteOverrides(
  domain: DomainPalette | undefined,
): DomainPalette | undefined {
  if (!domain) return undefined

  const entries = Object.entries(domain).filter(([, value]) => value !== undefined)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries) as DomainPalette
}
