import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  type DashLayout,
  type LayoutMeta,
  type GlobalDashSettings,
  type DashTheme,
  type DomainPalette,
  type FormatPreferences,
  type ThemePreset,
  DEFAULT_DASH_THEME,
  DEFAULT_DOMAIN_PALETTE,
  dashAPI,
  resolveDomainPalette,
  resolveDashTheme,
} from '@/lib/dash'
import { DashList } from '@/components/DashList'
import { DashEditMode } from '@/components/DashEditMode'
import { AdditionalSettingsPanel } from '@/components/AdditionalSettingsPanel'
import { ThemeManager } from '@/components/ThemeManager'
import { isDesktopRuntimeAvailable } from '@/lib/wails'
import { Badge, Button, Input, PageHeader } from '@sprint/ui'
import { getDashEditorRuntimeNotice } from './dashEditorRuntime'

export interface DashEditorHandle {
  isDirty: boolean
}

const DashEditor = forwardRef<DashEditorHandle>(function DashEditor(_, ref) {
  const desktopRuntimeAvailable = isDesktopRuntimeAvailable()
  const runtimeNotice = getDashEditorRuntimeNotice(desktopRuntimeAvailable)
  const [mode, setMode] = useState<'list' | 'edit' | 'global-settings' | 'theme-edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [layouts, setLayouts] = useState<LayoutMeta[]>([])
  const [editLayout, setEditLayout] = useState<DashLayout | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [globalSettings, setGlobalSettings] = useState<GlobalDashSettings | null>(null)
  const [globalSaving, setGlobalSaving] = useState(false)
  const [globalSaveStatus, setGlobalSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [themes, setThemes] = useState<ThemePreset[]>([])
  const [editingTheme, setEditingTheme] = useState<ThemePreset | null>(null)
  const [themeSaving, setThemeSaving] = useState(false)
  const [themeSaveStatus, setThemeSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

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

  const loadThemes = useCallback(async () => {
    try {
      setThemes(await dashAPI.listThemes())
    } catch {
      // ignore — themes are optional UI; rendering still works without them
    }
  }, [])

  const handleOpenGlobalSettings = async () => {
    const gs = await dashAPI.getGlobalSettings()
    setGlobalSettings(gs)
    await loadThemes()
    setGlobalSaveStatus('idle')
    setMode('global-settings')
  }

  const handleCreateTheme = () => {
    setEditingTheme({
      id: '',
      name: 'New theme',
      builtIn: false,
      theme: DEFAULT_DASH_THEME,
      domainPalette: DEFAULT_DOMAIN_PALETTE,
      typography: {},
    })
    setThemeSaveStatus('idle')
    setMode('theme-edit')
  }

  const handleDuplicateTheme = (id: string) => {
    const src = themes.find(theme => theme.id === id)
    if (!src) return
    setEditingTheme({ ...src, id: '', name: `${src.name} copy`, builtIn: false })
    setThemeSaveStatus('idle')
    setMode('theme-edit')
  }

  const handleEditTheme = (id: string) => {
    const src = themes.find(theme => theme.id === id)
    if (!src || src.builtIn) return
    setEditingTheme({ ...src })
    setThemeSaveStatus('idle')
    setMode('theme-edit')
  }

  const handleDeleteTheme = async (id: string) => {
    await dashAPI.deleteTheme(id)
    await loadThemes()
  }

  const handleThemeDraftChange = (theme: Partial<DashTheme>, domain: Partial<DomainPalette>) => {
    setEditingTheme(prev => prev ? {
      ...prev,
      theme: resolveDashTheme(undefined, theme),
      domainPalette: resolveDomainPalette(undefined, domain),
    } : prev)
  }

  const handleThemeTypographyChange = (typography: GlobalDashSettings['typography']) => {
    setEditingTheme(prev => prev ? { ...prev, typography } : prev)
  }

  const handleThemeSave = async () => {
    if (!editingTheme) return
    setThemeSaving(true)
    try {
      await dashAPI.saveTheme(editingTheme)
      await loadThemes()
      setThemeSaveStatus('saved')
      setTimeout(() => setThemeSaveStatus('idle'), 2000)
    } catch {
      setThemeSaveStatus('error')
    } finally {
      setThemeSaving(false)
    }
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
          caption="Theme library, global default palette, and formatting defaults"
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
        <ThemeManager
          themes={themes}
          onCreate={handleCreateTheme}
          onDuplicate={handleDuplicateTheme}
          onEdit={handleEditTheme}
          onDelete={handleDeleteTheme}
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

  if (mode === 'theme-edit' && editingTheme) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader
          heading="Edit theme"
          caption="Colors and typography for this theme preset"
          status={(
            <>
              {themeSaveStatus === 'saved' && <Badge variant="success" className="ui-label">Saved</Badge>}
              {themeSaveStatus === 'error' && <Badge variant="destructive" className="ui-label">Failed</Badge>}
            </>
          )}
          actions={(
            <>
              <Input
                value={editingTheme.name}
                onChange={e => setEditingTheme(prev => prev ? { ...prev, name: e.target.value } : prev)}
                aria-label="Theme name"
                className="h-8 w-[200px]"
              />
              <Button variant="outline" size="sm" onClick={() => { setMode('global-settings'); setEditingTheme(null) }}>
                Back
              </Button>
              <Button variant="primary" size="sm" onClick={handleThemeSave} disabled={themeSaving}>
                {themeSaving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        />
        <AdditionalSettingsPanel
          theme={editingTheme.theme}
          domainPalette={editingTheme.domainPalette}
          hardcodedDefaults={{ theme: DEFAULT_DASH_THEME, domain: DEFAULT_DOMAIN_PALETTE }}
          typography={editingTheme.typography ?? {}}
          onChange={handleThemeDraftChange}
          onTypographyChange={handleThemeTypographyChange}
        />
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
