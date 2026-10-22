import { useEffect, useRef, useState } from 'react'
import { defaultDashPalette } from '@sprint/dashboard'
import { bridge } from '../bridge'
import type { GuideGeometry, GuidePose, GuideView } from './guideModel'
import { extrapolate, overlayShapes, type OverlayShapes, type Pedal } from './guideProjection'

/** A pose this old means the car left the track or the game paused: stop painting. */
const STALE_MS = 500

/**
 * The guide's colours repeat the wheel palette, like the VR layer's
 * (`guide_feed_layout.h`): throttle, lift, brake, board edge.
 */
const pedalColor: Record<Pedal, string> = {
  throttle: defaultDashPalette.success,
  coast: defaultDashPalette.raceControlYellow,
  brake: defaultDashPalette.danger,
}

/**
 * The monitor overlay: the guide drawn over the game in a transparent, click-through window
 * (`electron/guideOverlay.ts`). It paints once per display frame while poses arrive, each time
 * extrapolating the last pose to now, and stops as soon as they stop.
 */
export function GuideOverlay() {
  const [shapes, setShapes] = useState<OverlayShapes>({ runs: [], boards: [] })
  const latest = useRef<{ view: GuideView | null; geometry: GuideGeometry | null; pose: GuidePose | null; at: number }>({
    view: null, geometry: null, pose: null, at: 0,
  })

  useEffect(() => {
    let frame = 0
    const paint = () => {
      frame = 0
      const { view, geometry, pose, at } = latest.current
      const age = performance.now() - at
      if (!view || !geometry || !pose || age > STALE_MS) {
        setShapes({ runs: [], boards: [] })
        return
      }
      const screen = { width: window.innerWidth, height: window.innerHeight, fov: view.fov }
      setShapes(overlayShapes(geometry, extrapolate(pose, age / 1000), view, screen))
      frame = requestAnimationFrame(paint)
    }
    const unsubscribe = bridge.subscribeGuide((message) => {
      const state = latest.current
      if (message.type === 'settings') state.view = message.view
      else if (message.type === 'geometry') state.geometry = message.geometry
      else {
        state.pose = message.pose
        state.at = performance.now()
      }
      if (frame === 0) frame = requestAnimationFrame(paint)
    })
    return () => {
      unsubscribe()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <svg className="guide-overlay" width="100%" height="100%" aria-hidden="true">
      {shapes.runs.map((run, index) => (
        <polygon key={`run-${index}`} points={run.points} fill={pedalColor[run.pedal]} fillOpacity={0.8} />
      ))}
      {shapes.boards.map((board, index) => (
        <g key={`board-${index}`} opacity={0.9}>
          <polygon points={board.outer} fill={defaultDashPalette.foreground} />
          <polygon points={board.inner} fill={defaultDashPalette.danger} />
        </g>
      ))}
    </svg>
  )
}

/** Whether this window is the overlay (`?guide=overlay`, set by `electron/guideOverlay.ts`). */
export const isGuideOverlay = (search: string): boolean => new URLSearchParams(search).get('guide') === 'overlay'
