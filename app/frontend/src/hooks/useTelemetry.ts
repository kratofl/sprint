import { useState, useEffect, useRef } from 'react'
import { IsConnected } from '../../wailsjs/go/main/App'
import { TELEMETRY_EVENTS } from '@/lib/desktopEvents'
import { onEvent, runDesktopCall } from '@/lib/wails'
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
    runDesktopCall('IsConnected', () => IsConnected()).then(setConnected).catch(() => {})

    const unsubTelemetry = onEvent(TELEMETRY_EVENTS.frame, (data) => {
      setFrame(data)
      setConnected(true)
      frameCount.current++
    })

    const unsubConnect = onEvent(TELEMETRY_EVENTS.connected, () => {
      setConnected(true)
    })

    const unsubDisconnect = onEvent(TELEMETRY_EVENTS.disconnected, () => {
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
