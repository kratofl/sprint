import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { bridge } from '../bridge'
import { HUD_CHART_ORDER, HUD_READING_LABELS, buildHudArrange, buildToggleReading, readingCount } from '../views/OnTrackDomain'
import type { HudReadingId } from '../views/OnTrackDomain'
import { deltaTrend, formatDelta, formatHudValue, hudLinePath, hudMark, hudValueRange, liveValue, rememberDelta } from './hudModel'
import type { DeltaPoint, HudChart, HudMessage, HudReadingSet } from './hudModel'
import './HudWindow.css'

/**
 * One training HUD window over the game (electron/hud.ts): the delta, one reading's chart, or the
 * palette shown while arranging. Dark glass whatever the OS theme, because it sits on a game
 * image, not on the app. Each chart looks ahead: the stretch past the car is lit, and Brake and
 * Speed mark where the target next brakes and where it is slowest.
 * While arranging, the whole panel drags the window, the corner grip sizes it and × takes it off.
 */
export function HudWindow() {
  const [message, setMessage] = useState<HudMessage | null>(null)
  useEffect(() => bridge.subscribeHud(setMessage), [])
  if (!message) return null
  if (message.kind === 'arrange') return <ArrangePalette readings={message.readings} />

  return (
    <div className={message.arranging ? 'hud-panel arranging' : 'hud-panel'}>
      {message.kind === 'delta' ? (
        <DeltaReadout targetName={message.targetName} deltaSeconds={message.deltaSeconds} carMeters={message.carMeters} />
      ) : message.chart && message.domain ? (
        <ChartReadout id={message.id} chart={message.chart} domain={message.domain} carMeters={message.carMeters} />
      ) : (
        <>
          <div className="hud-label">{message.title}</div>
          <span className="hud-empty">Pick a lap on On track to see its line</span>
        </>
      )}
      {message.arranging && <RemoveButton id={message.id} readings={message.readings} />}
      {message.arranging && <ResizeGrip />}
    </div>
  )
}

function DeltaReadout({ targetName, deltaSeconds, carMeters }: { targetName: string | null; deltaSeconds: number | null; carMeters: number | null }) {
  const [history, setHistory] = useState<DeltaPoint[]>([])
  useEffect(() => {
    if (deltaSeconds !== null && carMeters !== null) setHistory((previous) => rememberDelta(previous, { meters: carMeters, seconds: deltaSeconds }))
  }, [deltaSeconds, carMeters])
  const delta = formatDelta(deltaSeconds)
  const trend = deltaTrend(history)
  return (
    <div className="hud-delta-body">
      <div className="hud-delta-row">
        <span className={`hud-delta tabular ${delta.tone}`}>{delta.text}</span>
        {trend && <span className={`hud-trend ${trend.tone}`}>{trend.text}</span>}
      </div>
      {targetName && <div className="hud-sub">vs {targetName}</div>}
    </div>
  )
}

function ChartReadout({ id, chart, domain, carMeters }: { id: string; chart: HudChart; domain: { min: number; max: number }; carMeters: number | null }) {
  const [plot, setPlot] = useState<HTMLDivElement | null>(null)
  const size = useElementSize(plot)
  const range = hudValueRange(chart)
  const mark = hudMark(id, chart, carMeters)
  const x = (value: number) => ((value - domain.min) / (domain.max - domain.min)) * size.width
  // A 2px inset keeps a line at 0% or 100% fully inside the plot.
  const y = (value: number) => size.height - 2 - ((value - range.min) / (range.max - range.min || 1)) * (size.height - 4)
  // The target first, so your line draws over it where the two meet.
  const ordered = [...chart.series].sort((a, b) => (a.role === b.role ? 0 : a.role === 'Comparison' ? -1 : 1))
  const car = carMeters === null ? null : x(carMeters)

  return (
    <>
      <div className="hud-label">
        <span>{chart.title}</span>
        {mark && <span className="hud-mark-label">{mark.label}</span>}
        <span className="hud-value tabular">{formatHudValue(liveValue(chart), chart.unit)}</span>
      </div>
      <div ref={setPlot} className="hud-plot">
        {size.width > 0 && size.height > 0 && (
          <svg width={size.width} height={size.height} aria-hidden="true">
            {car !== null && <rect className="hud-ahead" x={car} y={0} width={Math.max(0, size.width - car)} height={size.height} />}
            {mark && <line className="hud-mark" x1={x(mark.meters)} x2={x(mark.meters)} y1={0} y2={size.height} />}
            {ordered.map((series) => (
              <path
                key={series.name}
                className={series.role === 'Comparison' ? 'hud-line target' : 'hud-line live'}
                d={hudLinePath(series.samples, series.interpolation === 'Stepped', x, y)}
              />
            ))}
            {car !== null && (
              <>
                <line className="hud-car" x1={car} x2={car} y1={0} y2={size.height} />
                <path className="hud-car-marker" d={`M${car - 5},${size.height} L${car + 5},${size.height} L${car},${size.height - 7}Z`} />
              </>
            )}
          </svg>
        )}
      </div>
    </>
  )
}

/** Takes this window off the HUD. Not offered on the last one: a HUD of nothing is refused. */
function RemoveButton({ id, readings }: { id: string; readings: HudReadingSet }) {
  const reading = readingId(id)
  if (!reading || readingCount(readings) <= 1) return null
  return (
    <button type="button" className="hud-remove" aria-label={`Remove ${HUD_READING_LABELS[reading]}`} onClick={() => void send(buildToggleReading(readings, reading))}>
      <X size={11} strokeWidth={3} />
    </button>
  )
}

/** Along the top of the screen while arranging: the readings that are off, and Done. */
function ArrangePalette({ readings }: { readings: HudReadingSet }) {
  const off = (['delta', ...HUD_CHART_ORDER] as const).filter((id) => (id === 'delta' ? !readings.showDelta : !readings.panelIds.includes(id)))
  return (
    <div className="hud-palette-wrap">
      <div className="hud-palette">
        {off.length > 0 ? <span className="hud-palette-label">Add</span> : <span className="hud-palette-label">Every reading is on</span>}
        {off.map((id) => (
          <button key={id} type="button" className="hud-chip" onClick={() => void send(buildToggleReading(readings, id))}>
            <Plus size={12} /> {HUD_READING_LABELS[id]}
          </button>
        ))}
        <span className="hud-palette-divider" />
        <button type="button" className="button primary" onClick={() => void send(buildHudArrange(false))}>
          <Check size={14} /> Done
        </button>
      </div>
    </div>
  )
}

const readingId = (id: string): HudReadingId | null => (id === 'delta' ? 'delta' : HUD_CHART_ORDER.find((candidate) => candidate === id) ?? null)

/** The HUD has nowhere to show an error; a refused change leaves the windows as they are, and the log says why. */
async function send(command: Parameters<typeof bridge.sendCommand>[0]): Promise<void> {
  try {
    await bridge.sendCommand(command)
  } catch (error) {
    console.error('[sprint] HUD change failed:', error)
  }
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
