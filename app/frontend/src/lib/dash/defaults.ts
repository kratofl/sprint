import type { DashTheme, DomainPalette } from './types'

export const DEFAULT_DASH_THEME: DashTheme = {
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

export const DEFAULT_DOMAIN_PALETTE: DomainPalette = {
  abs: { R: 251, G: 191, B: 36, A: 255 },
  tc: { R: 90, G: 248, B: 251, A: 255 },
  brakeBias: { R: 251, G: 191, B: 36, A: 255 },
  energy: { R: 52, G: 211, B: 153, A: 255 },
  motor: { R: 255, G: 144, B: 108, A: 255 },
  brakeMig: { R: 90, G: 248, B: 251, A: 255 },
}
