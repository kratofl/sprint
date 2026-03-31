import { useState, useEffect, useCallback } from 'react'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  cn,
} from '@sprint/ui'
import { DashCanvas, DEFAULT_SCREEN_W, DEFAULT_SCREEN_H } from '@/components/DashCanvas'
import { type DashLayout, type DashWidget, WIDGET_TYPES, dashAPI, deviceScreenAPI, type ScreenConfig } from '@/lib/dash'

// ── Widget by category ────────────────────────────────────────────────────────

const TIMING_WIDGETS = WIDGET_TYPES.filter(w => w.category === 'timing')
const CAR_WIDGETS    = WIDGET_TYPES.filter(w => w.category === 'car')
const RACE_WIDGETS   = WIDGET_TYPES.filter(w => w.category === 'race')

// ── DashEditor ────────────────────────────────────────────────────────────────

export default function DashEditor() {
  const [layout, setLayout]         = useState<DashLayout>({ widgets: [] })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [screen, setScreen]         = useState<ScreenConfig | null>(null)
  const [saving, setSaving]         = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [loadError, setLoadError]   = useState<string | null>(null)

  // Load saved layout and screen config on mount.
  useEffect(() => {
    let cancelled = false
    Promise.all([dashAPI.loadLayout(), deviceScreenAPI.getScreen()])
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
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Section header */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-4 flex-shrink-0">
        <div>
          <h2 className="terminal-header mb-0.5 text-sm font-bold tracking-[0.2em]">DASH_STUDIO</h2>
          <p className="font-mono text-[10px] text-[#808080]">
            {layout.widgets.length} widget{layout.widgets.length !== 1 ? 's' : ''} · {screenW}×{screenH}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <span className="terminal-header text-[10px] text-[#34D399]">SAVED</span>
          )}
          {saveStatus === 'error' && (
            <span className="terminal-header text-[10px] text-[#F87171]">SAVE_FAILED</span>
          )}
          <button
            onClick={handleClearLayout}
            className="terminal-header border border-[#2a2a2a] px-3 py-1.5 text-[10px] text-[#808080] transition-colors hover:border-[#3a3a3a] hover:text-white"
          >
            CLEAR
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="terminal-header border border-[#ff906c] px-3 py-1.5 text-[10px] text-[#ff906c] transition-colors hover:bg-[#ff906c] hover:text-[#0a0a0a] disabled:opacity-50"
          >
            {saving ? 'SAVING…' : 'SAVE_LAYOUT'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="border-b border-[#2a2a2a] px-6 py-2 font-mono text-[10px] text-[#F87171]">{loadError}</div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Canvas column */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-[#2a2a2a] p-6 gap-3 min-w-0">
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
                <span className="terminal-header text-[#ff906c]">{selectedWidget.type}</span>
                <span className="text-[#808080]">
                  X:{selectedWidget.x} Y:{selectedWidget.y} W:{selectedWidget.w} H:{selectedWidget.h}
                </span>
                <button
                  onClick={() => { setLayout(prev => ({ widgets: prev.widgets.filter((_, i) => i !== selectedId) })); setSelectedId(null) }}
                  className="ml-auto text-[#808080] hover:text-[#F87171] transition-colors"
                >
                  REMOVE
                </button>
              </>
            ) : (
              <span className="text-[#808080]">
                {layout.widgets.length === 0 ? 'DRAG_WIDGET_TO_CANVAS' : `${layout.widgets.length}_WIDGETS — CLICK_TO_SELECT`}
              </span>
            )}
          </div>
        </div>

        {/* Widget palette */}
        <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden">
          <div className="border-b border-[#2a2a2a] px-4 py-3">
            <h4 className="terminal-header text-[10px] font-bold text-[#808080]">WIDGET_PALETTE</h4>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TooltipProvider>
              <Tabs defaultValue="timing">
                <div className="border-b border-[#2a2a2a]">
                  <TabsList variant="line" className="w-full">
                    <TabsTrigger value="timing" className="flex-1 text-[10px]">TIMING</TabsTrigger>
                    <TabsTrigger value="car"    className="flex-1 text-[10px]">CAR</TabsTrigger>
                    <TabsTrigger value="race"   className="flex-1 text-[10px]">RACE</TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-3">
                  <TabsContent value="timing">
                    <WidgetList widgets={TIMING_WIDGETS} />
                  </TabsContent>
                  <TabsContent value="car">
                    <WidgetList widgets={CAR_WIDGETS} />
                  </TabsContent>
                  <TabsContent value="race">
                    <WidgetList widgets={RACE_WIDGETS} />
                  </TabsContent>
                </div>
              </Tabs>
            </TooltipProvider>
          </div>
        </div>
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
                  'flex w-full cursor-grab select-none items-center gap-2 border border-[#2a2a2a] px-2 py-1.5 active:cursor-grabbing',
                  'font-mono text-[10px] text-[#808080] transition-colors',
                  'hover:border-[#3a3a3a] hover:text-white',
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

