import type { DashTheme, DomainPalette, RGBAColor } from '../lib/dash/types.ts'
import { rgbaToHex } from '../lib/color.ts'

interface ThemeColorRowStateArgs {
  key: keyof DashTheme
  theme: Partial<DashTheme>
  inheritedTheme: DashTheme
  hardcodedTheme: DashTheme
  inheritsGlobalColors: boolean
}

interface DomainColorRowStateArgs {
  key: keyof DomainPalette
  domainPalette: Partial<DomainPalette>
  inheritedDomain: DomainPalette
  hardcodedDomain: DomainPalette
  inheritsGlobalColors: boolean
}

export interface ColorRowState {
  value: RGBAColor
  defaultValue: RGBAColor
  isOverridden: boolean
}

export function getThemeColorRowState({
  key,
  theme,
  inheritedTheme,
  hardcodedTheme,
  inheritsGlobalColors,
}: ThemeColorRowStateArgs): ColorRowState {
  const value = theme[key] ?? inheritedTheme[key]
  const defaultValue = inheritedTheme[key]
  const isOverridden = inheritsGlobalColors
    ? theme[key] !== undefined
    : rgbaToHex(value) !== rgbaToHex(hardcodedTheme[key])

  return { value, defaultValue, isOverridden }
}

export function getDomainColorRowState({
  key,
  domainPalette,
  inheritedDomain,
  hardcodedDomain,
  inheritsGlobalColors,
}: DomainColorRowStateArgs): ColorRowState | null {
  const value = domainPalette[key] ?? inheritedDomain[key]
  const defaultValue = inheritedDomain[key]
  if (!value || !defaultValue) return null

  const isOverridden = inheritsGlobalColors
    ? domainPalette[key] !== undefined
    : rgbaToHex(value) !== rgbaToHex(hardcodedDomain[key]!)

  return { value, defaultValue, isOverridden }
}
