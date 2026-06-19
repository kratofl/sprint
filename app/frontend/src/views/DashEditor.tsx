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
  resolveDomainPalette,
  resolveDashTheme,
} from '@/lib/dash'
import { DashList } from '@/components/DashList'
import { DashEditMode } from '@/components/DashEditMode'
import { AdditionalSettingsPanel } from '@/components/AdditionalSettingsPanel'
import { isDesktopRuntimeAvailable } from '@/lib/wails'
import { Badge, Button, PageHeader } from '@sprint/ui'
import { getDashEditorRuntimeNotice } from './dashEditorRuntime'

export interface DashEditorHandle {
  isDirty: boolean
}

const DashEditor = forwardRef<DashEditorHandle>(function DashEditor(_, ref) {
  const desktopRuntimeAvailable = isDesktopRuntimeAvailable()
  const runtimeNotice = getDashEditorRuntimeNotice(desktopRuntimeAvailable)
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

  useEffect(() => {
    if (!desktopRuntimeAvailable) return
    void loadLayouts()
  }, [desktopRuntimeAvailable, loadLayouts])

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
      theme: resolveDashTheme(undefined, theme),
      domainPalette: resolveDomainPalette(undefined, domain),
    } : prev)
  }

  const handleGlobalTypographyChange = (typography: GlobalDashSettings['typography']) => {
    setGlobalSettings(prev => prev ? { ...prev, typography } : prev)
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

  if (runtimeNotice) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader
          heading="Dashboards"
          caption="Use the real Wails desktop window for dashboard creation, live preview, and agent-driven UI inspection."
          status={<Badge variant="warning" className="ui-label">{runtimeNotice.title}</Badge>}
        />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex w-full max-w-3xl flex-col gap-5 rounded-card border border-border bg-[var(--panel)] p-5">
            <div className="space-y-2">
              <p className="font-sans tabular-nums text-[10px] leading-relaxed text-[var(--text)]">{runtimeNotice.description}</p>
              <p className="font-sans tabular-nums text-[10px] leading-relaxed text-[var(--text2)]">{runtimeNotice.browserHint}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <p className="ui-label text-[9px] font-bold text-[var(--text2)]">1. LAUNCH_DESKTOP</p>
                <div className="rounded-control border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 font-sans tabular-nums text-[10px] text-[var(--text)]">
                  {runtimeNotice.launchCommand}
                </div>
              </div>

              <div className="space-y-2">
                <p className="ui-label text-[9px] font-bold text-[var(--text2)]">2. WAIT_FOR_WAILS_DEVSERVER</p>
                <div className="rounded-control border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 font-sans tabular-nums text-[10px] text-[var(--text)]">
                  {runtimeNotice.waitCommand}
                </div>
              </div>

              <div className="space-y-2">
                <p className="ui-label text-[9px] font-bold text-[var(--text2)]">3. OPEN_WITH_PLAYWRIGHT_MCP</p>
                <div className="rounded-control border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 font-sans tabular-nums text-[10px] text-[var(--text)]">
                  {runtimeNotice.browserSurfaceUrl}
                </div>
                <p className="font-sans tabular-nums text-[9px] leading-relaxed text-[var(--text2)]">{runtimeNotice.browserSurfaceNote}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
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
          heading="Global dashboard settings"
          caption="Theme, domain palette, and formatting defaults"
          status={(
            <>
              {globalSaveStatus === 'saved' && <Badge variant="success" className="ui-label">Saved</Badge>}
              {globalSaveStatus === 'error' && <Badge variant="destructive" className="ui-label">Failed</Badge>}
            </>
          )}
          actions={(
            <>
              <Button variant="outline" size="sm" onClick={() => setMode('list')}>
                Back
              </Button>
              <Button variant="primary" size="sm" onClick={handleGlobalSave} disabled={globalSaving}>
                {globalSaving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        />
        {globalSettings && (
          <AdditionalSettingsPanel
            theme={globalSettings.theme ?? {}}
            domainPalette={globalSettings.domainPalette ?? {}}
            hardcodedDefaults={{ theme: DEFAULT_DASH_THEME, domain: DEFAULT_DOMAIN_PALETTE }}
            typography={globalSettings.typography ?? {}}
            formatPreferences={globalSettings.formatPreferences ?? {}}
            onChange={handleGlobalSettingsChange}
            onTypographyChange={handleGlobalTypographyChange}
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
