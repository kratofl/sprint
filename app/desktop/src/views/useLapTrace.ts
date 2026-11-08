import { useEffect, useState } from 'react'
import { bridge } from '../bridge'
import { isTraceUsable, parseLapChannelTrace } from './AnalysisDomain'
import type { CorpusLap, LapChannelTrace } from './AnalysisDomain'

/** A selected lap's trace: none picked or no channels, fetching, drawn, or fetched but unusable. */
export type TraceState = { kind: 'none' } | { kind: 'loading' } | { kind: 'ready'; trace: LapChannelTrace } | { kind: 'unavailable' }

/**
 * Lap traces are fetched on demand (bridge.analysisTrace), never held in polled state — a
 * trace is a few hundred KB, too large to poll every frame.
 */
export function useLapTrace(lap: CorpusLap | null): TraceState {
  const [state, setState] = useState<TraceState>({ kind: 'none' })
  const sessionId = lap?.sessionId
  const lapNumber = lap?.lapNumber
  const hasChannels = lap?.hasChannels === true

  useEffect(() => {
    if (sessionId === undefined || lapNumber === undefined || !hasChannels) {
      setState({ kind: 'none' })
      return
    }

    let cancelled = false
    setState({ kind: 'loading' })
    void bridge.analysisTrace(sessionId, lapNumber).then((raw) => {
      if (cancelled) return
      const trace = parseLapChannelTrace(raw)
      setState(trace && isTraceUsable(trace) ? { kind: 'ready', trace } : { kind: 'unavailable' })
    })

    return () => {
      cancelled = true
    }
  }, [sessionId, lapNumber, hasChannels])

  return state
}
