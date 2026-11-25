import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { Search } from 'lucide-react'
import type { DashWidgetType } from '@sprint/dashboard'
import { ALL_WIDGET_TYPES, widgetDefinition, widgetDisplayName } from '../views/DashesDomain'
import { relativePointerPos, type DragState, type PointerPos } from './DesignerCanvas'
import { WIDGET_CATEGORIES, WIDGET_CATEGORY } from './widgetCategories'
import { widgetIcon } from './widgetIcons'

/**
 * The widget library, always open on the left of the Layout section: every widget type in its
 * section (`WIDGET_CATEGORY`), A to Z, with a filter. Every item is both click-to-add (the
 * keyboard's way in: the widget goes into the first free cells) and drag-to-place: a pointer-down
 * captures the pointer on the item, follows it over the canvas (the spots that take it light up)
 * and drops onto the cell under it on release — or adds it like a click if the pointer never
 * reached the canvas. The idle page takes idle-capable widgets only. `off` says why nothing can be
 * added (the full-screen pit limiter): the items are then out of reach and the line says so.
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
  off,
}: {
  isIdlePage: boolean
  canvasRef: RefObject<HTMLDivElement | null>
  canvasWidth: number
  canvasHeight: number
  dragState: DragState
  setDragState: (state: DragState) => void
  onAdd: (type: DashWidgetType) => void
  onDrop: (type: DashWidgetType, pointer: PointerPos) => void
  off?: string
}) {
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const types = ALL_WIDGET_TYPES.filter((type) => (!isIdlePage || widgetDefinition(type)?.idleCapable) && (needle === '' || widgetDisplayName(type).toLowerCase().includes(needle)))
  const sections = WIDGET_CATEGORIES.map((category) => ({
    category,
    types: types.filter((type) => WIDGET_CATEGORY[type] === category).sort((a, b) => widgetDisplayName(a).localeCompare(widgetDisplayName(b), undefined, { numeric: true })),
  })).filter((section) => section.types.length > 0)
  const isOverCanvas = (pointer: PointerPos): boolean => pointer.x >= 0 && pointer.y >= 0 && pointer.x <= canvasWidth && pointer.y <= canvasHeight

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
    <aside className={off ? 'designer-glass designer-sidebar designer-library is-off' : 'designer-glass designer-sidebar designer-library'} aria-label="Widget library">
      <div className="designer-sidebar-head">
        <span className="designer-sidebar-page">Widgets</span>
        {isIdlePage && <span className="muted">idle page</span>}
      </div>
      <label className="designer-library-search" inert={off !== undefined}>
        <Search size={14} aria-hidden="true" />
        <input
          className="input"
          type="search"
          aria-label="Find a widget"
          placeholder="Find a widget"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || filter === '') return
            event.preventDefault()
            event.stopPropagation()
            setFilter('')
          }}
        />
      </label>
      <div className="designer-sidebar-body" inert={off !== undefined}>
        {sections.length === 0 && <p className="field-hint designer-sidebar-empty">No widget is called that.</p>}
        {sections.map((section) => (
          <section key={section.category} className="designer-library-section" aria-label={section.category}>
            <h3 className="designer-library-head">{section.category}</h3>
            {section.types.map((type) => {
              const Icon = widgetIcon(type)
              return (
                <button
                  key={type}
                  type="button"
                  className="designer-library-item"
                  title={`Drag onto the dash, or click to add ${widgetDisplayName(type)}`}
                  onPointerDown={(event) => onPointerDown(type, event)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  // The browser took the pointer away: drop the drag, adding nothing.
                  onPointerCancel={() => {
                    if (dragState.kind === 'placing') setDragState({ kind: 'idle' })
                  }}
                  // A pointer is handled by the sequence above; a keyboard activation (Enter/Space)
                  // fires a `click` with `detail === 0`, which never comes from a mouse.
                  onClick={(event) => {
                    if (event.detail === 0) onAdd(type)
                  }}
                >
                  <Icon size={14} className="designer-node-icon" aria-hidden="true" />
                  <span className="designer-row-label">{widgetDisplayName(type)}</span>
                </button>
              )
            })}
          </section>
        ))}
      </div>
      <p className="field-hint designer-sidebar-foot">{off ?? (isIdlePage ? 'The idle page takes widgets that work without a session.' : 'Drag onto free space, or click to add.')}</p>
    </aside>
  )
}
