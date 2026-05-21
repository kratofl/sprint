import {
  EventsOn,
  EventsOff,
} from '../../wailsjs/runtime/runtime'
import type { DesktopEventMap, DesktopEventName } from './desktopEvents'
import { hasDesktopAppBridge, hasDesktopEventBridge, type DesktopRuntimeWindowLike } from './desktopRuntime'

type DesktopEventHandler<T> = [T] extends [undefined]
  ? () => void
  : (payload: T) => void

export function isDesktopRuntimeAvailable(): boolean {
  return hasDesktopAppBridge(window as DesktopRuntimeWindowLike)
}

export function runDesktopCall<T>(methodName: string, invoke: () => Promise<T>): Promise<T> {
  if (!isDesktopRuntimeAvailable()) {
    return Promise.reject(new Error(`Wails method not available: ${methodName}`))
  }
  return invoke()
}

/**
 * Subscribes to a Wails event from the backend.
 * Returns a cleanup function that removes this listener. If the Wails runtime
 * returns a cancel function, it is used; otherwise falls back to EventsOff.
 */
export function onEvent<E extends DesktopEventName>(
  event: E,
  callback: DesktopEventHandler<DesktopEventMap[E]>,
): () => void {
  if (!hasDesktopEventBridge(window as DesktopRuntimeWindowLike)) {
    return () => {}
  }
  const cancel = EventsOn(event, callback as (...data: unknown[]) => void)
  return () => {
    if (typeof cancel === 'function') {
      cancel()
    } else {
      EventsOff(event)
    }
  }
}
