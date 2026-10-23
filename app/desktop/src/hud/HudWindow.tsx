import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { bridge } from '../bridge'
import { formatDelta, formatHudValue, hudLinePath, hudValueRange, liveValue } from './hudModel'
import type { HudChart, HudMessage } from './hudModel'
import './HudWindow.css'

/**
 * One training HUD window over the game (electron/hud.ts): the delta, or one reading's chart.
 * Dark glass whatever the OS theme, because it sits on a game image, not on the app.
 * Unlocked, the whole panel drags the window and the corner grip sizes it.
 */
export function HudWindow() {
  const [message, setMessage] = useState<HudMessage | null>(null)
  useEffect(() => bridge.subscribeHud(setMessage), [])
  if (!message) return null

  return (
    <div className={message.locked ? 'hud-panel' : 'hud-panel unlocked'}>
      {message.kind === 'delta' ? (
        <DeltaReadout targetName={message.targetName} deltaSeconds={message.deltaSeconds} />
      ) : message.chart && message.domain ? (
        <ChartReadout chart={message.chart} domain={message.domain} carMeters={message.carMeters} />
      ) : (
        <span className="hud-empty">No trace for this reading</span>
      )}
      {!message.locked && <ResizeGrip />}
    </div>
  )
}

function DeltaReadout({ targetName, deltaSeconds }: { targetName: string | null; deltaSeconds: number | null }) {
  const delta = formatDelta(deltaSeconds)
  return (
    <>
      <div className={`hud-delta tabular ${delta.tone}`}>{delta.text}</div>
      {targetName && <div className="hud-sub">vs {targetName}</div>}
    </>
  )
}

function ChartReadout({ chart, domain, carMeters }: { chart: HudChart; domain: { min: number; max: number }; carMeters: number | null }) {
  const [plot, setPlot] = useState<HTMLDivElement | null>(null)
  const size = useElementSize(plot)
  const range = hudValueRange(chart)
  const x = (value: number) => ((value - domain.min) / (domain.max - domain.min)) * size.width
  // A 2px inset keeps a line at 0% or 100% fully inside the plot.
  const y = (value: number) => size.height - 2 - ((value - range.min) / (range.max - range.min || 1)) * (size.height - 4)
  // The target first, so your line draws over it where the two meet.
  const ordered = [...chart.series].sort((a, b) => (a.role === b.role ? 0 : a.role === 'Comparison' ? -1 : 1))

  return (
    <>
      <div className="hud-label">
        <span>{chart.title}</span>
        <span className="hud-value tabular">{formatHudValue(liveValue(chart), chart.unit)}</span>
      </div>
      <div ref={setPlot} className="hud-plot">
        {size.width > 0 && size.height > 0 && (
          <svg width={size.width} height={size.height} aria-hidden="true">
            {ordered.map((series) => (
              <path
                key={series.name}
                className={series.role === 'Comparison' ? 'hud-line target' : 'hud-line live'}
                d={hudLinePath(series.samples, series.interpolation === 'Stepped', x, y)}
              />
            ))}
            {carMeters !== null && <line className="hud-car" x1={x(carMeters)} x2={x(carMeters)} y1={0} y2={size.height} />}
          </svg>
        )}
      </div>
    </>
  )
}

/**
 * Sizes the window. A transparent window does not resize reliably by its edges, so the page
 * reports the size it wants and Electron applies it, clamped to the window's minimum.
 */
function ResizeGrip() {
  const start = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const sizeAt = (event: PointerEvent<HTMLDivElement>) => {
    const origin = start.current
    return origin ? { width: origin.width + event.screenX - origin.x, height: origin.height + event.screenY - origin.y } : null
  }

  return (
    <div
      className="hud-grip"
      aria-hidden="true"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = { x: event.screenX, y: event.screenY, width: window.innerWidth, height: window.innerHeight }
      }}
      onPointerMove={(event) => {
        const size = sizeAt(event)
        if (size) bridge.resizeHud(size.width, size.height, false)
      }}
      onPointerUp={(event) => {
        const size = sizeAt(event)
        start.current = null
        if (size) bridge.resizeHud(size.width, size.height, true)
      }}
    />
  )
}

function useElementSize(element: HTMLElement | null): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return size
}
