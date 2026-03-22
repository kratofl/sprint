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

// ── Runtime helpers ───────────────────────────────────────────────────────

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
