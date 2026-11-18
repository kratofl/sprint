import { useEffect, useState } from 'react'
import { bridge } from '../bridge'
import type { PitWallTrace, TraceLap } from './pitWallData'

/** How often the lap being driven is asked for again: 30 fps, the rate the driver's samples arrive at. */
const CURRENT_MS = 33

/** How often a finished lap (last, best, target) is asked for again; it changes once a lap at most. */
const FINISHED_MS = 1000

/**
 * The laps a tile draws, asked of the host while `enabled` and its window is not minimised: the
 * lap being driven 30 times a second, so its line grows live, the others once a second. A tile is
 * only mounted while it is on screen. Laps not yet answered are absent.
 */
export function useTraces(laps: readonly TraceLap[], enabled: boolean): Partial<Record<TraceLap, PitWallTrace>> {
  const [traces, setTraces] = useState<Partial<Record<TraceLap, PitWallTrace>>>({})
  const key = laps.join(',')

  useEffect(() => {
    if (!enabled || key.length === 0) return
    const wanted = laps.slice()
    let alive = true
    // Per lap, one request at a time and only the newest answer is shown, so an older one never lands last.
    const poll = (lap: TraceLap, every: number): (() => void) => {
      let asked = 0
      let inFlight = false
      const load = () => {
        // A minimised window asks for nothing.
        if (document.hidden || inFlight) return
        const request = ++asked
        inFlight = true
        bridge
          .pitWallTrace(lap)
          .then((trace) => {
            if (alive && request === asked) setTraces((shown) => ({ ...shown, [lap]: trace }))
          })
          .catch((failure: unknown) => console.error('Pit wall trace failed', failure))
          .finally(() => {
            inFlight = false
          })
      }
      load()
      const timer = window.setInterval(load, every)
      return () => window.clearInterval(timer)
    }
    const stops = wanted.map((lap) => poll(lap, lap === 'current' ? CURRENT_MS : FINISHED_MS))
    return () => {
      alive = false
      stops.forEach((stop) => stop())
    }
    // `key` stands for `laps`, which a caller rebuilds every render.
  }, [key, enabled])

  return traces
}
