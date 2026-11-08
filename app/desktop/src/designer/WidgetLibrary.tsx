import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { GripVertical, X } from 'lucide-react'
import type { DashWidgetType } from '@sprint/dashboard'
import { ALL_WIDGET_TYPES, widgetDefinition, widgetDisplayName } from '../views/DashesDomain'
import { relativePointerPos, type DragState, type PointerPos } from './DesignerCanvas'

/**
 * The widget library, a glass layer over the widget sidebar (so the whole dash stays in sight to
 * drop onto), opened by the dock's Widget button. Every item is both click-to-add (the
 * keyboard's way in: the widget goes into the first free cells) and drag-to-place: a pointer-down
 * captures the pointer on the item, follows it over the canvas and drops onto the cell under it on
 * release — or adds it like a click if the pointer never reached the canvas. The idle page takes
 * idle-capable widgets only.
 */
export function WidgetLibrary({
  isIdlePage,
  canvasRef,
  canvasWidth,
  canvasHeight,
  dragState,
  setDragState,
  onAdd,
  onDrop,
  onClose,
}: {
  isIdlePage: boolean
  canvasRef: RefObject<HTMLDivElement | null>
  canvasWidth: number
  canvasHeight: number
  dragState: DragState
  setDragState: (state: DragState) => void
  onAdd: (type: DashWidgetType) => void
  onDrop: (type: DashWidgetType, pointer: PointerPos) => void
  onClose: () => void
}) {
  const types = ALL_WIDGET_TYPES.filter((type) => !isIdlePage || widgetDefinition(type)?.idleCapable)
  const listRef = useRef<HTMLDivElement | null>(null)
  const isOverCanvas = (pointer: PointerPos): boolean => pointer.x >= 0 && pointer.y >= 0 && pointer.x <= canvasWidth && pointer.y <= canvasHeight

  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])

  const onPointerDown = (type: DashWidgetType, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragState({ kind: 'placing', widgetType: type, pointer: null })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (dragState.kind !== 'placing' || !canvasRef.current) return
    const pointer = relativePointerPos(event, canvasRef.current)
    setDragState({ ...dragState, pointer: isOverCanvas(pointer) ? pointer : null })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (dragState.kind !== 'placing') return
    const { widgetType, pointer } = dragState
    setDragState({ kind: 'idle' })
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (pointer) onDrop(widgetType, pointer)
    else onAdd(widgetType)
  }

  return (
    <section
      className="designer-glass designer-library"
      aria-label="Widget library"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        onClose()
      }}
    >
      <div className="designer-panel-head">
        <h2 className="designer-panel-title">Add a widget</h2>
        <button type="button" className="icon-button" aria-label="Close library" title="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <p className="field-hint designer-library-hint">
        {isIdlePage ? 'The idle page takes widgets that work without a session. ' : ''}Click to add, or drag onto the dash.
      </p>
      <div ref={listRef} className="designer-library-grid">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            className="designer-library-item"
            title={`Drag onto the dash, or click to add ${widgetDisplayName(type)}`}
            onPointerDown={(event) => onPointerDown(type, event)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            // A pointer is handled by the sequence above; a keyboard activation (Enter/Space)
            // fires a `click` with `detail === 0`, which never comes from a mouse.
            onClick={(event) => {
              if (event.detail === 0) onAdd(type)
            }}
          >
            <GripVertical size={14} className="designer-grip" />
            <span className="designer-row-label">{widgetDisplayName(type)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
