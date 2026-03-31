import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card, CardContent, CardHeader, CardTitle,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  cn,
} from '@sprint/ui'
import { DashCanvas, DEFAULT_SCREEN_W, DEFAULT_SCREEN_H } from '@/components/DashCanvas'
import { type DashLayout, type DashWidget, WIDGET_TYPES, dashAPI, voCoreAPI, type VoCoreConfig } from '@/lib/dash'

// ── Widget by category ────────────────────────────────────────────────────────

const TIMING_WIDGETS = WIDGET_TYPES.filter(w => w.category === 'timing')
const CAR_WIDGETS    = WIDGET_TYPES.filter(w => w.category === 'car')
const RACE_WIDGETS   = WIDGET_TYPES.filter(w => w.category === 'race')

// ── DashEditor ────────────────────────────────────────────────────────────────

export default function DashEditor() {
  const [layout, setLayout]         = useState<DashLayout>({ widgets: [] })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [screen, setScreen]         = useState<VoCoreConfig | null>(null)
  const [saving, setSaving]         = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [loadError, setLoadError]   = useState<string | null>(null)

  // Load saved layout and screen config on mount.
  useEffect(() => {
    let cancelled = false
    Promise.all([dashAPI.loadLayout(), voCoreAPI.getSelected()])
      .then(([savedLayout, cfg]) => {
        if (cancelled) return
        setLayout(savedLayout)
        setScreen(cfg)
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
    <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="terminal-header text-sm text-foreground">Dash Studio</h1>
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="text-xs text-success">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-danger">Save failed</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearLayout}
            className="text-text-muted hover:text-text-primary"
          >
            Clear
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Layout'}
          </Button>
        </div>
      </div>

      {loadError && (
        <p className="text-xs text-red-400 flex-shrink-0">{loadError}</p>
      )}

      {/* Main area */}
      <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
        {/* Canvas column */}
        <div className="flex flex-1 flex-col gap-2 min-w-0">
          <DashCanvas
            layout={layout}
            selectedId={selectedId}
            screenW={screenW}
            screenH={screenH}
            onSelect={setSelectedId}
            onUpdate={handleUpdate}
          />

          {/* Selected widget info bar */}
          <div className="flex-shrink-0 h-8 flex items-center gap-3 px-1">
            {selectedWidget ? (
              <>
                <span className="text-xs text-text-muted">
                  {selectedWidget.type}
                </span>
                <span className="text-xs font-mono text-text-disabled tabular-nums">
                  x={selectedWidget.x} y={selectedWidget.y} w={selectedWidget.w} h={selectedWidget.h}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setLayout(prev => ({
                      widgets: prev.widgets.filter((_, i) => i !== selectedId),
                    }))
                    setSelectedId(null)
                  }}
                  className="ml-auto text-text-disabled hover:text-danger hover:bg-danger/10 h-6"
                >
                  Remove
                </Button>
              </>
            ) : (
              <span className="text-xs text-text-disabled">
                {layout.widgets.length === 0
                  ? 'Drag a widget from the palette onto the canvas'
                  : `${layout.widgets.length} widget${layout.widgets.length !== 1 ? 's' : ''} — click to select`}
              </span>
            )}
          </div>
        </div>

        {/* Widget palette */}
        <Card className="w-52 flex-shrink-0 flex flex-col overflow-hidden">
          <CardHeader className="border-b border-border-base flex-shrink-0">
            <CardTitle className="terminal-header text-[10px] text-on-surface-variant">
              Widgets
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto pt-3">
            <TooltipProvider>
              <Tabs defaultValue="timing">
                <TabsList variant="line" className="w-full mb-3">
                  <TabsTrigger value="timing" className="flex-1 text-xs">Timing</TabsTrigger>
                  <TabsTrigger value="car"    className="flex-1 text-xs">Car</TabsTrigger>
                  <TabsTrigger value="race"   className="flex-1 text-xs">Race</TabsTrigger>
                </TabsList>

                <TabsContent value="timing">
                  <WidgetList widgets={TIMING_WIDGETS} />
                </TabsContent>
                <TabsContent value="car">
                  <WidgetList widgets={CAR_WIDGETS} />
                </TabsContent>
                <TabsContent value="race">
                  <WidgetList widgets={RACE_WIDGETS} />
                </TabsContent>
              </Tabs>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── WidgetList ────────────────────────────────────────────────────────────────

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
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm',
                  'cursor-grab active:cursor-grabbing select-none',
                  'text-text-secondary hover:text-text-primary',
                  'hover:bg-bg-subtle border border-transparent hover:border-border-base',
                  'transition-colors',
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

