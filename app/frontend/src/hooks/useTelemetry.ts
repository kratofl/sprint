import { useState, useEffect, useRef } from 'react'
import { onEvent } from '@/lib/wails'
import type { TelemetryFrame } from '@sprint/types'

export type { TelemetryFrame }

interface UseTelemetryResult {
  frame: TelemetryFrame | null
  connected: boolean
  fps: number
}

/**
 * Subscribes to the live telemetry stream pushed from the Go backend via Wails events.
 */
export function useTelemetry(): UseTelemetryResult {
  const [frame, setFrame] = useState<TelemetryFrame | null>(null)
  const [connected, setConnected] = useState(false)
  const [fps, setFps] = useState(0)

  const frameCount = useRef(0)

  useEffect(() => {
    const unsubTelemetry = onEvent('telemetry:frame', (data) => {
      setFrame(data as TelemetryFrame)
      setConnected(true)
      frameCount.current++
    })

    const unsubDisconnect = onEvent('telemetry:disconnected', () => {
      setConnected(false)
      setFrame(null)
    })

    // FPS counter
    const interval = setInterval(() => {
      setFps(frameCount.current)
      frameCount.current = 0
    }, 1000)

    return () => {
      unsubTelemetry()
      unsubDisconnect()
      clearInterval(interval)
    }
  }, [])

  return { frame, connected, fps }
}
