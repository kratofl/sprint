import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DashAlertTracker,
  DashRenderer,
  parseDashRenderInput,
  resolveDashPalette,
  type DashAlertBanner,
  type DashRenderInput,
} from '@sprint/dashboard'
import '@sprint/dashboard/styles.css'
import { bridge, type SprintState } from './bridge'

/**
 * The dashboard half of the app. Electron opens one offscreen window per
 * configured screen at `?dash=<deviceId>`; whatever this paints is captured and
 * pushed to that device, so the hardware panel shows the same DOM the editor
 * preview does rather than a native imitation of it.
 */
export function DashOutput({ deviceId }: { deviceId: string }) {
  const [state, setState] = useState<SprintState | null>(null)
  const [alertBanner, setAlertBanner] = useState<DashAlertBanner | null>(null)
  // One tracker for the lifetime of this window: it diffs each frame against the
  // previous one to detect tc/abs/engine-map changes, so it must survive across renders.
  const trackerRef = useRef<DashAlertTracker | null>(null)

  useEffect(() => {
    bridge.getState().then(setState)
    return bridge.subscribe(setState)
  }, [])

  // `readOutput` builds a fresh object on every call, so it is memoized on the two things
  // that actually determine its result.
  const input = useMemo(() => (state ? readOutput(state, deviceId) : null), [state, deviceId])
  // Kept current on every render (not just when the tracker effect fires) so that effect can
  // read the freshest layout without needing `input` itself in its dependency array — `input`
  // is a new object on every unrelated state push, but `input.frame` is only a new reference
  // when the host actually publishes a new telemetry frame, which is the one signal the
  // tracker should react to.
  const inputRef = useRef(input)
  inputRef.current = input

  // Feeds the tracker exactly once per pushed telemetry frame: this effect's dependency is
  // the frame reference itself, so an unrelated state push (e.g. a settings edit) that leaves
  // the frame unchanged does not re-run it.
  useEffect(() => {
    const current = inputRef.current
    const frame = current?.frame ?? null
    if (!current || !frame) {
      trackerRef.current?.reset()
      setAlertBanner(null)
      return
    }

    if (!trackerRef.current) trackerRef.current = new DashAlertTracker()
    // `resolveDashPalette` already falls back to the functional palette when the layout has
    // no theme overrides, which is exactly what an unset `layout.colorSystem` should resolve
    // to — so passing it through as-is reproduces the renderer's own effective-color-system
    // choice without needing that internal helper here.
    const palette = resolveDashPalette(current.layout.theme, current.layout.colorSystem)
    trackerRef.current.advanceTo(Date.now())
    setAlertBanner(trackerRef.current.evaluate(current.layout, frame, palette))
  }, [input?.frame])

  // A blank frame is the honest output for an unconfigured or not-yet-known
  // screen: painting an error would push that error onto the driver's wheel.
  if (!input) return <div className="dash-output-idle" />

  return (
    <DashRenderer
      layout={input.layout}
      frame={input.frame}
      width={input.width ?? 0}
      height={input.height ?? 0}
      pageId={input.pageId}
      idle={input.idle}
      settings={state?.settings}
      targets={input.targets}
      alertBanner={alertBanner}
    />
  )
}

/** Narrows the host's screen description once, at this boundary. */
function readOutput(state: SprintState, deviceId: string): DashRenderInput | null {
  const screen = state.screens.find((candidate) => candidate.deviceId === deviceId)
  if (!screen) return null
  try {
    return parseDashRenderInput({
      layout: screen.layout,
      frame: state.telemetry.frame,
      width: screen.width,
      height: screen.height,
      pageId: screen.pageId,
      idle: screen.idle,
      targets: state.targets,
    })
  } catch {
    return null
  }
}

/** `?dash=<deviceId>` selects dashboard output; its absence means the app shell. */
export function dashDeviceId(search: string): string | null {
  return new URLSearchParams(search).get('dash')
}
