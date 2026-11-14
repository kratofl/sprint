// A dash drawn by the Rust renderer compiled to WebAssembly: the same pixels the wheel shows.
// Every dash picture in the desktop app is one of these. It only ever draws stills (an exact
// banner or none, no alert history): live alert tracking is the wheel's business, in the host.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TelemetryFrame } from '@sprint/types'
import type { DashLayout } from './index'
import type { DashAlertBanner } from './alerts'
import { loadDashWasm, type DashWasm } from './dashWasm.js'
import { toHostFrame } from './hostFrame'

// The WebAssembly build (scripts/build-dash-renderer.mjs --wasm writes it; the desktop app's Vite
// config runs that before every dev server and build). Vite turns this into the URL of the
// emitted asset.
const WASM_URL = new URL('../generated/sprint_dash.wasm', import.meta.url)

type WasmState = { kind: 'loading' } | { kind: 'ready'; wasm: DashWasm } | { kind: 'failed'; message: string }

// One renderer for the whole page: every canvas draws through it in turn (a draw is synchronous),
// so its font and glyph caches are shared.
let shared: WasmState = { kind: 'loading' }
let loading: Promise<WasmState> | null = null

function loadShared(): Promise<WasmState> {
  loading ??= loadDashWasm(fetch(WASM_URL)).then(
    (wasm): WasmState => (shared = { kind: 'ready', wasm }),
    (error: unknown): WasmState => {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[dash] the dash renderer could not be loaded:', error)
      // A later canvas tries again.
      loading = null
      return (shared = { kind: 'failed', message: `The dash renderer could not be loaded: ${message}` })
    },
  )
  return loading
}

/** The shared renderer, loaded on first use. */
function useDashWasm(): WasmState {
  const [state, setState] = useState(shared)
  useEffect(() => {
    if (state.kind !== 'loading') return
    let live = true
    void loadShared().then((next) => {
      if (live) setState(next)
    })
    return () => {
      live = false
    }
  }, [state.kind])
  return state
}

/** `window.devicePixelRatio`, followed when the window moves to another display or zooms. */
function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1)
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`)
    const onChange = (): void => setRatio(window.devicePixelRatio || 1)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [ratio])
  return ratio
}

/**
 * Draws one still into `canvas` at the renderer's device-pixel size. Returns the renderer's
 * message when the dash cannot be drawn; the canvas is then left empty.
 */
function paint(canvas: HTMLCanvasElement, wasm: DashWasm, scene: string, frame: string, banner: string): string | null {
  const context = canvas.getContext('2d')
  if (!context) return 'This view cannot draw pictures (no 2D canvas).'
  try {
    wasm.setScene(scene)
    wasm.renderStill(frame, banner, Date.now())
  } catch (error) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    console.error('[dash] the dash could not be drawn:', error)
    return `Can't draw this dash: ${error instanceof Error ? error.message : String(error)}`
  }
  const { width, height } = wasm
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  context.putImageData(new ImageData(wasm.imagePixels(), width, height), 0, 0)
  return null
}

export interface DashCanvasProps {
  layout: DashLayout
  frame?: TelemetryFrame | null
  /** The picture's size in CSS px; it is drawn at the device pixel ratio. */
  width: number
  height: number
  pageId?: string
  idle?: boolean
  /** Exactly this popup over the dash (the designer plays an alert with it), or none. */
  alertBanner?: DashAlertBanner | null
  className?: string
}

/**
 * One dash page against one frame, `width` x `height` CSS px. Before the renderer has loaded the
 * canvas is empty. A dash the renderer cannot draw shows its message instead (and logs it), so
 * an undrawable layout is obvious. It draws again only when what it draws changes: the inputs
 * are compared as JSON, so a parent handing over equal objects again redraws nothing.
 */
export function DashCanvas({ layout, frame, width, height, pageId, idle, alertBanner, className }: DashCanvasProps) {
  const state = useDashWasm()
  const ratio = useDevicePixelRatio()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scene = JSON.stringify({ layout, width, height, scale: ratio, pageId, idle: idle ?? false })
  // The renderer reads the host's telemetry JSON; the app hands over the @sprint/types mirror.
  const frameJson = frame ? JSON.stringify(toHostFrame(frame)) : ''
  const bannerJson = alertBanner ? JSON.stringify(alertBanner) : ''

  // Before paint, so the picture and anything laid over it (the designer's selection) change in
  // the same frame.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || state.kind !== 'ready') return
    setError(paint(canvas, state.wasm, scene, frameJson, bannerJson))
  }, [state, scene, frameJson, bannerJson])

  const message = state.kind === 'failed' ? state.message : error
  return (
    <span className={className ? `dash-canvas ${className}` : 'dash-canvas'} style={{ display: 'block', position: 'relative', width, height }}>
      <canvas ref={canvasRef} style={{ display: 'block', width, height }} />
      {message !== null && (
        <span className="dash-canvas-error" role="alert" title={message}>
          {message}
        </span>
      )}
    </span>
  )
}
