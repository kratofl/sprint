// Wails runtime bindings wrapper.
//
// Uses the official Wails v2 runtime exports from wailsjs/runtime/runtime.js
// which properly call EventsOnMultiple(name, cb, -1) for unlimited callbacks.
// Do NOT call window.runtime.EventsOn directly — it may default to
// maxCallbacks=1 (fire-once), causing live updates to stop after the first event.

import {
  EventsOn,
  EventsOff,
  EventsEmit,
} from '../../wailsjs/runtime/runtime'

// App method caller.

/**
 * Calls a method on the Wails-bound App struct.
 * Returns a rejected promise if the Wails runtime is not available (e.g. in
 * browser dev mode outside the Wails shell).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function call<T>(method: string, ...args: unknown[]): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = (window as any)?.go?.main?.App ?? null
  if (!app || typeof app[method] !== 'function') {
    return Promise.reject(new Error(`Wails method not available: ${method}`))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (app[method] as (...a: any[]) => Promise<T>)(...args)
}

// Runtime helpers.

/**
 * Emits a Wails event to the backend.
 */
export function emitEvent(event: string, data?: unknown): void {
  EventsEmit(event, data)
}

/**
 * Subscribes to a Wails event from the backend.
 * Returns a cleanup function that removes this listener. If the Wails runtime
 * returns a cancel function, it is used; otherwise falls back to EventsOff.
 */
export function onEvent(
  event: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (...data: any[]) => void,
): () => void {
  const cancel = EventsOn(event, callback)
  return () => {
    if (typeof cancel === 'function') {
      cancel()
    } else {
      EventsOff(event)
    }
  }
}
