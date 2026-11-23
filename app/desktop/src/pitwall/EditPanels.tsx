import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, EyeOff, GripVertical, Plus, RotateCcw, Star, X } from 'lucide-react'
import {
  addLayer,
  freeSpot,
  hideTimingColumn,
  MAX_CYCLE_SECONDS,
  MAX_LAYERS,
  MIN_CYCLE_SECONDS,
  moveLayer,
  moveTimingColumn,
  removeLayer,
  resetTimingColumns,
  setStackOptions,
  showTimingColumn,
  unstack,
} from './layoutOps'
import { TILE_KINDS, type PitWallLayout, type PitWallPage, type PitWallTile, type TileKind } from './pitWallData'
import { KIND_LABEL } from './tileFrame'
import { hiddenColumns, shownColumns, TIMING_COLUMN_SPECS } from './timingColumns'

type OnChange = (next: PitWallLayout | null, refusal: string) => boolean

/** Edit layout's tray along the bottom: every tile there is, each added at the first free spot. */
export function TileTray({ page, onAdd }: { page: PitWallPage; onAdd: (kind: TileKind) => void }) {
  const full = freeSpot(page, { w: 1, h: 1 }) === null
  return (
    <div className="pw-tray" role="toolbar" aria-label="Add a tile">
      <span className="muted">{full ? 'This page is full' : 'Add a tile'}</span>
      {TILE_KINDS.map((kind) => (
        <button key={kind} type="button" className="pw-tray-item" disabled={full} onClick={() => onAdd(kind)}>
          <Plus size={12} /> {KIND_LABEL[kind]}
        </button>
      ))}
    </div>
  )
}

/**
 * The selected tile in Edit layout: its layers (the first is shown first; reorder, remove, add
 * one to make a stack), the timing layer's columns, and, for a stack, how it switches, whether the
 * mouse pauses it, when it jumps to the radar or damage on its own, and Unstack.
 */
