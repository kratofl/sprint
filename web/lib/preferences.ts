// Per-browser appearance preferences: theme, motion and glass. They live in a
// plain (not httpOnly) cookie so the settings page can write it directly while
// a slider moves, and the root layout reads it to render <html> with the right
// data-theme and custom properties — no flash of the wrong theme on load.

export type Theme = 'system' | 'light' | 'dark'

export type Preferences = {
  theme: Theme
  // Base animation length in ms; 0 turns animation off. Every transition and
  // entrance animation derives its duration from it (see globals.css → Motion).
  motion: number
  // Opacity of the chrome (sidebar, toolbar) fill in percent: low is clear
  // glass, 100 is a solid tinted bar.
  glass: number
}

export const preferencesCookieName = 'sprint_prefs'

// Slider bounds. The glass default (72 %) and its 20px blur match the
// toolbar-bg / toolbar-blur tokens, so an untouched browser looks as designed.
export const motionRange = { min: 0, max: 600, step: 20 } as const
export const glassRange = { min: 15, max: 100, step: 1 } as const

export const defaultPreferences: Preferences = { theme: 'system', motion: 220, glass: 72 }

const themes: readonly Theme[] = ['system', 'light', 'dark']
const oneYear = 60 * 60 * 24 * 365

// Reads the cookie value. Missing or garbled fields fall back to their own
// default; numbers are rounded and clamped to the slider range.
export function parsePreferences(raw: string | undefined): Preferences {
  const fields = new URLSearchParams(raw ?? '')
  const theme = themes.find((candidate) => candidate === fields.get('theme'))
  return {
    theme: theme ?? defaultPreferences.theme,
    motion: number(fields.get('motion'), motionRange, defaultPreferences.motion),
    glass: number(fields.get('glass'), glassRange, defaultPreferences.glass),
  }
}

// The `document.cookie` assignment that stores the preferences for a year.
export function preferencesCookie(preferences: Preferences): string {
  const value = new URLSearchParams({
    theme: preferences.theme,
    motion: String(preferences.motion),
    glass: String(preferences.glass),
  })
  return `${preferencesCookieName}=${value}; Path=/; Max-Age=${oneYear}; SameSite=Lax`
}

// The custom properties <html> carries for these preferences. Blur scales with
// the fill: clear glass is barely frosted, denser glass more so. Fully tinted
// glass hides what is behind it, so it drops the backdrop-filter instead of
// paying for a blur nobody sees.
export function appearanceStyle(preferences: Preferences) {
  return {
    '--motion': `${preferences.motion}ms`,
    '--chrome-opacity': `${preferences.glass}%`,
    '--chrome-backdrop':
      preferences.glass >= glassRange.max ? 'none' : `blur(${Math.round(preferences.glass * 0.28)}px) saturate(180%)`,
  }
}

// The `data-theme` attribute for <html>: none for `system`, so the tokens
// follow prefers-color-scheme.
export function themeAttribute(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme
}

function number(raw: string | null, range: { min: number; max: number }, fallback: number): number {
  const value = raw === null || raw.trim() === '' ? NaN : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}
