import type { BrowserWindow } from 'electron'
import { isRecord } from './frames.js'
import { onScreen, type Bounds } from './pitWallRoute.js'

/** How long the window must sit still after a move or resize before its place is saved. */
const SAVE_DELAY_MS = 600

/** What the debug window remembers between dev runs: where it was, and whether it kept on top. */
export type DebugWindowPrefs = { bounds: Bounds | null; onTop: boolean }

export const DEFAULT_DEBUG_PREFS: DebugWindowPrefs = { bounds: null, onTop: false }

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Narrows the saved prefs file; anything unreadable is the defaults. */
export function readDebugWindowPrefs(value: unknown): DebugWindowPrefs {
  if (!isRecord(value)) return DEFAULT_DEBUG_PREFS
  const { x, y, width, height } = isRecord(value.bounds) ? value.bounds : {}
  const bounds = finite(x) && finite(y) && finite(width) && finite(height) ? { x, y, width, height } : null
  return { bounds, onTop: value.onTop === true }
}

/** What the debug window needs from Electron and the host; main.ts wires it, dev runs only. */
export type DebugWindowHooks = {
  /** Makes the window, already loading its page, at `bounds` (null: a default size). */
  create: (bounds: Bounds | null) => BrowserWindow
  /** The work areas of every display, to drop bounds on a monitor since unplugged. */
  displays: () => Bounds[]
  /** `GET /api/debug`. */
  snapshot: () => Promise<unknown>
  load: () => DebugWindowPrefs
  save: (prefs: DebugWindowPrefs) => void
}

/**
 * The dev-only debug window (`?debug=1`, src/debug/DebugWindow.tsx): one window, opened from the
 * command palette or its shortcut, fed the host's debug snapshot on every state poll while it is
 * open. "Keep on top" puts it at the screen-saver level, above a borderless-fullscreen game; a game
 * in exclusive fullscreen cannot be drawn over, which the window says. It remembers its place and
 * the toggle in the dev data folder, and closes with the main window.
 */
export class DebugWindow {
  private window: BrowserWindow | undefined
  private prefs: DebugWindowPrefs | undefined
  private feeding = false

  constructor(private readonly hooks: DebugWindowHooks) {}

  get isOpen(): boolean {
    return this.window !== undefined
  }

  /** Opens the window, or brings it to the front. */
  open(): void {
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMinimized()) this.window.restore()
      this.window.show()
      this.window.focus()
      return
    }
    const prefs = this.loaded()
    const window = this.hooks.create(onScreen(prefs.bounds, this.hooks.displays()))
    this.window = window
    this.applyOnTop(window, prefs.onTop)
    this.track(window)
    window.once('closed', () => {
      if (this.window === window) this.window = undefined
    })
  }

  /** The window's toggle: keeps it over every other window, the game included, or not. */
  setOnTop(onTop: boolean): void {
    this.prefs = { ...this.loaded(), onTop }
    this.hooks.save(this.prefs)
    if (this.window && !this.window.isDestroyed()) this.applyOnTop(this.window, onTop)
  }

  /**
   * Sends the window the host's snapshot and how long the state poll took. One at a time: a slow
   * snapshot skips the next poll's rather than piling up.
   */
  async feed(statePollMs: number): Promise<void> {
    const window = this.window
    if (!window || window.isDestroyed() || this.feeding) return
    this.feeding = true
    let message: Record<string, unknown>
    try {
      message = { snapshot: await this.hooks.snapshot(), error: null }
    } catch (error) {
      message = { snapshot: null, error: error instanceof Error ? error.message : String(error) }
    } finally {
      this.feeding = false
    }
    if (window.isDestroyed()) return
    window.webContents.send('sprint:debug', { ...message, statePollMs, onTop: this.loaded().onTop })
  }

  close(): void {
    const window = this.window
    this.window = undefined
    if (window && !window.isDestroyed()) window.destroy()
  }

  private loaded(): DebugWindowPrefs {
    this.prefs ??= this.hooks.load()
    return this.prefs
  }

  private applyOnTop(window: BrowserWindow, onTop: boolean): void {
    // 'screen-saver' is the level above a borderless-fullscreen game; the default level is not.
    if (onTop) window.setAlwaysOnTop(true, 'screen-saver')
    else window.setAlwaysOnTop(false)
  }

  /** Saves the window's place a moment after it stops moving. */
  private track(window: BrowserWindow): void {
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        if (window.isDestroyed() || window.isMinimized()) return
        this.prefs = { ...this.loaded(), bounds: window.getBounds() }
        this.hooks.save(this.prefs)
      }, SAVE_DELAY_MS)
    }
    window.on('move', save)
    window.on('resize', save)
    window.once('closed', () => {
      if (timer) clearTimeout(timer)
    })
  }
}
