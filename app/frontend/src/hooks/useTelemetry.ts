import { useState, useEffect, useRef } from 'react'
import { onEvent } from '@/lib/wails'
import { IsConnected } from '../../wailsjs/go/main/App'
import type { TelemetryFrame } from '@sprint/types'

export type { TelemetryFrame }

interface UseTelemetryResult {
  frame: TelemetryFrame | null
  connected: boolean
  fps: number
}

/**
 * Subscribes to the live telemetry stream pushed from the Go backend via Wails events.
 *
 * On mount, queries the current connection state via a bound Go method so that
 * the initial connected indicator is correct even if the telemetry:connected
 * event fired before the React tree had mounted.
 */
export function useTelemetry(): UseTelemetryResult {
  const [frame, setFrame] = useState<TelemetryFrame | null>(null)
  const [connected, setConnected] = useState(false)
  const [fps, setFps] = useState(0)

  const frameCount = useRef(0)

  useEffect(() => {
    // Query current state immediately so we don't miss early connection events.
    IsConnected().then(setConnected).catch(() => {})

    const unsubTelemetry = onEvent('telemetry:frame', (data) => {
      setFrame(data as TelemetryFrame)
      setConnected(true)
      frameCount.current++
    })

    const unsubConnect = onEvent('telemetry:connected', () => {
      setConnected(true)
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
      unsubConnect()
      unsubDisconnect()
      clearInterval(interval)
    }
  }, [])

  return { frame, connected, fps }
}
