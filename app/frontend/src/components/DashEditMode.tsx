import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Badge, Button, PageHeader,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  cn,
} from '@sprint/ui'
import {
  type DashLayout, type DashPage, type DashWidget, type WidgetCatalogEntry,
  type DashTheme, type DomainPalette, type AlertInstance, type AlertMeta,
  type FormatPreferences,
  widgetCatalogAPI, deviceAPI, deviceHasScreen, dashAPI, alertCatalogAPI,
} from '@/lib/dash'
import { DashCanvas, DEFAULT_SCREEN_W, DEFAULT_SCREEN_H } from '@/components/DashCanvas'
import { PageTabs } from '@/components/PageTabs'
import { WidgetProperties } from './WidgetProperties'
import { useUnsavedChanges, useNavigationGuard } from '@/hooks/useUnsavedChanges'
import { ConfirmDialog } from './ConfirmDialog'
import { AdditionalSettingsPanel } from './AdditionalSettingsPanel'
import { AlertsEditor } from './AlertsEditor'
import { onEvent } from '@/lib/wails'

const CATEGORY_ORDER = ['layout', 'timing', 'car', 'race']

interface DashEditModeProps {
  layout: DashLayout
  onSave: (layout: DashLayout) => Promise<void>
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}

export function DashEditMode({ layout: initialLayout, onSave, onBack, onDirtyChange }: DashEditModeProps) {
  const [layout, setLayout]           = useState<DashLayout>(initialLayout)
  const [saving, setSaving]           = useState(false)
  const [saveStatus, setSaveStatus]   = useState<'idle' | 'saved' | 'error'>('idle')
  const [editorTab, setEditorTab]     = useState<'designer' | 'settings'>('designer')
  const [selectedId, setSelectedId]   = useState<number | null>(null)
  const [catalog, setCatalog]         = useState<WidgetCatalogEntry[]>([])
  const [alertCatalog, setAlertCatalog] = useState<AlertMeta[]>([])
  const [screenW, setScreenW]         = useState(DEFAULT_SCREEN_W)
  const [paletteDropType, setPaletteDropType] = useState<string | null>(null)
  const [screenH, setScreenH]         = useState(DEFAULT_SCREEN_H)
  const [activeTab, setActiveTab]     = useState<'idle' | 'alerts' | number>(0)
  const [livePageIndex, setLivePageIndex] = useState<number | null>(null)
  const [renamingDash, setRenamingDash] = useState(false)
  const [dashNameValue, setDashNameValue] = useState(initialLayout.name)
  const [confirmRemoveWidget, setConfirmRemoveWidget] = useState(false)

  const [canvasPaneEl, setCanvasPaneEl] = useState<HTMLDivElement | null>(null)
  const canvasPaneRef = useCallback((el: HTMLDivElement | null) => setCanvasPaneEl(el), [])
  const [fittedCanvas, setFittedCanvas] = useState<{ w: number; h: number } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!canvasPaneEl) return
    const ratio = screenW / screenH
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width / height > ratio) {
        setFittedCanvas({ w: Math.floor(height * ratio), h: Math.floor(height) })
      } else {
        setFittedCanvas({ w: Math.floor(width), h: Math.floor(width / ratio) })
      }
    })
    obs.observe(canvasPaneEl)
    return () => obs.disconnect()
  }, [canvasPaneEl, screenW, screenH])

  const hardcodedThemeDefault: DashTheme = {
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
  const hardcodedDomainDefault = {
    abs:       { R: 251, G: 191, B: 36,  A: 255 },
    tc:        { R: 90,  G: 248, B: 251, A: 255 },
    brakeBias: { R: 251, G: 191, B: 36,  A: 255 },
    energy:    { R: 52,  G: 211, B: 153, A: 255 },
    motor:     { R: 255, G: 144, B: 108, A: 255 },
    brakeMig:  { R: 90,  G: 248, B: 251, A: 255 },
  }

  const [globalDefaults, setGlobalDefaults] = useState<{ theme: DashTheme; domain: DomainPalette; formatPreferences?: Partial<FormatPreferences> } | undefined>(undefined)

  useEffect(() => {
    dashAPI.getGlobalSettings()
      .then(gs => setGlobalDefaults({ theme: gs.theme, domain: gs.domainPalette, formatPreferences: gs.formatPreferences }))
      .catch(() => {})
  }, [])

  const { isDirty, markSaved } = useUnsavedChanges(layout, initialLayout)
  const { showDialog, guardedNavigate, confirm, cancel } = useNavigationGuard(isDirty)

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])

  useEffect(() => {
    Promise.all([
      widgetCatalogAPI.getWidgetCatalog(),
      deviceAPI.getSavedDevices(),
      alertCatalogAPI.getAlertCatalog(),
    ]).then(([widgets, devs, alertsMeta]) => {
      setCatalog(widgets)
      setAlertCatalog(alertsMeta)
      const screen = devs.find(d => deviceHasScreen(d.type))
      if (screen) { setScreenW(screen.width); setScreenH(screen.height) }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    return onEvent('dash:page-changed', (data: { pageIndex: number }) => {
      setLivePageIndex(data.pageIndex)
    })
  }, [])

  // Start the Go-rendered preview when the editor mounts, stop when it unmounts.
  useEffect(() => {
    const isIdle = activeTab === 'idle'
    const pageIndex = typeof activeTab === 'number' ? activeTab : 0
    dashAPI.startPreview(layout, pageIndex, isIdle)
    return () => { dashAPI.stopPreview() }
    // Only on mount/unmount — layout changes are handled by the debounced effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to Go-rendered preview PNG frames.
  useEffect(() => {
    return onEvent('dash:preview', (data: { png: string }) => {
      setPreviewUrl(`data:image/png;base64,${data.png}`)
    })
  }, [])

  // Push layout/page changes to the Go preview renderer (debounced 150ms).
  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      const isIdle = activeTab === 'idle'
      const pageIndex = typeof activeTab === 'number' ? activeTab : 0
      dashAPI.updatePreview(layout, pageIndex, isIdle)
    }, 150)
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [layout, activeTab])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
        if (document.activeElement?.tagName === 'INPUT') return
        setConfirmRemoveWidget(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId])

  const doRemoveSelectedWidget = useCallback(() => {
    if (selectedId === null) return
    if (activeTab === 'idle') {
      setLayout(prev => ({
        ...prev,
        idlePage: { ...prev.idlePage, widgets: prev.idlePage.widgets.filter((_, wi) => wi !== selectedId) },
      }))
    } else {
      setLayout(prev => ({
        ...prev,
        pages: prev.pages.map((p, i) =>
          i === activeTab ? { ...p, widgets: p.widgets.filter((_, wi) => wi !== selectedId) } : p
        ),
      }))
    }
    setSelectedId(null)
  }, [selectedId, activeTab])

  const canvasWidgets = activeTab === 'idle'
    ? layout.idlePage.widgets
    : activeTab === 'alerts'
      ? []
      : (layout.pages[activeTab as number]?.widgets ?? [])

  const handleUpdate = useCallback((widgets: DashWidget[]) => {
    if (activeTab === 'idle') {
      setLayout(prev => ({ ...prev, idlePage: { ...prev.idlePage, widgets } }))
    } else if (activeTab !== 'alerts') {
      setLayout(prev => ({
        ...prev,
        pages: prev.pages.map((p, i) => i === activeTab ? { ...p, widgets } : p),
      }))
    }
  }, [activeTab])

  const handleAddPage = () => {
    const name = `Page ${layout.pages.length + 1}`
    const newPage: DashPage = { id: crypto.randomUUID(), name, widgets: [] }
    setLayout(prev => ({ ...prev, pages: [...prev.pages, newPage] }))
    setActiveTab(layout.pages.length)
    setSelectedId(null)
  }

  const handleDeletePage = (idx: number) => {
    if (layout.pages.length <= 1) return
    setLayout(prev => ({ ...prev, pages: prev.pages.filter((_, i) => i !== idx) }))
    setActiveTab(prev => typeof prev === 'number' && prev >= idx ? Math.max(0, prev - 1) : prev)
    setSelectedId(null)
  }

  const handleRenamePage = (idx: number, name: string) => {
    setLayout(prev => ({
      ...prev,
      pages: prev.pages.map((p, i) => i === idx ? { ...p, name } : p),
    }))
  }

  const handleClearPage = () => {
    if (activeTab === 'idle') {
      setLayout(prev => ({ ...prev, idlePage: { ...prev.idlePage, widgets: [] } }))
    } else {
      setLayout(prev => ({
        ...prev,
        pages: prev.pages.map((p, i) => i === activeTab ? { ...p, widgets: [] } : p),
      }))
    }
    setSelectedId(null)
  }

  const handleSettingsChange = (theme: Partial<DashTheme>, domain: Partial<DomainPalette>) => {
    setLayout(prev => ({
      ...prev,
      theme: { ...hardcodedThemeDefault, ...theme } as DashTheme,
      domainPalette: domain,
    }))
  }

  const handleFormatPreferencesChange = (prefs: Partial<FormatPreferences>) => {
    setLayout(prev => ({ ...prev, formatPreferences: Object.keys(prefs).length === 0 ? undefined : prefs }))
  }

  const handleAlertsChange = useCallback((instances: AlertInstance[]) => {
    setLayout(prev => ({ ...prev, alerts: instances }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(layout)
      markSaved(layout)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => guardedNavigate(onBack)

  const selectedWidget = selectedId !== null ? (canvasWidgets[selectedId] ?? null) : null
  const paletteWidgets = activeTab === 'idle'
    ? catalog.filter(w => w.idleCapable)
    : activeTab === 'alerts'
      ? []
      : catalog

  const updateSelectedWidget = (updated: DashWidget) => {
    if (selectedId === null) return
    handleUpdate(canvasWidgets.map((w, i) => i === selectedId ? updated : w))
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        heading={renamingDash ? (
          <input
            autoFocus
            value={dashNameValue}
            onChange={e => setDashNameValue(e.target.value)}
            onBlur={() => {
              const name = dashNameValue.trim() || layout.name
              setLayout(prev => ({ ...prev, name }))
              setDashNameValue(name)
              setRenamingDash(false)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { setDashNameValue(layout.name); setRenamingDash(false) }
              e.stopPropagation()
            }}
            className="min-w-0 bg-background px-1 font-bold text-sm outline outline-1 outline-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setDashNameValue(layout.name); setRenamingDash(true) }}
            className="group flex items-center gap-1.5 text-left"
            aria-label="Rename dash layout"
          >
            <span className="truncate font-bold text-sm transition-colors group-hover:text-accent">
              {layout.name}
            </span>
            <PencilIcon className="flex-shrink-0 text-text-disabled transition-colors group-hover:text-accent" />
          </button>
        )}
        caption="DASH_STUDIO"
        status={(
          <>
            {isDirty && <Badge variant="warning" className="terminal-header">DIRTY</Badge>}
            {saveStatus === 'saved' && <Badge variant="success" className="terminal-header">SAVED</Badge>}
            {saveStatus === 'error' && <Badge variant="destructive" className="terminal-header">FAILED</Badge>}
          </>
        )}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={handleBack}>
              BACK
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'SAVING…' : 'SAVE'}
            </Button>
          </>
        )}
      />

      <ConfirmDialog
        open={showDialog}
        title="Discard changes?"
        message="You have unsaved changes that will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        onConfirm={confirm}
        onCancel={cancel}
      />

      <div className="flex flex-shrink-0 items-stretch border-b border-border bg-background">
        <button
          onClick={() => setEditorTab('designer')}
          className={cn(
            'flex items-center px-4 h-9 font-mono text-[11px] font-medium transition-colors whitespace-nowrap border-b-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80',
            editorTab === 'designer'
              ? 'border-primary text-foreground bg-white/[0.04]'
              : 'border-transparent text-text-muted hover:text-foreground hover:bg-white/[0.02]'
          )}
        >
          DESIGNER
        </button>
        <button
          onClick={() => setEditorTab('settings')}
          className={cn(
            'flex items-center px-4 h-9 font-mono text-[11px] font-medium transition-colors whitespace-nowrap border-b-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80',
            editorTab === 'settings'
              ? 'border-primary text-foreground bg-white/[0.04]'
              : 'border-transparent text-text-muted hover:text-foreground hover:bg-white/[0.02]'
          )}
        >
          SETTINGS
        </button>
      </div>

      {editorTab === 'designer' && (
        <PageTabs
          idlePage={layout.idlePage}
          pages={layout.pages}
          activeTab={activeTab}
          livePageIndex={livePageIndex}
          onSelectTab={tab => { setActiveTab(tab); setSelectedId(null) }}
          onSelectAlerts={() => { setActiveTab('alerts'); setSelectedId(null) }}
          onAddPage={handleAddPage}
          onDeletePage={handleDeletePage}
          onRenamePage={handleRenamePage}
        />
      )}

      {editorTab === 'settings' ? (
        <AdditionalSettingsPanel
          theme={layout.theme ?? {}}
          domainPalette={layout.domainPalette ?? {}}
          hardcodedDefaults={{ theme: hardcodedThemeDefault, domain: hardcodedDomainDefault }}
          globalDefaults={globalDefaults}
          formatPreferences={layout.formatPreferences ?? {}}
          globalFormatPreferences={globalDefaults?.formatPreferences}
          onChange={handleSettingsChange}
          onFormatPreferencesChange={handleFormatPreferencesChange}
        />
      ) : activeTab === 'alerts' ? (
        <AlertsEditor
          instances={layout.alerts ?? []}
          catalog={alertCatalog}
          domainPalette={layout.domainPalette}
          onChange={handleAlertsChange}
        />
      ) : (
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Left: widget palette */}
            <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden border-r border-border">
              <div className="border-b border-border px-4 py-3">
                <h4 className="terminal-header text-[10px] font-bold text-text-muted">WIDGET_PALETTE</h4>
              </div>
              <div className="flex-1 overflow-y-auto">
                <TooltipProvider>
                  <WidgetPalette
                    catalog={paletteWidgets}
                    onDragStart={setPaletteDropType}
                    onDragEnd={() => setPaletteDropType(null)}
                  />
                </TooltipProvider>
              </div>
            </div>

            {/* Center: canvas */}
            <div className="flex flex-1 flex-col overflow-hidden p-6 gap-3 min-w-0">
              <div
                ref={canvasPaneRef}
                className="flex flex-1 min-h-0 items-center justify-center overflow-hidden"
              >
                <div style={fittedCanvas ? { width: fittedCanvas.w, height: fittedCanvas.h } : { width: '100%' }}>
                  <DashCanvas
                    widgets={canvasWidgets}
                    gridCols={layout.gridCols}
                    gridRows={layout.gridRows}
                    selectedId={selectedId}
                    catalog={catalog}
                    screenW={screenW}
                    screenH={screenH}
                    theme={layout.theme ?? hardcodedThemeDefault}
                    domainPalette={layout.domainPalette ?? hardcodedDomainDefault}
                    paletteDropType={paletteDropType}
                    previewUrl={previewUrl ?? undefined}
                    onSelect={setSelectedId}
                    onUpdate={handleUpdate}
                  />
                </div>
              </div>

              <div className="flex h-7 flex-shrink-0 items-center gap-4 font-mono text-[10px]">
                {selectedWidget ? (
                  <>
                    <Badge variant="active" className="terminal-header">{selectedWidget.type}</Badge>
                    <span className="text-text-muted">
                      COL:{selectedWidget.col} ROW:{selectedWidget.row} W:{selectedWidget.colSpan} H:{selectedWidget.rowSpan}
                    </span>
                  </>
                ) : (
                  <span className="text-text-muted">DRAG_WIDGET_TO_CANVAS</span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <Button
                    onClick={handleClearPage}
                    variant="ghost"
                    size="xs"
                    className="h-auto border-0 px-0 text-text-muted hover:bg-transparent hover:text-foreground"
                  >
                    CLEAR
                  </Button>
                  {selectedWidget && (
                    <Button
                      onClick={() => setConfirmRemoveWidget(true)}
                      variant="ghost"
                      size="xs"
                      className="h-auto border-0 px-0 text-text-muted hover:bg-transparent hover:text-destructive"
                    >
                      REMOVE
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Right: properties panel */}
            <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden border-l border-border">
              <div className="border-b border-border px-4 py-3">
                <h4 className="terminal-header text-[10px] font-bold text-text-muted">PROPERTIES</h4>
              </div>
              <div className="flex-1 overflow-y-auto">
                <WidgetProperties
                  widget={selectedWidget}
                  catalog={catalog}
                  onUpdate={updateSelectedWidget}
                />
              </div>
            </div>
          </div>
          )}

      <ConfirmDialog
        open={confirmRemoveWidget}
        title="Remove widget?"
        message={selectedWidget ? `Remove "${selectedWidget.type}" widget from this page?` : 'Remove selected widget?'}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={() => { doRemoveSelectedWidget(); setConfirmRemoveWidget(false) }}
        onCancel={() => setConfirmRemoveWidget(false)}
      />
    </div>
  )
}

function WidgetPalette({
  catalog,
  onDragStart,
  onDragEnd,
}: {
  catalog: WidgetCatalogEntry[]
  onDragStart?: (type: string) => void
  onDragEnd?: () => void
}) {
  const knownCategories = CATEGORY_ORDER.filter(c => catalog.some(w => w.category === c))
  const extraCategories = [...new Set(catalog.map(w => w.category))].filter(c => !CATEGORY_ORDER.includes(c))
  const categories = [...knownCategories, ...extraCategories]

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (catalog.length === 0) {
    return (
      <div className="p-4 text-center font-mono text-[10px] text-text-muted">
        LOADING_CATALOG…
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {categories.map(cat => {
        const isCollapsed = collapsed[cat] ?? false
        const catLabel = catalog.find(w => w.category === cat)?.categoryLabel ?? cat
        return (
          <div key={cat}>
            <button
              onClick={() => setCollapsed(prev => ({ ...prev, [cat]: !isCollapsed }))}
              className="flex w-full items-center gap-1.5 px-3 pt-3 pb-1 hover:text-foreground transition-colors"
            >
              <svg
                width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                className={cn('text-text-disabled flex-shrink-0 transition-transform duration-150', isCollapsed ? '-rotate-90' : '')}
              >
                <polygon points="0,0 8,0 4,8" />
              </svg>
              <span className="font-mono text-[9px] font-bold text-text-disabled uppercase tracking-wider">
                {catLabel}
              </span>
            </button>
            {!isCollapsed && (
              <div className="px-3 pb-2">
                <WidgetList
                  widgets={catalog.filter(w => w.category === cat)}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WidgetList({
  widgets,
  onDragStart,
  onDragEnd,
}: {
  widgets: ReadonlyArray<{ type: string; label: string }>
  onDragStart?: (type: string) => void
  onDragEnd?: () => void
}) {
  return (
    <div className="space-y-1">
      {widgets.map(w => (
        <TooltipProvider key={w.type}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                draggable
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'copy'
                  e.dataTransfer.setData('widget-type', w.type)
                  const blank = document.createElement('div')
                  blank.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px'
                  document.body.appendChild(blank)
                  e.dataTransfer.setDragImage(blank, 0, 0)
                  requestAnimationFrame(() => blank.remove())
                  onDragStart?.(w.type)
                }}
                onDragEnd={() => onDragEnd?.()}
                className={cn(
                  'flex w-full cursor-grab select-none items-center gap-2 border border-border px-2 py-1.5 active:cursor-grabbing',
                  'font-mono text-[10px] text-text-muted transition-colors',
                  'hover:border-border-strong hover:text-foreground',
                )}
              >
                <WidgetDragIcon />
                {w.label}
              </div>
            </TooltipTrigger>
            <TooltipContent>Drag onto canvas to add</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  )
}

function WidgetDragIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="text-text-disabled flex-shrink-0">
      <circle cx="3" cy="3"  r="1.5" fill="currentColor" />
      <circle cx="7" cy="3"  r="1.5" fill="currentColor" />
      <circle cx="3" cy="7"  r="1.5" fill="currentColor" />
      <circle cx="7" cy="7"  r="1.5" fill="currentColor" />
      <circle cx="3" cy="11" r="1.5" fill="currentColor" />
      <circle cx="7" cy="11" r="1.5" fill="currentColor" />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7.5 1.5 9.5 3.5 3.5 9.5H1.5v-2z" />
    </svg>
  )
}
