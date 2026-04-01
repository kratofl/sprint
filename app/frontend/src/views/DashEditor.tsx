import { useState, useEffect, useCallback } from 'react'
import {
  Badge, Button,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  cn,
} from '@sprint/ui'
import { DashCanvas, DEFAULT_SCREEN_W, DEFAULT_SCREEN_H } from '@/components/DashCanvas'
import {
  type DashLayout, type DashWidget, type WidgetCatalogEntry,
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

// DashEditor.

export default function DashEditor() {
  const [layout, setLayout]         = useState<DashLayout>({ widgets: [] })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [screen, setScreen]         = useState<ScreenConfig | null>(null)
  const [saving, setSaving]         = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [loadError, setLoadError]   = useState<string | null>(null)
  const [catalog, setCatalog]       = useState<WidgetCatalogEntry[]>([])

  // Load saved layout, screen config and widget catalog on mount.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      dashAPI.loadLayout(),
      deviceScreenAPI.getScreen(),
      widgetCatalogAPI.getWidgetCatalog(),
    ])
      .then(([savedLayout, cfg, widgets]) => {
        if (cancelled) return
        setLayout(savedLayout)
        setScreen(cfg)
        setCatalog(widgets)
      })
      .catch(e => {
        if (!cancelled) setLoadError(String(e))
      })
    return () => { cancelled = true }
  }, [])

  // Delete selected widget with keyboard.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
        // Avoid deleting when an input is focused.
        if (document.activeElement?.tagName === 'INPUT') return
        setLayout(prev => ({
          widgets: prev.widgets.filter((_, i) => i !== selectedId),
        }))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId])

  const handleUpdate = useCallback((widgets: DashWidget[]) => {
    setLayout({ widgets })
  }, [])

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
    setLayout({ widgets: [] })
    setSelectedId(null)
  }

  const selectedWidget = selectedId !== null ? layout.widgets[selectedId] : null
  const screenW = screen?.width  ?? DEFAULT_SCREEN_W
  const screenH = screen?.height ?? DEFAULT_SCREEN_H

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Section header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
        <div>
          <h2 className="terminal-header mb-0.5 text-sm font-bold tracking-[0.2em]">DASH_STUDIO</h2>
          <p className="font-mono text-[10px] text-text-muted">
            {layout.widgets.length} widget{layout.widgets.length !== 1 ? 's' : ''} · {screenW}×{screenH}
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
            disabled={saving}
            variant="primary"
            className="terminal-header font-bold"
          >
            {saving ? 'SAVING…' : 'SAVE_LAYOUT'}
          </Button>
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
            layout={layout}
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
                  X:{selectedWidget.x} Y:{selectedWidget.y} W:{selectedWidget.w} H:{selectedWidget.h}
                </span>
                <Button
                  onClick={() => { setLayout(prev => ({ widgets: prev.widgets.filter((_, i) => i !== selectedId) })); setSelectedId(null) }}
                  variant="ghost"
                  size="xs"
                  className="ml-auto h-auto border-0 px-0 text-text-muted hover:bg-transparent hover:text-destructive"
                >
                  REMOVE
                </Button>
              </>
            ) : (
              <span className="text-text-muted">
                {layout.widgets.length === 0 ? 'DRAG_WIDGET_TO_CANVAS' : `${layout.widgets.length}_WIDGETS — CLICK_TO_SELECT`}
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
  // Derive ordered categories from the catalog; filter to known order first,
  // then append any unknown categories that come from new widgets.
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

