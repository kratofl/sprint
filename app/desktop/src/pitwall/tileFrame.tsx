import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, GripVertical, Layers, Pause, X } from 'lucide-react'
import type { LinkHealth, LinkSample } from '../bridge'
import type { PitWall, TileKind } from './pitWallData'
import type { StackView } from './stack'

/** What every tile renders from: the driver's board (null until one arrives) and the link's newest sample. */
export type TileData = { pitWall: PitWall | null; latest: LinkSample | null; health: LinkHealth | null }

/** A tile's name in the stack inspector, the tray and a stack's "next" hint. */
export const KIND_LABEL: Record<TileKind, string> = {
  session: 'Session',
  timing: 'Timing',
  track: 'Track',
  stint: 'Stint plan',
  fuel: 'Fuel & energy',
  relative: 'Relative',
  target: 'Target lap',
  tyres: 'Tyres',
  pressure: 'Tyre pressure',
  damage: 'Damage',
  radar: 'Radar',
  traces: 'Telemetry',
  control: 'Race control',
  pitstop: 'Pit stop',
}

/** A stack's header controls: which layer shows, its countdown, and the dots and arrows to pick one. */
export type StackHead = { layers: readonly TileKind[]; view: StackView; onPick: (index: number) => void; onStep: (delta: -1 | 1) => void }

/** Edit layout's tools on a tile: a handle to drag it, × to remove it, a corner to resize it. */
export type EditTools = {
  onGrip: (event: ReactPointerEvent<HTMLElement>) => void
  onResize: (event: ReactPointerEvent<HTMLElement>) => void
  onRemove: () => void
}

/** What the slot hands the tile it shows; the tile adds its own title, header extra and body. */
export type FrameProps = {
  stack: StackHead | null
  /** ↗: the tile in its own window; null where it already is, or while editing. */
  onPopOut: (() => void) | null
  editing: EditTools | null
}

/**
 * A tile's chrome: the header (a stack's layers icon, the title, the tile's own extra, a stack's
 * dots, ↗ or the edit tools) over the body. `bare` drops the header (the session strip).
 */
export function TileFrame({
  frame,
  title,
  extra,
  bare = false,
  bodyClass,
  children,
}: {
  frame: FrameProps
  title: string
  extra?: ReactNode
  bare?: boolean
  bodyClass?: string
  /** Empty while there is no board: the wall says so once, above the tiles. */
  children?: ReactNode
}) {
  const { stack, onPopOut, editing } = frame
  const showHeader = !bare || stack !== null || editing !== null
  return (
    <>
      {showHeader && (
        <header className="pw-tile-head">
          {stack && (
            <span className="pw-stack-icon" title={`A stack of ${stack.layers.length}`} aria-hidden="true">
              <Layers size={12} />
            </span>
          )}
          <h2 className="pw-tile-title">{title}</h2>
          {!editing && extra && <span className="pw-tile-extra">{extra}</span>}
          {stack && <StackControls stack={stack} />}
          {editing ? (
            <span className="pw-tile-tools">
              <button type="button" className="pw-tile-tool grip" aria-label={`Move ${title}`} title="Drag to move" onPointerDown={editing.onGrip}>
                <GripVertical size={14} />
              </button>
              <button type="button" className="pw-tile-tool" aria-label={`Remove ${title}`} title="Remove" onClick={editing.onRemove}>
                <X size={13} />
              </button>
            </span>
          ) : (
            onPopOut && (
              <button type="button" className="pw-tile-tool" aria-label={`Open ${title} in its own window`} title="Open in its own window" onClick={onPopOut}>
                <ExternalLink size={13} />
              </button>
            )
          )}
        </header>
      )}
      <div className={bodyClass ? `pw-tile-body ${bodyClass}` : 'pw-tile-body'}>{children}</div>
      {editing && <span className="pw-tile-resize" aria-hidden="true" onPointerDown={editing.onResize} />}
    </>
  )
}

function StackControls({ stack }: { stack: StackHead }) {
  const { layers, view } = stack
  const next = layers[(view.index + 1) % layers.length]
  return (
    <span className="pw-stack">
      {view.paused ? (
        <span className="pw-stack-hint">
          <Pause size={10} /> Paused
        </span>
      ) : (
        view.secondsToNext !== null && (
          <span className="pw-stack-hint tabular">
            {KIND_LABEL[next]} in {view.secondsToNext} s
          </span>
        )
      )}
      <button type="button" className="pw-stack-nav" aria-label="Previous layer" title="Previous layer" onClick={() => stack.onStep(-1)}>
        <ChevronLeft size={12} />
      </button>
      <span className="pw-stack-dots" role="radiogroup" aria-label="Layers">
        {layers.map((kind, index) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={index === view.index}
            aria-label={KIND_LABEL[kind]}
            title={KIND_LABEL[kind]}
            className="pw-stack-dot"
            onClick={() => stack.onPick(index)}
          />
        ))}
      </span>
      <button type="button" className="pw-stack-nav" aria-label="Next layer" title="Next layer" onClick={() => stack.onStep(1)}>
        <ChevronRight size={12} />
      </button>
    </span>
  )
}

/** A tile with nothing to show yet: what is missing, and when it comes. */
export function TileEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state compact">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

