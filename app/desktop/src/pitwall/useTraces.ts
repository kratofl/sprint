import { useEffect, useState } from 'react'
import { bridge } from '../bridge'
import type { PitWallTrace, TraceLap } from './pitWallData'

/** How often a visible traces or target tile asks for the laps again. */
const POLL_MS = 1000

/**
 * The laps a tile draws, asked of the host once a second while `enabled` and its window is not
 * minimised; a tile is only mounted while it is on screen. Laps not yet answered are absent.
 */
export function useTraces(laps: readonly TraceLap[], enabled: boolean): Partial<Record<TraceLap, PitWallTrace>> {
  const [traces, setTraces] = useState<Partial<Record<TraceLap, PitWallTrace>>>({})
  const key = laps.join(',')

  useEffect(() => {
    if (!enabled || key.length === 0) return
    const wanted = laps.slice()
    let alive = true
    // One request at a time, and only the newest answer is shown, so an older one never lands last.
    let asked = 0
    let inFlight = false
    const load = () => {
      // A minimised window asks for nothing.
      if (document.hidden || inFlight) return
      const request = ++asked
      inFlight = true
      Promise.all(wanted.map(async (lap): Promise<[TraceLap, PitWallTrace]> => [lap, await bridge.pitWallTrace(lap)]))
        .then((answers) => {
          if (alive && request === asked) setTraces(Object.fromEntries(answers))
        })
        .catch((failure: unknown) => console.error('Pit wall trace failed', failure))
        .finally(() => {
          inFlight = false
        })
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
    // `key` stands for `laps`, which a caller rebuilds every render.
  }, [key, enabled])

  return traces
}
