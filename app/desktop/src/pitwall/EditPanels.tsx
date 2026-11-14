import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Star, X } from 'lucide-react'
import { addLayer, freeSpot, MAX_CYCLE_SECONDS, MAX_LAYERS, MIN_CYCLE_SECONDS, moveLayer, removeLayer, setStackOptions, unstack } from './layoutOps'
import { TILE_KINDS, type PitWallLayout, type PitWallPage, type PitWallTile, type TileKind } from './pitWallData'
import { KIND_LABEL } from './tileFrame'

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
 * one to make a stack) and, for a stack, how it switches, whether the mouse pauses it, when it
 * jumps to the radar or damage on its own, and Unstack.
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
