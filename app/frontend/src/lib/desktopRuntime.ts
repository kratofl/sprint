export interface DesktopRuntimeWindowLike {
  go?: {
    main?: {
      App?: object
    }
  }
  runtime?: {
    EventsOnMultiple?: unknown
    EventsOff?: unknown
  }
}

export function hasDesktopAppBridge(runtimeWindow: DesktopRuntimeWindowLike | undefined): boolean {
  return Boolean(runtimeWindow?.go?.main?.App)
}

export function hasDesktopEventBridge(runtimeWindow: DesktopRuntimeWindowLike | undefined): boolean {
  return (
    typeof runtimeWindow?.runtime?.EventsOnMultiple === 'function' &&
    typeof runtimeWindow?.runtime?.EventsOff === 'function'
  )
}
