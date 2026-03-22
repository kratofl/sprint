import { clsx, type ClassValue } from 'clsx'

/** Merge class names. Drop-in replacement for clsx with future tailwind-merge support. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

/** Format seconds to m:ss.SSS lap time display. */
export function formatLapTime(seconds: number): string {
  if (!seconds) return '—:---.---'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}