export function StackInspector({
  layout,
  pageId,
  tile,
  onChange,
  onClose,
}: {
  layout: PitWallLayout
  pageId: string
  tile: PitWallTile
  onChange: OnChange
  onClose: () => void
}) {
  const [adding, setAdding] = useState(false)
  const secondsId = useId()
  const stack = tile.layers.length > 1
  const addable = TILE_KINDS.filter((kind) => !tile.layers.includes(kind))
  const [seconds, setSeconds] = useState(String(tile.cycleSeconds ?? 10))
  const options = (patch: Parameters<typeof setStackOptions>[3]) => onChange(setStackOptions(layout, pageId, tile.id, patch), `Switch every ${MIN_CYCLE_SECONDS} to ${MAX_CYCLE_SECONDS} seconds.`)

  return (
    <aside className="pw-inspector" aria-label="Tile settings">
      <div className="pw-inspector-head">
        <h3>{stack ? `Stack · ${tile.layers.length} layers` : KIND_LABEL[tile.layers[0]]}</h3>
        <button type="button" className="icon-button" aria-label="Close tile settings" title="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <ul className="pw-layers" aria-label="Layers">
        {tile.layers.map((kind, index) => (
          <li key={kind} className="pw-layer">
            <span className="pw-layer-name">{KIND_LABEL[kind]}</span>
            {stack && index === 0 && (
              <span className="pw-layer-first">
                <Star size={11} /> Shown first
              </span>
            )}
            {stack && (
              <span className="pw-layer-tools">
                <button type="button" className="icon-button" aria-label={`Move ${KIND_LABEL[kind]} up`} title="Move up" disabled={index === 0} onClick={() => onChange(moveLayer(layout, pageId, tile.id, index, -1), 'It is already first.')}>
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${KIND_LABEL[kind]} down`}
                  title="Move down"
                  disabled={index === tile.layers.length - 1}
                  onClick={() => onChange(moveLayer(layout, pageId, tile.id, index, 1), 'It is already last.')}
                >
                  <ArrowDown size={13} />
                </button>
                <button type="button" className="icon-button" aria-label={`Take ${KIND_LABEL[kind]} out of the stack`} title="Take out of the stack" onClick={() => onChange(removeLayer(layout, pageId, tile.id, index), 'A stack keeps at least one layer.')}>
                  <X size={13} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {tile.layers.length < MAX_LAYERS && (
        <button type="button" className="button small subtle" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          <Plus /> Add a tile to the stack
        </button>
      )}
      {adding && (
        <div className="pw-add-layer" role="group" aria-label="Tiles to add">
          {addable.map((kind) => (
            <button
              key={kind}
              type="button"
              className="pw-tray-item"
              onClick={() => {
                if (onChange(addLayer(layout, pageId, tile.id, kind), `A stack holds at most ${MAX_LAYERS} tiles.`)) setAdding(false)
              }}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      )}

      {tile.layers.includes('timing') && <TimingColumns layout={layout} pageId={pageId} tile={tile} heading={stack ? 'Timing columns' : 'Columns'} onChange={onChange} />}

      {stack && (
        <>
          <h4>Switches</h4>
          <div className="segmented pw-seg-full" role="radiogroup" aria-label="Switches">
            <button type="button" role="radio" className="segmented-item" aria-checked={tile.cycleSeconds !== null} onClick={() => options({ cycleSeconds: Number(seconds) || 10 })}>
              Every {tile.cycleSeconds ?? (Number(seconds) || 10)} s
            </button>
            <button type="button" role="radio" className="segmented-item" aria-checked={tile.cycleSeconds === null} onClick={() => options({ cycleSeconds: null })}>
              By hand
            </button>
          </div>
          {tile.cycleSeconds !== null && (
            <div className="field pw-seconds">
              <label htmlFor={secondsId}>Seconds per layer</label>
              <input
                id={secondsId}
                type="number"
                inputMode="numeric"
                min={MIN_CYCLE_SECONDS}
                max={MAX_CYCLE_SECONDS}
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
                onBlur={() => {
                  const value = Math.round(Number(seconds))
                  if (!options({ cycleSeconds: value })) setSeconds(String(tile.cycleSeconds))
                }}
              />
            </div>
          )}
          <label className="pw-check">
            <input type="checkbox" checked={tile.pauseOnHover} onChange={(event) => options({ pauseOnHover: event.target.checked })} />
            Pause while the mouse is over it
          </label>
          {(tile.layers.includes('radar') || tile.layers.includes('damage')) && (
            <>
              <h4>Jump to a layer when it matters</h4>
              {tile.layers.includes('radar') && (
                <label className="pw-check">
                  <input type="checkbox" checked={tile.jumpRadar} onChange={(event) => options({ jumpRadar: event.target.checked })} />
                  Radar while a car is alongside
                </label>
              )}
              {tile.layers.includes('damage') && (
                <label className="pw-check">
                  <input type="checkbox" checked={tile.jumpDamage} onChange={(event) => options({ jumpDamage: event.target.checked })} />
                  Damage for 20 s after a hit
                </label>
              )}
              <p className="field-hint">Then back to where it was.</p>
            </>
          )}
          <div className="menu-separator pw-sep" />
          <button type="button" className="button small" onClick={() => onChange(unstack(layout, pageId, tile.id, () => crypto.randomUUID()), 'There is no room on this page for every layer. Make room first.')}>
            Unstack
          </button>
        </>
      )}
    </aside>
  )
}

/**
 * The timing layer's columns: the shown ones in order (drag one by its row, or ↑ ↓), each hidden
 * with its eye except Driver, the hidden ones below to add back at the end, and Reset to the
 * default set. The tile beside it follows every change.
 */
function TimingColumns({ layout, pageId, tile, heading, onChange }: { layout: PitWallLayout; pageId: string; tile: PitWallTile; heading: string; onChange: OnChange }) {
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null)
  const shown = shownColumns(tile)
  const hidden = hiddenColumns(shown)
  const label = (index: number) => TIMING_COLUMN_SPECS[shown[index]].label
  const move = (from: number, to: number) => onChange(moveTimingColumn(layout, pageId, tile.id, from, to), 'It is already there.')

  return (
    <>
      <div className="pw-inspector-row">
        <h4>{heading}</h4>
        <button type="button" className="button small subtle" disabled={tile.timingColumns === null} onClick={() => onChange(resetTimingColumns(layout, pageId, tile.id), 'It already shows the default columns.')}>
          <RotateCcw /> Reset
        </button>
      </div>
      <ul className="pw-layers" aria-label={heading}>
        {shown.map((column, index) => {
          const over = drag !== null && drag.over === index && drag.from !== index
          const classes = ['pw-layer', 'pw-column', over ? (drag.from < index ? 'drop-after' : 'drop-before') : '', drag?.from === index ? 'dragging' : '']
          return (
            <li
              key={column}
              className={classes.filter(Boolean).join(' ')}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                setDrag({ from: index, over: null })
              }}
              onDragOver={(event) => {
                if (!drag) return
                event.preventDefault()
                if (drag.over !== index) setDrag({ ...drag, over: index })
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (drag && drag.from !== index) move(drag.from, index)
                setDrag(null)
              }}
              onDragEnd={() => setDrag(null)}
            >
              <GripVertical size={13} className="pw-column-grip" aria-hidden="true" />
              <span className="pw-layer-name">{label(index)}</span>
              {column === 'driver' && <span className="pw-layer-first">Always</span>}
              <span className="pw-layer-tools">
                <button type="button" className="icon-button" aria-label={`Move ${label(index)} up`} title="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}>
                  <ArrowUp size={13} />
                </button>
                <button type="button" className="icon-button" aria-label={`Move ${label(index)} down`} title="Move down" disabled={index === shown.length - 1} onClick={() => move(index, index + 1)}>
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Hide ${label(index)}`}
                  title={column === 'driver' ? 'Driver always shows' : 'Hide'}
                  disabled={column === 'driver'}
                  onClick={() => onChange(hideTimingColumn(layout, pageId, tile.id, column), 'Driver always shows.')}
                >
                  <EyeOff size={13} />
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {hidden.length > 0 && (
        <>
          <h4>Hidden</h4>
          <div className="pw-add-layer" role="group" aria-label="Hidden columns">
            {hidden.map((column) => (
              <button key={column} type="button" className="pw-tray-item" onClick={() => onChange(showTimingColumn(layout, pageId, tile.id, column), 'It already shows.')}>
                <Plus size={12} /> {TIMING_COLUMN_SPECS[column].label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
