import type { DashTheme, DomainPalette } from './types'

export const DEFAULT_DASH_THEME: DashTheme = {
  primary: { R: 255, G: 139, B: 97, A: 255 },
  accent: { R: 121, G: 214, B: 230, A: 255 },
  fg: { R: 245, G: 247, B: 250, A: 255 },
  muted: { R: 139, G: 147, B: 161, A: 255 },
  muted2: { R: 183, G: 191, B: 202, A: 255 },
  success: { R: 79, G: 209, B: 155, A: 255 },
  warning: { R: 242, G: 184, B: 75, A: 255 },
  danger: { R: 240, G: 125, B: 125, A: 255 },
  surface: { R: 21, G: 23, B: 28, A: 255 },
  bg: { R: 9, G: 10, B: 12, A: 255 },
  border: { R: 45, G: 49, B: 56, A: 255 },
  rpmRed: { R: 230, G: 74, B: 74, A: 255 },
}

export const DEFAULT_DOMAIN_PALETTE: DomainPalette = {
  abs: { R: 251, G: 191, B: 36, A: 255 },
  tc: { R: 90, G: 248, B: 251, A: 255 },
  brakeBias: { R: 251, G: 191, B: 36, A: 255 },
  energy: { R: 52, G: 211, B: 153, A: 255 },
  motor: { R: 255, G: 144, B: 108, A: 255 },
  brakeMig: { R: 90, G: 248, B: 251, A: 255 },
}
