import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ExternalLink, LayoutDashboard } from 'lucide-react'
import { bridge } from '../bridge'
import { addTile, canPlace, draggedTo, GRID_COLS, GRID_ROWS, moveTile, removeTile, resizedTo, resizeTile, stackOnto } from './layoutOps'
import type { PitWallLayout, PitWallPage, PitWallTile } from './pitWallData'
import { KIND_LABEL, type TileData } from './tileFrame'
import { PitWallSlot } from './PitWallSlot'
import { StackInspector, TileTray } from './EditPanels'

/** The grid's padding and gap (PitWall.css `.pw-grid`), to turn a drag in pixels into cells. */
const GRID_PAD = 10
const GRID_GAP = 10

type Drag = { tileId: string; mode: 'move' | 'resize'; startX: number; startY: number; stepX: number; stepY: number; dx: number; dy: number; overId: string | null }

const placed = (rect: { x: number; y: number; w: number; h: number }): CSSProperties => ({
  gridColumn: `${rect.x + 1} / span ${rect.w}`,
  gridRow: `${rect.y + 1} / span ${rect.h}`,
})

/**
 * A page's tiles on the 12 × 8 grid. In Edit layout each tile gets a handle to drag it (dropped
 * on another tile it joins that tile's stack), × to remove it and a corner to resize it; arrow
 * keys move a selected tile, Shift+arrows resize it, Delete removes it. A tray adds tiles and the
 * inspector sets up the selected one. A tile in its own window leaves a placeholder.
 */
