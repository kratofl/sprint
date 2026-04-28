import type { RGBAColor } from '@/lib/dash'

export function rgbaToHex(c: RGBAColor): string {
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(c.R)}${hex(c.G)}${hex(c.B)}`
}

export function hexToRgba(hex: string, alpha = 255): RGBAColor {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  return {
    R: parseInt(full.slice(0, 2), 16) || 0,
    G: parseInt(full.slice(2, 4), 16) || 0,
    B: parseInt(full.slice(4, 6), 16) || 0,
    A: alpha,
  }
}
