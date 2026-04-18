import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  type DashLayout,
  type LayoutMeta,
  type GlobalDashSettings,
  type DashTheme,
  type DomainPalette,
  type FormatPreferences,
  DEFAULT_DASH_THEME,
  DEFAULT_DOMAIN_PALETTE,
  dashAPI,
} from '@/lib/dash'
import { DashList } from '@/components/DashList'
import { DashEditMode } from '@/components/DashEditMode'
import { AdditionalSettingsPanel } from '@/components/AdditionalSettingsPanel'
import { Badge, Button, PageHeader } from '@sprint/ui'

export interface DashEditorHandle {
  isDirty: boolean
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
      theme: { ...DEFAULT_DASH_THEME, ...theme } as DashTheme,
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
        <PageHeader
          heading="GLOBAL_DASH_SETTINGS"
          caption="Theme, domain palette, and formatting defaults"
          status={(
            <>
              {globalSaveStatus === 'saved' && <Badge variant="success" className="terminal-header">SAVED</Badge>}
              {globalSaveStatus === 'error' && <Badge variant="destructive" className="terminal-header">FAILED</Badge>}
            </>
          )}
          actions={(
            <>
              <Button variant="outline" size="sm" onClick={() => setMode('list')}>
                BACK
              </Button>
              <Button variant="primary" size="sm" onClick={handleGlobalSave} disabled={globalSaving}>
                {globalSaving ? 'SAVING…' : 'SAVE'}
              </Button>
            </>
          )}
        />
        {globalSettings && (
          <AdditionalSettingsPanel
            theme={globalSettings.theme ?? {}}
            domainPalette={globalSettings.domainPalette ?? {}}
            hardcodedDefaults={{ theme: DEFAULT_DASH_THEME, domain: DEFAULT_DOMAIN_PALETTE }}
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
