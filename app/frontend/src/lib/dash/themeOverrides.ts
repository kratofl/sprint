import { DEFAULT_DASH_THEME, DEFAULT_DOMAIN_PALETTE } from './defaults.ts'
import type { DashTheme, DashThemeOverrides, DomainPalette, RGBAColor } from './types.ts'

export function resolveDashTheme(
  globalTheme?: DashThemeOverrides,
  layoutTheme?: DashThemeOverrides,
): DashTheme {
  return {
    ...DEFAULT_DASH_THEME,
    ...globalTheme,
    ...layoutTheme,
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
