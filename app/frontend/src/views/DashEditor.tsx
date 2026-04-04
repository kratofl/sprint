import { useState, useEffect, useCallback } from 'react'
import {
  Badge, Button,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  cn,
} from '@sprint/ui'
import { DashCanvas, DEFAULT_SCREEN_W, DEFAULT_SCREEN_H } from '@/components/DashCanvas'
import {
  type DashLayout, type DashWidget, type WidgetCatalogEntry, type LayoutMeta,
  dashAPI, deviceScreenAPI, widgetCatalogAPI, type ScreenConfig,
} from '@/lib/dash'

// Category display order for the widget palette tabs.
const CATEGORY_ORDER = ['layout', 'timing', 'car', 'race']
const CATEGORY_LABEL: Record<string, string> = {
  layout: 'LAYOUT',
  timing: 'TIMING',
  car:    'CAR',
  race:   'RACE',
}

const EMPTY_LAYOUT: DashLayout = {
  id: '', name: '', default: false,
  gridCols: 20, gridRows: 12,
  idlePage: { id: '', name: 'Idle', widgets: [] },
  pages:    [{ id: '', name: 'Main', widgets: [] }],
  alerts:   { tcChange: false, absChange: false, engineMapChange: false },
}

// DashEditor.

export default function DashEditor() {
  const [layouts, setLayouts]           = useState<LayoutMeta[]>([])
  const [activeID, setActiveID]         = useState<string>('')
  const [layout, setLayout]             = useState<DashLayout>(EMPTY_LAYOUT)
  const [selectedId, setSelectedId]     = useState<number | null>(null)
  const [screen, setScreen]             = useState<ScreenConfig | null>(null)
  const [saving, setSaving]             = useState(false)
  const [saveStatus, setSaveStatus]     = useState<'idle' | 'saved' | 'error'>('idle')
  const [loadError, setLoadError]       = useState<string | null>(null)
  const [catalog, setCatalog]           = useState<WidgetCatalogEntry[]>([])
  const [creatingNew, setCreatingNew]   = useState(false)
  const [newName, setNewName]           = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [activePage, _setActivePage]    = useState(0)

  const activePageWidgets = layout.pages[activePage]?.widgets ?? []
  const widgetCount = activePageWidgets.length

  const loadLayoutList = useCallback(async () => {
    const metas = await dashAPI.listLayouts()
    setLayouts(metas)
    return metas
  }, [])

  // Load layout list, first layout, screen config and widget catalog on mount.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      dashAPI.listLayouts(),
      deviceScreenAPI.getScreen(),
      widgetCatalogAPI.getWidgetCatalog(),
    ])
      .then(async ([metas, cfg, widgets]) => {
        if (cancelled) return
        setLayouts(metas)
        setScreen(cfg)
        setCatalog(widgets)

        const firstID = metas[0]?.id ?? ''
        setActiveID(firstID)
        if (firstID) {
          const loaded = await dashAPI.loadLayoutByID(firstID)
          if (!cancelled) setLayout(loaded)
        }
      })
      .catch(e => {
        if (!cancelled) setLoadError(String(e))
      })
    return () => { cancelled = true }
  }, [])

  const switchLayout = useCallback(async (id: string) => {
    setActiveID(id)
    setSelectedId(null)
    try {
      const loaded = await dashAPI.loadLayoutByID(id)
      setLayout(loaded)
    } catch (e) {
      setLoadError(String(e))
    }
  }, [])

  // Delete selected widget with keyboard.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
        if (document.activeElement?.tagName === 'INPUT') return
        setLayout(prev => ({
          ...prev,
          pages: prev.pages.map((p, i) =>
            i === activePage ? { ...p, widgets: p.widgets.filter((_, wi) => wi !== selectedId) } : p
          ),
        }))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, activePage])

  const handleUpdate = useCallback((widgets: DashWidget[]) => {
    setLayout(prev => ({
      ...prev,
      pages: prev.pages.map((p, i) => i === activePage ? { ...p, widgets } : p),
    }))
  }, [activePage])

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    try {
      await dashAPI.saveLayout(layout)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const handleClearLayout = () => {
    setLayout(prev => ({
      ...prev,
      pages: prev.pages.map((p, i) => i === activePage ? { ...p, widgets: [] } : p),
    }))
    setSelectedId(null)
  }

  const handleCreateLayout = async () => {
    const name = newName.trim() || 'Untitled'
    setCreatingNew(true)
    try {
      const created = await dashAPI.createLayout(name)
      const metas = await loadLayoutList()
      setLayouts(metas)
      setActiveID(created.id)
      setLayout(created)
      setSelectedId(null)
      setNewName('')
      setShowNewInput(false)
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setCreatingNew(false)
    }
  }

  const handleDeleteLayout = async () => {
    if (!activeID || layouts.length <= 1) return
    try {
      await dashAPI.deleteLayout(activeID)
      const metas = await loadLayoutList()
      setLayouts(metas)
      const next = metas[0]?.id ?? ''
      setActiveID(next)
      if (next) {
        const loaded = await dashAPI.loadLayoutByID(next)
        setLayout(loaded)
      } else {
        setLayout(EMPTY_LAYOUT)
      }
      setSelectedId(null)
    } catch (e) {
      setLoadError(String(e))
    }
  }

  const selectedWidget = selectedId !== null ? activePageWidgets[selectedId] : null
  const screenW = screen?.width  ?? DEFAULT_SCREEN_W
  const screenH = screen?.height ?? DEFAULT_SCREEN_H

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Section header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
        <div>
          <h2 className="terminal-header mb-0.5 text-sm font-bold tracking-[0.2em]">DASH_STUDIO</h2>
          <p className="font-mono text-[10px] text-text-muted">
            {widgetCount} widget{widgetCount !== 1 ? 's' : ''} · {screenW}×{screenH}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <Badge variant="success" className="terminal-header">SAVED</Badge>
          )}
          {saveStatus === 'error' && (
            <Badge variant="destructive" className="terminal-header">SAVE_FAILED</Badge>
          )}
          <Button
            onClick={handleClearLayout}
            variant="neutral"
            className="terminal-header font-bold"
          >
            CLEAR
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !activeID}
            variant="primary"
            className="terminal-header font-bold"
          >
            {saving ? 'SAVING…' : 'SAVE_LAYOUT'}
          </Button>
        </div>
      </div>

      {/* Layout selector bar */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-2 flex-shrink-0 overflow-x-auto">
        <span className="font-mono text-[9px] text-text-muted flex-shrink-0">LAYOUT:</span>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {layouts.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => switchLayout(m.id)}
              className={cn(
                'rounded px-2 py-0.5 font-mono text-[9px] transition-colors whitespace-nowrap border',
                m.id === activeID
                  ? 'bg-primary text-background border-primary'
                  : 'bg-background text-text-muted border-border hover:text-foreground',
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {showNewInput ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateLayout()
                  if (e.key === 'Escape') { setShowNewInput(false); setNewName('') }
                }}
                placeholder="Layout name"
                className="w-28 rounded bg-background px-1 font-mono text-[9px] outline outline-1 outline-primary"
              />
              <Button
                size="xs"
                variant="primary"
                className="terminal-header h-5 px-1.5 text-[9px]"
                onClick={handleCreateLayout}
                disabled={creatingNew}
              >
                OK
              </Button>
              <Button
                size="xs"
                variant="neutral"
                className="terminal-header h-5 px-1.5 text-[9px]"
                onClick={() => { setShowNewInput(false); setNewName('') }}
              >
                ✕
              </Button>
            </div>
          ) : (
            <Button
              size="xs"
              variant="neutral"
              className="terminal-header h-5 px-1.5 text-[9px]"
              onClick={() => setShowNewInput(true)}
            >
              + NEW
            </Button>
          )}
          {layouts.length > 1 && activeID && (
            <Button
              size="xs"
              variant="ghost"
              className="terminal-header h-5 px-1.5 text-[9px] text-destructive hover:bg-destructive/10"
              onClick={handleDeleteLayout}
            >
              DEL
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="border-b border-border px-6 py-2 font-mono text-[10px] text-destructive">{loadError}</div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Canvas column */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-border p-6 gap-3 min-w-0">
          <DashCanvas
            widgets={activePageWidgets}
            gridCols={layout.gridCols}
            gridRows={layout.gridRows}
            selectedId={selectedId}
            screenW={screenW}
            screenH={screenH}
            onSelect={setSelectedId}
            onUpdate={handleUpdate}
          />

          {/* Selected widget status bar */}
          <div className="flex h-7 flex-shrink-0 items-center gap-4 font-mono text-[10px]">
            {selectedWidget ? (
              <>
                <Badge variant="active" className="terminal-header">{selectedWidget.type}</Badge>
                <span className="text-text-muted">
                  COL:{selectedWidget.col} ROW:{selectedWidget.row} W:{selectedWidget.colSpan} H:{selectedWidget.rowSpan}
                </span>
                <Button
                  onClick={() => {
                    setLayout(prev => ({
                      ...prev,
                      pages: prev.pages.map((p, i) =>
                        i === activePage ? { ...p, widgets: p.widgets.filter((_, wi) => wi !== selectedId) } : p
                      ),
                    }))
                    setSelectedId(null)
                  }}
                  variant="ghost"
                  size="xs"
                  className="ml-auto h-auto border-0 px-0 text-text-muted hover:bg-transparent hover:text-destructive"
                >
                  REMOVE
                </Button>
              </>
            ) : (
              <span className="text-text-muted">
                {widgetCount === 0 ? 'DRAG_WIDGET_TO_CANVAS' : `${widgetCount}_WIDGETS — CLICK_TO_SELECT`}
              </span>
            )}
          </div>
        </div>

        {/* Widget palette */}
        <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h4 className="terminal-header text-[10px] font-bold text-text-muted">WIDGET_PALETTE</h4>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TooltipProvider>
              <WidgetPalette catalog={catalog} />
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  )
}

// WidgetPalette.

function WidgetPalette({ catalog }: { catalog: WidgetCatalogEntry[] }) {
  const knownCategories = CATEGORY_ORDER.filter(c => catalog.some(w => w.category === c))
  const extraCategories = [...new Set(catalog.map(w => w.category))]
    .filter(c => !CATEGORY_ORDER.includes(c))
  const categories = [...knownCategories, ...extraCategories]

  if (catalog.length === 0) {
    return (
      <div className="p-4 text-center font-mono text-[10px] text-text-muted">
        LOADING_CATALOG…
      </div>
    )
  }

  const defaultTab = categories[0] ?? 'timing'

  return (
    <Tabs defaultValue={defaultTab}>
      <div className="border-b border-border">
        <TabsList variant="line" className="w-full">
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat} className="flex-1 text-[10px]">
              {CATEGORY_LABEL[cat] ?? cat.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="p-3">
        {categories.map(cat => (
          <TabsContent key={cat} value={cat}>
            <WidgetList widgets={catalog.filter(w => w.category === cat)} />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}

function WidgetList({
  widgets,
}: {
  widgets: ReadonlyArray<{ type: string; label: string }>
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
                }}
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


