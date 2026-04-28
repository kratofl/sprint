import type { DashEditorUIPreferences } from '@sprint/types'

export const DEFAULT_DASH_EDITOR_UI_PREFERENCES: DashEditorUIPreferences = {
  palette: { open: true, pinned: true },
  inspector: { open: true, pinned: true },
}

function normalizePanelPreferences(
  value: unknown,
  fallback: DashEditorUIPreferences['palette'],
): DashEditorUIPreferences['palette'] {
  if (!value || typeof value !== 'object') return { ...fallback }
  const candidate = value as { open?: unknown; pinned?: unknown }
  return {
    open: typeof candidate.open === 'boolean' ? candidate.open : fallback.open,
    pinned: typeof candidate.pinned === 'boolean' ? candidate.pinned : fallback.pinned,
  }
}

export function normalizeDashEditorUIPreferences(value: unknown): DashEditorUIPreferences {
  if (!value || typeof value !== 'object') {
    return {
      palette: { ...DEFAULT_DASH_EDITOR_UI_PREFERENCES.palette },
      inspector: { ...DEFAULT_DASH_EDITOR_UI_PREFERENCES.inspector },
    }
  }

  const candidate = value as {
    palette?: unknown
    inspector?: unknown
  }

  return {
    palette: normalizePanelPreferences(candidate.palette, DEFAULT_DASH_EDITOR_UI_PREFERENCES.palette),
    inspector: normalizePanelPreferences(candidate.inspector, DEFAULT_DASH_EDITOR_UI_PREFERENCES.inspector),
  }
}