export function PitWallGrid({
  layout,
  page,
  data,
  editing,
  onChange,
  onPopOut,
  onPutBack,
  onEditLayout,
}: {
  layout: PitWallLayout
  page: PitWallPage
  data: TileData
  editing: boolean
  /** A layout edit; `refusal` says why when the edit is not allowed (`next` null). Returns whether it applied. */
  onChange: (next: PitWallLayout | null, refusal: string) => boolean
  onPopOut: (tileId: string) => void
  onPutBack: (tileId: string) => void
  /** Offered on an empty page; null where the layout cannot be edited (a page's own window). */
  onEditLayout: (() => void) | null
}) {
  const grid = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const selectedTile = editing ? (page.tiles.find((tile) => tile.id === selected) ?? null) : null

  useEffect(() => {
    if (!editing) setSelected(null)
  }, [editing])

  const startDrag = (tile: PitWallTile, mode: Drag['mode'], event: ReactPointerEvent<HTMLElement>) => {
    const box = grid.current?.getBoundingClientRect()
    if (!box || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setSelected(tile.id)
    const cellX = (box.width - GRID_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS
    const cellY = (box.height - GRID_PAD * 2 - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS
    setDrag({ tileId: tile.id, mode, startX: event.clientX, startY: event.clientY, stepX: cellX + GRID_GAP, stepY: cellY + GRID_GAP, dx: 0, dy: 0, overId: null })
  }

  // While a drag is on, the window follows the pointer; the drop applies the edit.
  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent) => {
      // The tile under the pointer, looking past the dragged one (it may be painted on top).
      const over =
        document
          .elementsFromPoint(event.clientX, event.clientY)
          .map((element) => element.closest<HTMLElement>('[data-tile-id]')?.dataset.tileId ?? null)
          .find((id) => id !== null && id !== drag.tileId) ?? null
      setDrag((current) =>
        current && {
          ...current,
          dx: Math.round((event.clientX - current.startX) / current.stepX),
          dy: Math.round((event.clientY - current.startY) / current.stepY),
          overId: current.mode === 'move' && over !== current.tileId ? over : null,
        },
      )
    }
    const onUp = () => {
      setDrag(null)
      const tile = page.tiles.find((candidate) => candidate.id === drag.tileId)
      if (!tile) return
      if (drag.mode === 'resize') {
        const size = resizedTo(tile, drag.dx, drag.dy)
        if (size.w !== tile.w || size.h !== tile.h) onChange(resizeTile(layout, page.id, tile.id, size.w, size.h), 'It would cover another tile.')
        return
      }
      if (drag.overId) {
        onChange(stackOnto(layout, page.id, tile.id, drag.overId), 'That stack already has these tiles, or would pass six layers.')
        return
      }
      const to = draggedTo(tile, drag.dx, drag.dy)
      if (to.x !== tile.x || to.y !== tile.y) onChange(moveTile(layout, page.id, tile.id, to.x, to.y), 'It would cover another tile. Drop it on a tile to stack them.')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, layout, page, onChange])

  const onTileKey = (tile: PitWallTile, event: KeyboardEvent<HTMLElement>) => {
    if (!editing || event.target !== event.currentTarget) return
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const delta = step[event.key]
    if (delta) {
      event.preventDefault()
      if (event.shiftKey) onChange(resizeTile(layout, page.id, tile.id, tile.w + delta[0], tile.h + delta[1]), 'It would cover another tile or leave the grid.')
      else onChange(moveTile(layout, page.id, tile.id, tile.x + delta[0], tile.y + delta[1]), 'It would cover another tile or leave the grid.')
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onChange(removeTile(layout, page.id, tile.id), 'That tile is already gone.')
    }
  }

  const preview = (tile: PitWallTile): { rect: PitWallTile; valid: boolean } | null => {
    if (!drag || drag.tileId !== tile.id || drag.overId) return null
    const rect = drag.mode === 'move' ? { ...tile, ...draggedTo(tile, drag.dx, drag.dy) } : { ...tile, ...resizedTo(tile, drag.dx, drag.dy) }
    return { rect, valid: canPlace(page, rect, [tile.id]) }
  }

  return (
    <div className={editing ? 'pw-body editing' : 'pw-body'}>
      <div className="pw-grid-wrap">
        <div ref={grid} className="pw-grid" onPointerDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          {editing &&
            Array.from({ length: GRID_COLS * GRID_ROWS }, (_, index) => (
              <span key={index} className="pw-cell" style={placed({ x: index % GRID_COLS, y: Math.floor(index / GRID_COLS), w: 1, h: 1 })} aria-hidden="true" />
            ))}
          {page.tiles.map((tile) => {
            const moving = preview(tile)
            const classes = [
              'pw-tile',
              editing ? 'editing' : '',
              tile.id === selected && editing ? 'selected' : '',
              drag?.overId === tile.id ? 'drop-target' : '',
              drag?.tileId === tile.id ? 'dragging' : '',
              moving && !moving.valid ? 'invalid' : '',
            ]
            return (
              <section
                key={tile.id}
                data-tile-id={tile.id}
                className={classes.filter(Boolean).join(' ')}
                style={placed(moving?.rect ?? tile)}
                tabIndex={editing ? 0 : undefined}
                aria-label={editing ? tile.layers.map((kind) => KIND_LABEL[kind]).join(', ') : undefined}
                onPointerDown={() => editing && setSelected(tile.id)}
                onClick={() => editing && setSelected(tile.id)}
                onFocus={() => editing && setSelected(tile.id)}
                onKeyDown={(event) => onTileKey(tile, event)}
              >
                {tile.detached && !editing ? (
                  <div className="pw-away">
                    <b>{tile.layers.map((kind) => KIND_LABEL[kind]).join(' · ')}</b>
                    <span className="muted">In its own window</span>
                    <span className="pw-away-actions">
                      <button type="button" className="button small" onClick={() => void bridge.openPitWall({ kind: 'tile', id: tile.id })}>
                        <ExternalLink /> Bring to front
                      </button>
                      <button type="button" className="button small subtle" onClick={() => onPutBack(tile.id)}>
                        Put back here
                      </button>
                    </span>
                  </div>
                ) : (
                  <PitWallSlot
                    tile={tile}
                    data={data}
                    editing={
                      editing
                        ? {
                            onGrip: (event) => startDrag(tile, 'move', event),
                            onResize: (event) => startDrag(tile, 'resize', event),
                            onRemove: () => onChange(removeTile(layout, page.id, tile.id), 'That tile is already gone.'),
                          }
                        : null
                    }
                    onPopOut={() => onPopOut(tile.id)}
                  />
                )}
              </section>
            )
          })}
          {page.tiles.length === 0 && !editing && (
            <div className="empty-state pw-page-empty">
              <h2>This page is empty</h2>
              <p>Add tiles to it in Edit layout.</p>
              {onEditLayout && (
                <button type="button" className="button" onClick={onEditLayout}>
                  <LayoutDashboard /> Edit layout
                </button>
              )}
            </div>
          )}
        </div>
        {editing && <TileTray page={page} onAdd={(kind) => onChange(addTile(layout, page.id, kind, crypto.randomUUID()), 'There is no room left on this page.')} />}
      </div>
      {selectedTile && (
        <StackInspector
          key={selectedTile.id}
          layout={layout}
          pageId={page.id}
          tile={selectedTile}
          onChange={onChange}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
