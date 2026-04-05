import { useState, useEffect, useCallback } from 'react'
import {
  Badge, Button,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  cn,
} from '@sprint/ui'
import {
  type DashLayout, type DashPage, type DashWidget, type WidgetCatalogEntry,
  widgetCatalogAPI, deviceScreenAPI,
} from '@/lib/dash'
import { DashCanvas, DEFAULT_SCREEN_W, DEFAULT_SCREEN_H } from '@/components/DashCanvas'
import { PageTabs } from '@/components/PageTabs'
import { WidgetProperties } from './WidgetProperties'
import { useUnsavedChanges, useNavigationGuard } from '@/hooks/useUnsavedChanges'
import { ConfirmDialog } from './ConfirmDialog'
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
  const [selectedId, setSelectedId]   = useState<number | null>(null)
  const [catalog, setCatalog]         = useState<WidgetCatalogEntry[]>([])
  const [screenW, setScreenW]         = useState(DEFAULT_SCREEN_W)
  const [paletteDropType, setPaletteDropType] = useState<string | null>(null)
  const [screenH, setScreenH]         = useState(DEFAULT_SCREEN_H)
  const [activeTab, setActiveTab]     = useState<'idle' | number>(0)
  const [livePageIndex, setLivePageIndex] = useState<number | null>(null)
  const [renamingDash, setRenamingDash] = useState(false)
  const [dashNameValue, setDashNameValue] = useState(initialLayout.name)
  const [confirmRemoveWidget, setConfirmRemoveWidget] = useState(false)

  const { isDirty, markSaved } = useUnsavedChanges(layout, initialLayout)
  const { showDialog, guardedNavigate, confirm, cancel } = useNavigationGuard(isDirty)

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])

  useEffect(() => {
    Promise.all([
      widgetCatalogAPI.getWidgetCatalog(),
      deviceScreenAPI.getScreen(),
    ]).then(([widgets, cfg]) => {
      setCatalog(widgets)
      if (cfg) { setScreenW(cfg.width); setScreenH(cfg.height) }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    return onEvent('dash:page-changed', (data: { pageIndex: number }) => {
      setLivePageIndex(data.pageIndex)
    })
  }, [])

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
    : (layout.pages[activeTab as number]?.widgets ?? [])

  const handleUpdate = useCallback((widgets: DashWidget[]) => {
    if (activeTab === 'idle') {
      setLayout(prev => ({ ...prev, idlePage: { ...prev.idlePage, widgets } }))
    } else {
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
  const widgetCount = canvasWidgets.length
  const paletteWidgets = activeTab === 'idle' ? catalog.filter(w => w.idleCapable) : catalog

  const updateSelectedWidget = (updated: DashWidget) => {
    if (selectedId === null) return
    handleUpdate(canvasWidgets.map((w, i) => i === selectedId ? updated : w))
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-6 py-3 flex-shrink-0">
        <button onClick={handleBack} className="font-mono text-[10px] text-text-muted hover:text-foreground">← BACK</button>
        <span className="font-mono text-[10px] text-text-muted">|</span>
        {renamingDash ? (
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
            className="rounded bg-background px-1 font-bold text-sm outline outline-1 outline-accent flex-1 min-w-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setDashNameValue(layout.name); setRenamingDash(true) }}
            className="group flex items-center gap-1.5 text-left flex-1 min-w-0"
          >
            <span className="font-bold text-sm truncate group-hover:text-accent transition-colors">
              {layout.name}
            </span>
            <PencilIcon className="text-text-disabled group-hover:text-accent transition-colors flex-shrink-0" />
          </button>
        )}
        <span className="font-mono text-[9px] text-text-muted">
          {widgetCount} widget{widgetCount !== 1 ? 's' : ''}
          {livePageIndex !== null && (
            <span className="ml-2 text-teal-400">
              ● LIVE: {layout.pages[livePageIndex]?.name ?? `Page ${livePageIndex + 1}`}
            </span>
          )}
        </span>
        {saveStatus === 'saved' && <Badge variant="success" className="terminal-header">SAVED</Badge>}
        {saveStatus === 'error' && <Badge variant="destructive" className="terminal-header">FAILED</Badge>}
        <Button variant="neutral" size="sm" onClick={handleClearPage}>CLEAR</Button>
        <Button variant="neutral" size="sm" onClick={handleBack}>CANCEL</Button>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'SAVING…' : 'SAVE'}
        </Button>
      </div>

      <PageTabs
        idlePage={layout.idlePage}
        pages={layout.pages}
        activeTab={activeTab}
        livePageIndex={livePageIndex}
        onSelectTab={tab => { setActiveTab(tab); setSelectedId(null) }}
        onAddPage={handleAddPage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
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

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: widget palette (always visible) */}
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
          <DashCanvas
            widgets={canvasWidgets}
            gridCols={layout.gridCols}
            gridRows={layout.gridRows}
            selectedId={selectedId}
            screenW={screenW}
            screenH={screenH}
            paletteDropType={paletteDropType}
            onSelect={setSelectedId}
            onUpdate={handleUpdate}
          />

          <div className="flex h-7 flex-shrink-0 items-center gap-4 font-mono text-[10px]">
            {selectedWidget ? (
              <>
                <Badge variant="active" className="terminal-header">{selectedWidget.type}</Badge>
                <span className="text-text-muted">
                  COL:{selectedWidget.col} ROW:{selectedWidget.row} W:{selectedWidget.colSpan} H:{selectedWidget.rowSpan}
                </span>
                <Button
                  onClick={() => setConfirmRemoveWidget(true)}
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

        {/* Right: properties panel (always visible) */}
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
                  // Suppress the browser's default semi-transparent ghost image
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
