import * as React from 'react'
import { cn } from '../../lib/utils'

export interface TrackMapProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current car world X coordinate in metres. */
  positionX: number
  /** Current car world Z coordinate in metres (used as the 2D plan Y axis). */
  positionZ: number
  /** Normalized lap distance, 0–1. Used to order and de-duplicate the traced line. */
  trackPosition: number
  /**
   * Track identity (e.g. the track name). When it changes the recorded
   * racing line is cleared so a new circuit is traced from scratch.
   */
  trackId?: string
}

/** Number of buckets the lap is quantized into — caps the traced point count. */
const BUCKETS = 600
/** Minimum recorded points before we draw an outline rather than the acquiring state. */
const MIN_POINTS = 24

const VIEW_W = 240
const VIEW_H = 140
const PAD = 12

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

interface Projected {
  /** Ordered outline points as an SVG path "d" string. */
  d: string
  /** Projected current car position. */
  car: { x: number; y: number } | null
  /** Projected start/finish point. */
  start: { x: number; y: number } | null
}

/**
 * Live track map. Records the car's world (X, Z) positions keyed by normalized
 * lap distance as the car laps, building up the circuit outline, then plots the
 * live car position on it. Coordinates are auto-scaled to fit the viewbox while
 * preserving aspect ratio, so it works for any circuit without a stored map.
 */
export function TrackMap({
  positionX,
  positionZ,
  trackPosition,
  trackId,
  className,
  ...props
}: TrackMapProps) {
  // Recorded line: bucket index -> world point. A ref so we accumulate across
  // frames without re-rendering on every duplicate sample.
  const pointsRef = React.useRef<Map<number, { x: number; z: number }>>(new Map())
  const trackRef = React.useRef<string | undefined>(trackId)
  const [, bump] = React.useReducer((c: number) => c + 1, 0)

  React.useEffect(() => {
    // Reset the trace when the circuit changes.
    if (trackRef.current !== trackId) {
      trackRef.current = trackId
      pointsRef.current = new Map()
      bump()
    }

    if (!Number.isFinite(positionX) || !Number.isFinite(positionZ)) return
    // (0,0) is the common "no position data" sentinel — skip it.
    if (positionX === 0 && positionZ === 0) return

    const bucket = Math.round(clamp01(trackPosition) * (BUCKETS - 1))
    if (!pointsRef.current.has(bucket)) {
      pointsRef.current.set(bucket, { x: positionX, z: positionZ })
      bump()
    }
  }, [positionX, positionZ, trackPosition, trackId])

  const projected = React.useMemo<Projected>(() => {
    const entries = Array.from(pointsRef.current.entries()).sort((a, b) => a[0] - b[0])
    if (entries.length < MIN_POINTS) return { d: '', car: null, start: null }

    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const [, p] of entries) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }

    const spanX = maxX - minX || 1
    const spanZ = maxZ - minZ || 1
    const scale = Math.min((VIEW_W - PAD * 2) / spanX, (VIEW_H - PAD * 2) / spanZ)
    // Centre the circuit within the viewbox.
    const offX = (VIEW_W - spanX * scale) / 2
    const offZ = (VIEW_H - spanZ * scale) / 2

    const project = (x: number, z: number) => ({
      x: offX + (x - minX) * scale,
      // Flip Z so "north" is up on screen.
      y: VIEW_H - (offZ + (z - minZ) * scale),
    })

    const d = entries
      .map(([, p], i) => {
        const { x, y } = project(p.x, p.z)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ') + ' Z'

    const car = Number.isFinite(positionX) && !(positionX === 0 && positionZ === 0)
      ? project(positionX, positionZ)
      : null
    const startPoint = entries[0]?.[1]
    const start = startPoint ? project(startPoint.x, startPoint.z) : null

    return { d, car, start }
  }, [positionX, positionZ])

  return (
    <div className={cn('relative w-full', className)} {...props}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" role="img" aria-label="Track map">
        {projected.d ? (
          <>
            <path
              d={projected.d}
              fill="none"
              stroke="var(--border-2)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={projected.d}
              fill="none"
              stroke="var(--panel-3)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {projected.start && (
              <circle cx={projected.start.x} cy={projected.start.y} r={3} fill="var(--muted)" />
            )}
            {projected.car && (
              <circle cx={projected.car.x} cy={projected.car.y} r={4.5} fill="var(--orange)" stroke="var(--bg)" strokeWidth={1.5} />
            )}
          </>
        ) : (
          <text
            x={VIEW_W / 2}
            y={VIEW_H / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-saira"
            fontSize={10}
            fill="var(--muted-2)"
          >
            ACQUIRING TRACK…
          </text>
        )}
      </svg>
    </div>
  )
}
