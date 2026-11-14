import type { BrowserWindow } from 'electron'
import { onScreen, pitWallQuery, type Bounds, type PitWallWindowKey, type PitWallWindowsWanted } from './pitWallRoute.js'

/** How long a window must sit still after a move or resize before its place is saved. */
const SAVE_DELAY_MS = 600

/** What the pit wall needs from Electron and the host; main.ts wires it. */
export type PitWallHooks = {
  /** Makes one pit wall window, already loading its page, at `bounds` (null: a default size). */
  create: (key: PitWallWindowKey, bounds: Bounds | null) => BrowserWindow
  /** Saves where a window sits (`pitwall.placeWindow`). */
  place: (key: PitWallWindowKey, bounds: Bounds) => void
  /** The work areas of every display, to drop bounds on a monitor since unplugged. */
  displays: () => Bounds[]
}

/**
 * The pit wall's windows: the wall itself (`?pitwall=main`, opened from the Race engineer page
 * and maximised), plus one window per page or tile the layout has in its own window
 * (`?pitwall=page:<id>`, `?pitwall=tile:<id>`), reconciled from `state.pitWallLayout` on every
 * poll like the dash designers. Those only exist while the wall is open: closing it closes them,
 * and they come back where they were the next time it opens. Every window saves its place, a
 * moment after it was moved or resized.
 */
export class PitWallWindows {
  private main: BrowserWindow | undefined
  private readonly detached = new Map<string, { key: PitWallWindowKey; window: BrowserWindow }>()
  private wanted: PitWallWindowsWanted | null = null

  constructor(private readonly hooks: PitWallHooks) {}

  get isOpen(): boolean {
    return this.main !== undefined
  }

  /** Opens the wall, or brings it (or one page's or tile's window) to the front. */
  open(key: PitWallWindowKey): void {
    if (key.kind !== 'main') {
      const entry = this.detached.get(pitWallQuery(key))
      if (entry) this.front(entry.window)
      return
    }
    if (this.main && !this.main.isDestroyed()) {
      this.front(this.main)
      return
    }
    const bounds = onScreen(this.wanted?.mainBounds ?? null, this.hooks.displays())
    const window = this.hooks.create(key, bounds)
    window.maximize()
    this.main = window
    this.track(window, key)
    window.once('closed', () => {
      if (this.main !== window) return
      this.main = undefined
      // The pages and tiles belong to the wall: they close with it and reopen with it.
      this.closeDetached()
    })
    this.reconcile(this.wanted)
  }

  /** Opens the windows the layout wants and destroys the rest. `wanted` null (a bad poll) changes nothing. */
  reconcile(wanted: PitWallWindowsWanted | null): void {
    if (!wanted) return
    this.wanted = wanted
    if (!this.main) return
    const keep = new Set(wanted.detached.map((entry) => pitWallQuery(entry)))
    for (const [id, entry] of this.detached) {
      if (keep.has(id)) continue
      this.detached.delete(id)
      if (!entry.window.isDestroyed()) entry.window.destroy()
    }
    for (const entry of wanted.detached) {
      const key: PitWallWindowKey = { kind: entry.kind, id: entry.id }
      const id = pitWallQuery(key)
      if (this.detached.has(id)) continue
      const window = this.hooks.create(key, onScreen(entry.bounds, this.hooks.displays()))
      this.detached.set(id, { key, window })
      this.track(window, key)
      window.once('closed', () => {
        if (this.detached.get(id)?.window === window) this.detached.delete(id)
      })
    }
  }

  /** Closes the wall and every window of it, at once (Sprint is quitting or its main window closed). */
  closeAll(): void {
    this.closeDetached()
    const main = this.main
    this.main = undefined
    if (main && !main.isDestroyed()) main.destroy()
  }

  private closeDetached(): void {
    for (const { window } of this.detached.values()) {
      if (!window.isDestroyed()) window.destroy()
    }
    this.detached.clear()
  }

  private front(window: BrowserWindow): void {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  /** Saves the window's place a moment after it stops moving; the wall saves its unmaximised size. */
  private track(window: BrowserWindow, key: PitWallWindowKey): void {
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        if (window.isDestroyed() || window.isMinimized()) return
        this.hooks.place(key, key.kind === 'main' ? window.getNormalBounds() : window.getBounds())
      }, SAVE_DELAY_MS)
    }
    window.on('move', save)
    window.on('resize', save)
    window.once('closed', () => {
      if (timer) clearTimeout(timer)
    })
  }
}
