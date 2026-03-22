// Wails runtime bindings wrapper.
//
// Wails v2 injects two globals at runtime:
//   - window.runtime.*    — event bus, logging, window management
//   - window.go.main.App.* — all exported Go methods on the App struct
//
// These helpers wrap both so the rest of the codebase doesn't touch window directly.

// ── Runtime helpers ───────────────────────────────────────────────────────

/**
 * Emits a Wails event to the backend.
 * Wraps `window.runtime.EventsEmit` with a typed signature.
 */
export function emitEvent(event: string, data?: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).runtime?.EventsEmit(event, data)
}

/**
 * Subscribes to a Wails event from the backend.
 * Returns an unsubscribe function.
 */
export function onEvent(event: string, callback: (data: unknown) => void): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).runtime?.EventsOn(event, callback)
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).runtime?.EventsOff(event)
  }
}
