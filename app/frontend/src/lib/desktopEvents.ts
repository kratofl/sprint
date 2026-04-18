import type { ReleaseInfo, TelemetryFrame } from '@sprint/types'

export const APP_EVENTS = {
  ready: 'app:ready',
} as const

export const TELEMETRY_EVENTS = {
  frame: 'telemetry:frame',
  connected: 'telemetry:connected',
  disconnected: 'telemetry:disconnected',
} as const

export const DASH_EVENTS = {
  pageChanged: 'dash:page-changed',
  preview: 'dash:preview',
} as const

export const SCREEN_EVENTS = {
  connected: 'screen:connected',
  disconnected: 'screen:disconnected',
  driverMissing: 'screen:driver_missing',
} as const

export const DEVICE_EVENTS = {
  updated: 'devices:updated',
} as const

export const UPDATE_EVENTS = {
  available: 'update:available',
} as const

export interface DashPageChangedEvent {
  deviceID: string
  pageIndex: number
  pageName: string
}

export interface DashPreviewEvent {
  png: string
  pageIndex?: number
  idle?: boolean
}

export interface ScreenDriverMissingEvent {
  driver: string
  error: string
}

export interface DesktopEventMap {
  [APP_EVENTS.ready]: undefined
  [TELEMETRY_EVENTS.frame]: TelemetryFrame
  [TELEMETRY_EVENTS.connected]: undefined
  [TELEMETRY_EVENTS.disconnected]: undefined
  [DASH_EVENTS.pageChanged]: DashPageChangedEvent
  [DASH_EVENTS.preview]: DashPreviewEvent
  [SCREEN_EVENTS.connected]: undefined
  [SCREEN_EVENTS.disconnected]: undefined
  [SCREEN_EVENTS.driverMissing]: ScreenDriverMissingEvent
  [DEVICE_EVENTS.updated]: undefined
  [UPDATE_EVENTS.available]: ReleaseInfo
}

export type DesktopEventName = keyof DesktopEventMap
