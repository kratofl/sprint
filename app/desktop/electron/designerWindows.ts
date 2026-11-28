import type { BrowserWindow } from 'electron'

/** How long a closing designer may take to save its last edit before it is closed anyway. */
const CLOSE_TIMEOUT_MS = 3000

/**
 * The dash designer windows: one per dash, opened from the Dashes page (`sprint:open-dash-designer`).
 * Opening a dash that already has a window brings that window forward. A window closes when its
 * dash disappears from the host state (deleted), and all of them close when Sprint quits.
 *
 * Closing a designer normally lets its page save a pending edit first (the page holds the close
 * in `beforeunload` and closes itself once saved). A deleted dash's window is destroyed instead:
 * there is nothing left to save into.
 */
export class DashDesigners {
  private readonly windows = new Map<string, BrowserWindow>()

  /** `create` makes the window for one dash, already loading the designer page. */
  constructor(private readonly create: (dashId: string) => BrowserWindow) {}

  get count(): number {
    return this.windows.size
  }

  open(dashId: string): void {
    const existing = this.windows.get(dashId)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return
    }
    const window = this.create(dashId)
    this.windows.set(dashId, window)
    window.once('closed', () => {
      if (this.windows.get(dashId) === window) this.windows.delete(dashId)
    })
  }

  /** Destroys the window of every dash the host no longer has. `dashIds` null (a bad poll) closes nothing. */
  reconcile(dashIds: ReadonlySet<string> | null): void {
    if (!dashIds) return
    for (const [dashId, window] of this.windows) {
      if (dashIds.has(dashId)) continue
      this.windows.delete(dashId)
      if (!window.isDestroyed()) window.destroy()
    }
  }

  /** Closes every designer, letting each save first; resolves once all are gone. */
  closeAll(): Promise<void> {
    const closing = [...this.windows.values()].map(
      (window) =>
        new Promise<void>((resolve) => {
          if (window.isDestroyed()) {
            resolve()
            return
          }
          const timer = setTimeout(() => {
            if (!window.isDestroyed()) window.destroy()
          }, CLOSE_TIMEOUT_MS)
          window.once('closed', () => {
            clearTimeout(timer)
            resolve()
          })
          window.close()
        }),
    )
    return Promise.all(closing).then(() => undefined)
  }
}
