import { useEffect, useRef, useState } from 'react'
import type { PitWallTile, TileKind } from './pitWallData'
import { pickLayer, shownLayer, startStack, stepIndex, stepStack, type StackRun, type StackSignals } from './stack'
import type { EditTools, FrameProps, TileData } from './tileFrame'
import { TileFor } from './tiles/TileFor'

/** How often a stack looks at the clock (its countdown reads whole seconds). */
const TICK_MS = 1000

/**
 * One slot of a page: a plain tile, or a stack whose layers take turns (`stack.ts` decides which,
 * this only ticks the clock and passes the mouse). In Edit layout a stack holds still on the
 * layer picked by hand.
 */
export function PitWallSlot({
  tile,
  data,
  editing,
  onPopOut,
}: {
  tile: PitWallTile
  data: TileData
  editing: EditTools | null
  onPopOut: (() => void) | null
}) {
  const [run, setRun] = useState<StackRun>(startStack)
  const [hovered, setHovered] = useState(false)
  const stacked = tile.layers.length > 1
  const signals: StackSignals = { now: Date.now(), hovered: hovered || editing !== null, radar: data.pitWall?.radar ?? [], damage: data.pitWall?.car.damage ?? null }
  const latest = useRef({ tile, signals, at: Date.now() })
  latest.current = { tile, signals, at: latest.current.at }

  useEffect(() => {
    if (!stacked) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      const { tile: current, signals: seen, at } = latest.current
      latest.current.at = now
      setRun((previous) => stepStack(current, previous, { ...seen, now }, now - at))
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [stacked])

  const view = shownLayer(tile, run, signals)
  const frame: FrameProps = {
    stack: stacked
      ? {
          layers: tile.layers,
          view,
          onPick: (index) => setRun((previous) => pickLayer(previous, index)),
          onStep: (delta) => setRun((previous) => pickLayer(previous, stepIndex(view.index, tile.layers.length, delta))),
        }
      : null,
    onPopOut: editing ? null : onPopOut,
    editing,
  }
  const kind: TileKind = stacked ? view.kind : tile.layers[0]
  return (
    <div className="pw-slot-inner" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <TileFor kind={kind} data={data} frame={frame} />
    </div>
  )
}
