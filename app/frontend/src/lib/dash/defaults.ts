import type { DashTheme, DomainPalette } from './types'

export const DEFAULT_DASH_THEME: DashTheme = {
  primary: { R: 255, G: 144, B: 108, A: 255 },
  accent: { R: 79, G: 156, B: 255, A: 255 },
  fg: { R: 246, G: 240, B: 230, A: 255 },
  muted: { R: 169, G: 160, B: 149, A: 255 },
  muted2: { R: 200, G: 191, B: 178, A: 255 },
  success: { R: 52, G: 211, B: 153, A: 255 },
  warning: { R: 251, G: 191, B: 36, A: 255 },
  danger: { R: 255, G: 59, B: 48, A: 255 },
  surface: { R: 18, G: 17, B: 15, A: 255 },
  bg: { R: 9, G: 9, B: 7, A: 255 },
  border: { R: 111, G: 103, B: 95, A: 255 },
  rpmRed: { R: 255, G: 59, B: 48, A: 255 },
}

export const DEFAULT_DOMAIN_PALETTE: DomainPalette = {
  abs: { R: 251, G: 191, B: 36, A: 255 },
  tc: { R: 79, G: 156, B: 255, A: 255 },
  brakeBias: { R: 251, G: 191, B: 36, A: 255 },
  energy: { R: 52, G: 211, B: 153, A: 255 },
  motor: { R: 255, G: 144, B: 108, A: 255 },
  brakeMig: { R: 79, G: 156, B: 255, A: 255 },
}
