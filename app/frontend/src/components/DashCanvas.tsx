import { useRef, useCallback } from 'react'
import { cn } from '@sprint/ui'
import { type DashWidget, type DashLayout, WIDGET_TYPES } from '@/lib/dash'

// ── Constants ─────────────────────────────────────────────────────────────────

// Default screen dimensions used when no VoCore screen is configured.
export const DEFAULT_SCREEN_W = 800
export const DEFAULT_SCREEN_H = 480

// ── Helpers ───────────────────────────────────────────────────────────────────

function widgetLabel(type: string): string {
  return WIDGET_TYPES.find(w => w.type === type)?.label ?? type
}

// ── DashCanvas ────────────────────────────────────────────────────────────────

export interface DashCanvasProps {
  layout: DashLayout
  selectedId: number | null
  screenW?: number
  screenH?: number
  onSelect: (id: number | null) => void
  onUpdate: (widgets: DashWidget[]) => void
}

/**
 * A fixed-aspect-ratio canvas that renders DashWidgets as positioned boxes.
 * Supports:
 *  - Drag from palette (data-transfer "widget-type" + default dimensions)
 *  - Drag to reposition existing widgets
 *  - Click to select
 *  - Delete key to remove selected widget (parent handles, we just expose selection)
 */
export function DashCanvas({
  layout,
  selectedId,
  screenW = DEFAULT_SCREEN_W,
  screenH = DEFAULT_SCREEN_H,
  onSelect,
  onUpdate,
}: DashCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  /** Convert a client-space pointer event position to screen-space coordinates. */
  const toScreenCoords = useCallback(
    (clientX: number, clientY: number, offsetX = 0, offsetY = 0) => {
      if (!containerRef.current) return { x: 0, y: 0 }
      const rect = containerRef.current.getBoundingClientRect()
      const scaleX = screenW / rect.width
      const scaleY = screenH / rect.height
      return {
        x: Math.round((clientX - rect.left - offsetX) * scaleX),
        y: Math.round((clientY - rect.top  - offsetY) * scaleY),
      }
    },
    [screenW, screenH],
  )

  // ── Drop new widget from palette ──────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    // effectAllowed is set in dragstart; dropEffect must be compatible or the browser
    // silently cancels the drop event (no onDrop fires). Widget moves use 'move';
    // palette drops use 'copy'.
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy'
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const widgetType = e.dataTransfer.getData('widget-type')
      if (!widgetType) return

      const meta = WIDGET_TYPES.find(w => w.type === widgetType)
      const defaultW = meta?.defaultW ?? 160
      const defaultH = meta?.defaultH ?? 80

      // Place widget centred on the drop point.
      const { x, y } = toScreenCoords(e.clientX, e.clientY, defaultW / 2, defaultH / 2)

      const widget: DashWidget = {
        type: widgetType,
        x: Math.max(0, Math.min(x, screenW - defaultW)),
        y: Math.max(0, Math.min(y, screenH - defaultH)),
        w: defaultW,
        h: defaultH,
      }
      const updated = [...layout.widgets, widget]
      onUpdate(updated)
      onSelect(updated.length - 1)
    },
    [layout.widgets, toScreenCoords, screenW, screenH, onUpdate, onSelect],
  )

  // ── Drag to reposition existing widget ───────────────────────────────────

  const handleWidgetDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      const widget = layout.widgets[idx]
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const scaleX = screenW / rect.width
      const scaleY = screenH / rect.height

      // Store the grab offset (in screen-space) relative to widget origin.
      const grabOffsetX = (e.clientX - rect.left) * scaleX - widget.x
      const grabOffsetY = (e.clientY - rect.top)  * scaleY - widget.y

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('move-idx', String(idx))
      e.dataTransfer.setData('grab-offset-x', String(grabOffsetX))
      e.dataTransfer.setData('grab-offset-y', String(grabOffsetY))

      onSelect(idx)
    },
    [layout.widgets, screenW, screenH, onSelect],
  )

  const handleMoveDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const idxStr = e.dataTransfer.getData('move-idx')
      if (!idxStr) return // handled by handleDrop (palette drop)

      const idx = parseInt(idxStr, 10)
      const grabOffsetX = parseFloat(e.dataTransfer.getData('grab-offset-x') || '0')
      const grabOffsetY = parseFloat(e.dataTransfer.getData('grab-offset-y') || '0')

      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const scaleX = screenW / rect.width
      const scaleY = screenH / rect.height

      const x = (e.clientX - rect.left) * scaleX - grabOffsetX
      const y = (e.clientY - rect.top)  * scaleY - grabOffsetY

      const widget = layout.widgets[idx]
      const updated = layout.widgets.map((w, i) =>
        i === idx
          ? {
              ...w,
              x: Math.max(0, Math.min(Math.round(x), screenW - widget.w)),
              y: Math.max(0, Math.min(Math.round(y), screenH - widget.h)),
            }
          : w,
      )
      onUpdate(updated)
    },
    [layout.widgets, screenW, screenH, onUpdate],
  )

  const handleCombinedDrop = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.getData('move-idx')) {
        handleMoveDrop(e)
      } else {
        handleDrop(e)
      }
    },
    [handleDrop, handleMoveDrop],
  )

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded bg-bg-base border border-border-base"
      style={{ aspectRatio: `${screenW} / ${screenH}` }}
      onDragOver={handleDragOver}
      onDrop={handleCombinedDrop}
      onClick={() => onSelect(null)}
    >
      {/* Subtle orange glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-30"
        style={{ background: 'radial-gradient(ellipse 60% 80px at 50% 0, #ff906c 0%, transparent 100%)' }}
      />

      {/* Screen resolution label */}
      <span className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] text-text-disabled font-mono">
        {screenW}×{screenH}
      </span>

      {/* Widgets */}
      {layout.widgets.map((widget, idx) => {
        const scaleX = 100 / screenW
        const scaleY = 100 / screenH
        const isSelected = selectedId === idx
        return (
          <div
            key={idx}
            draggable
            onDragStart={e => handleWidgetDragStart(e, idx)}
            onClick={e => { e.stopPropagation(); onSelect(idx) }}
            className={cn(
              'absolute flex flex-col items-start justify-start overflow-hidden rounded',
              'cursor-move select-none',
              'bg-bg-elevated border',
              isSelected
                ? 'border-accent ring-1 ring-accent/50'
                : 'border-white/10 hover:border-white/20',
            )}
            style={{
              left:   `${widget.x * scaleX}%`,
              top:    `${widget.y * scaleY}%`,
              width:  `${widget.w * scaleX}%`,
              height: `${widget.h * scaleY}%`,
            }}
          >
            <span className="px-1.5 pt-1 text-[9px] font-medium text-text-muted uppercase tracking-wider leading-none truncate">
              {widgetLabel(widget.type)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── ResizeHandle (future) — placeholder for alpha ─────────────────────────────
// Widget resize via corner handles is deferred to post-alpha.
