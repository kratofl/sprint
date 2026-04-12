import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { type DashLayout, type LayoutMeta, type GlobalDashSettings, type DashTheme, type DomainPalette, type FormatPreferences, dashAPI } from '@/lib/dash'
import { DashList } from '@/components/DashList'
import { DashEditMode } from '@/components/DashEditMode'
import { AdditionalSettingsPanel } from '@/components/AdditionalSettingsPanel'
import { Button, Badge } from '@sprint/ui'

export interface DashEditorHandle {
  isDirty: boolean
}

const HARDCODED_THEME: DashTheme = {
  primary: { R: 255, G: 144, B: 108, A: 255 },
  accent:  { R: 90,  G: 248, B: 251, A: 255 },
  fg:      { R: 255, G: 255, B: 255, A: 255 },
  muted:   { R: 128, G: 128, B: 128, A: 255 },
  muted2:  { R: 161, G: 161, B: 170, A: 255 },
  success: { R: 52,  G: 211, B: 153, A: 255 },
  warning: { R: 251, G: 191, B: 36,  A: 255 },
  danger:  { R: 248, G: 113, B: 113, A: 255 },
  surface: { R: 20,  G: 20,  B: 20,  A: 255 },
  bg:      { R: 10,  G: 10,  B: 10,  A: 255 },
  border:  { R: 42,  G: 42,  B: 42,  A: 255 },
  rpmRed:  { R: 220, G: 38,  B: 38,  A: 255 },
}

const HARDCODED_DOMAIN: DomainPalette = {
  abs:       { R: 251, G: 191, B: 36,  A: 255 },
  tc:        { R: 90,  G: 248, B: 251, A: 255 },
  brakeBias: { R: 251, G: 191, B: 36,  A: 255 },
  energy:    { R: 52,  G: 211, B: 153, A: 255 },
  motor:     { R: 255, G: 144, B: 108, A: 255 },
  brakeMig:  { R: 90,  G: 248, B: 251, A: 255 },
}

const DashEditor = forwardRef<DashEditorHandle>(function DashEditor(_, ref) {
  const [mode, setMode] = useState<'list' | 'edit' | 'global-settings'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [layouts, setLayouts] = useState<LayoutMeta[]>([])
  const [editLayout, setEditLayout] = useState<DashLayout | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [globalSettings, setGlobalSettings] = useState<GlobalDashSettings | null>(null)
  const [globalSaving, setGlobalSaving] = useState(false)
  const [globalSaveStatus, setGlobalSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useImperativeHandle(ref, () => ({ isDirty }), [isDirty])

  const loadLayouts = useCallback(async () => {
    const metas = await dashAPI.listLayouts()
    setLayouts(metas)
    return metas
  }, [])

  useEffect(() => { void loadLayouts() }, [loadLayouts])

  const handleEdit = async (id: string) => {
    const layout = await dashAPI.loadLayoutByID(id)
    setEditLayout(layout)
    setEditingId(id)
    setIsDirty(false)
    setMode('edit')
  }

  const handleCreate = async () => {
    const layout = await dashAPI.createLayout('Untitled')
    await loadLayouts()
    setEditLayout(layout)
    setEditingId(layout.id)
    setIsDirty(false)
    setMode('edit')
  }

  const handleSave = async (layout: DashLayout) => {
    await dashAPI.saveLayout(layout)
    await loadLayouts()
    setIsDirty(false)
  }

  const handleOpenGlobalSettings = async () => {
    const gs = await dashAPI.getGlobalSettings()
    setGlobalSettings(gs)
    setGlobalSaveStatus('idle')
    setMode('global-settings')
  }

  const handleGlobalSettingsChange = (theme: Partial<DashTheme>, domain: Partial<DomainPalette>) => {
    setGlobalSettings(prev => prev ? {
      ...prev,
      theme: { ...HARDCODED_THEME, ...theme } as DashTheme,
      domainPalette: domain,
    } : prev)
  }

  const handleGlobalFormatPreferencesChange = (prefs: Partial<FormatPreferences>) => {
    setGlobalSettings(prev => prev ? { ...prev, formatPreferences: prefs } : prev)
  }

  const handleGlobalSave = async () => {
    if (!globalSettings) return
    setGlobalSaving(true)
    try {
      await dashAPI.saveGlobalSettings(globalSettings)
      setGlobalSaveStatus('saved')
      setTimeout(() => setGlobalSaveStatus('idle'), 2000)
    } catch {
      setGlobalSaveStatus('error')
    } finally {
      setGlobalSaving(false)
    }
  }

  if (mode === 'edit' && editLayout) {
    void editingId
    return (
      <DashEditMode
        layout={editLayout}
        onSave={handleSave}
        onBack={() => { setMode('list'); setEditLayout(null); setEditingId(null) }}
        onDirtyChange={setIsDirty}
      />
    )
  }

  if (mode === 'global-settings') {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-6 py-3 flex-shrink-0">
          <button onClick={() => setMode('list')} className="font-mono text-[10px] text-text-muted hover:text-foreground">← BACK</button>
          <span className="font-mono text-[10px] text-text-muted">|</span>
          <span className="font-bold text-sm flex-1">Global Dash Settings</span>
          {globalSaveStatus === 'saved' && <Badge variant="success" className="terminal-header">SAVED</Badge>}
          {globalSaveStatus === 'error' && <Badge variant="destructive" className="terminal-header">FAILED</Badge>}
          <Button variant="primary" size="sm" onClick={handleGlobalSave} disabled={globalSaving}>
            {globalSaving ? 'SAVING\u2026' : 'SAVE'}
          </Button>
        </div>
        {globalSettings && (
          <AdditionalSettingsPanel
            theme={globalSettings.theme ?? {}}
            domainPalette={globalSettings.domainPalette ?? {}}
            hardcodedDefaults={{ theme: HARDCODED_THEME, domain: HARDCODED_DOMAIN }}
            formatPreferences={globalSettings.formatPreferences ?? {}}
            onChange={handleGlobalSettingsChange}
            onFormatPreferencesChange={handleGlobalFormatPreferencesChange}
          />
        )}
      </div>
    )
  }

  return (
    <DashList
      layouts={layouts}
      onEdit={handleEdit}
      onCreate={handleCreate}
      onDelete={async (id) => { await dashAPI.deleteLayout(id); await loadLayouts() }}
      onSetDefault={async (id) => { await dashAPI.setDefault(id); await loadLayouts() }}
      onOpenGlobalSettings={handleOpenGlobalSettings}
    />
  )
})

export default DashEditor
