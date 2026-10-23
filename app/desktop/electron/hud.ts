import { BrowserWindow, screen, type Rectangle, type WebContents } from 'electron'
import { HUD_CLOSED, hudMessageFor, readHudPlacements, type HudPlacement, type HudWanted } from './hudFeed.js'

/** How often an open HUD asks the host for a frame: smooth enough to read a braking zone sliding in. */
const FRAME_INTERVAL_MS = 50

/** What the HUD needs of the native host. */
export type HudHost = {
  /** `POST /api/compare/hud/windows`: where each window opens on these displays, primary first. */
  windows: (displays: readonly Rectangle[]) => Promise<unknown>
  /** `GET /api/compare/frame`: the newest snapshot, or null with no target. */
  frame: () => Promise<unknown>
  command: (command: Record<string, unknown>) => Promise<unknown>
}

type HudEntry = { window: BrowserWindow; placement: HudPlacement; lastSent: string | undefined }

/**
 * The training HUD (docs/internals/live-compare.md "HUD"): one small transparent, topmost window
 * per reading over the game, fed a frame every `FRAME_INTERVAL_MS` while it is open. Opened and
 * closed from the state poll, like the offscreen dash outputs.
 *
 * The windows never take focus, so the game keeps the keyboard. Locked, every click passes through
 * to the game; unlocked, a window is dragged by its body and sized by its corner grip, and the
 * host remembers where it was left on that monitor. Sizing is drawn by the page and applied here,
 * because a transparent window does not resize reliably by its edges.
 */
export class TrainingHud {
  private readonly entries = new Map<string, HudEntry>()
  private wanted: HudWanted = HUD_CLOSED
  /** Bumped on every open and close, so a slow open or frame loop from an older set stops itself. */
  private generation = 0

  constructor(
    private readonly route: (windowId: string) => string,
    private readonly preload: string,
    private readonly host: HudHost,
  ) {}

  reconcile(wanted: HudWanted): void {
    const previous = this.wanted
    this.wanted = wanted
    if (!wanted.open) {
      if (previous.open) this.close()
      return
    }
    if (!previous.open || previous.readings !== wanted.readings) {
      void this.open()
      return
    }
    if (previous.locked !== wanted.locked) {
      for (const entry of this.entries.values()) entry.window.setIgnoreMouseEvents(wanted.locked)
    }
  }

  /** A window's page subscribed; it missed whatever was sent before it loaded, so send it again. */
  resend(sender: WebContents): void {
    const entry = this.entryFor(sender)
    if (entry) entry.lastSent = undefined
  }

  /** The page's corner grip: the size it wants, and whether the drag has ended. */
  resize(sender: WebContents, width: number, height: number, done: boolean): void {
    const entry = this.entryFor(sender)
    if (!entry || this.wanted.locked) return
    const { minWidth, minHeight } = entry.placement
    entry.window.setSize(Math.max(minWidth, Math.round(width)), Math.max(minHeight, Math.round(height)))
    if (done) this.save(entry)
  }

  close(): void {
    this.generation += 1
    this.wanted = HUD_CLOSED
    for (const entry of this.entries.values()) {
      if (!entry.window.isDestroyed()) entry.window.destroy()
    }
    this.entries.clear()
  }

  private async open(): Promise<void> {
    for (const entry of this.entries.values()) {
      if (!entry.window.isDestroyed()) entry.window.destroy()
    }
    this.entries.clear()
    const generation = ++this.generation

    const primary = screen.getPrimaryDisplay()
    const displays = [primary, ...screen.getAllDisplays().filter((display) => display.id !== primary.id)]
    let placements: HudPlacement[]
    try {
      placements = readHudPlacements(await this.host.windows(displays.map((display) => display.bounds)))
    } catch (error) {
      console.error('[sprint] HUD placement failed:', error)
      // Forget the open, so the next state poll tries again.
      if (generation === this.generation) this.wanted = HUD_CLOSED
      return
    }
    if (generation !== this.generation) return

    for (const placement of placements) this.entries.set(placement.id, this.createWindow(placement))
    void this.pump(generation)
  }

  private createWindow(placement: HudPlacement): HudEntry {
    const window = new BrowserWindow({
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      title: placement.title,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      hasShadow: false,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Never focused, but it must keep painting at full rate behind the game.
        backgroundThrottling: false,
      },
    })
    // Above a borderless fullscreen game; 'screen-saver' is the level that stays above it.
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setIgnoreMouseEvents(this.wanted.locked)
    const entry: HudEntry = { window, placement, lastSent: undefined }
    window.once('ready-to-show', () => window.showInactive())
    window.on('moved', () => this.save(entry))
    window.once('closed', () => {
      if (this.entries.get(placement.id) === entry) this.entries.delete(placement.id)
    })
    void window.loadURL(this.route(placement.id))
    return entry
  }

  /** Fetches a frame, hands each window its part, and waits out the rest of the interval. */
  private async pump(generation: number): Promise<void> {
    while (generation === this.generation && this.entries.size > 0) {
      const started = Date.now()
      try {
        const frame = await this.host.frame()
        if (generation !== this.generation) return
        this.dispatch(frame)
      } catch (error) {
        console.error('[sprint] HUD frame failed:', error)
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, FRAME_INTERVAL_MS - (Date.now() - started))))
    }
  }

  /** Sends only what changed: a car stopped in the pits is the same frame, and costs no repaint. */
  private dispatch(frame: unknown): void {
    for (const [windowId, entry] of this.entries) {
      if (entry.window.isDestroyed()) continue
      const message = hudMessageFor(windowId, frame, this.wanted.locked)
      const text = JSON.stringify(message)
      if (text === entry.lastSent) continue
      entry.lastSent = text
      entry.window.webContents.send('sprint:hud', message)
    }
  }

  private save(entry: HudEntry): void {
    if (entry.window.isDestroyed()) return
    const bounds = entry.window.getBounds()
    const display = screen.getDisplayMatching(bounds)
    void this.host
      .command({ type: 'compare.hud.layout', windowId: entry.placement.id, screen: display.bounds, ...bounds })
      .catch((error: unknown) => { console.error('[sprint] HUD layout save failed:', error) })
  }

  private entryFor(sender: WebContents): HudEntry | undefined {
    for (const entry of this.entries.values()) {
      if (!entry.window.isDestroyed() && entry.window.webContents === sender) return entry
    }
    return undefined
  }
}

/** The renderer mounts a HUD window instead of the app shell when this is present. */
export function hudRouteFor(baseUrl: string, windowId: string): string {
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}hud=${encodeURIComponent(windowId)}`
}
