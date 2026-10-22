import { BrowserWindow, screen } from 'electron'
import { LineSplitter } from './guideFeed.js'

/** How long a dropped stream waits before trying again while the overlay is still wanted. */
const RECONNECT_MS = 1000

/**
 * The driving guide over the game, on a monitor: one transparent, click-through, topmost window
 * across the primary display, fed by the host's pose stream. It never takes focus, so the game
 * keeps the keyboard. Opened and closed from the state poll, like the offscreen dash outputs.
 */
export class GuideOverlay {
  private window: BrowserWindow | undefined
  private stream: AbortController | undefined

  constructor(
    private readonly route: string,
    private readonly preload: string,
    private readonly open: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>,
  ) {}

  reconcile(wanted: boolean): void {
    if (wanted && !this.window) this.show()
    if (!wanted && this.window) this.close()
  }

  close(): void {
    this.stream?.abort()
    this.stream = undefined
    const window = this.window
    this.window = undefined
    if (window && !window.isDestroyed()) window.destroy()
  }

  private show(): void {
    const { bounds } = screen.getPrimaryDisplay()
    const window = new BrowserWindow({
      ...bounds,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      fullscreenable: false,
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Hidden behind nothing, but Chromium treats an unfocused window as background.
        backgroundThrottling: false,
      },
    })
    // Above a borderless fullscreen game; 'screen-saver' is the level that stays above it.
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setIgnoreMouseEvents(true)
    window.once('ready-to-show', () => window.showInactive())
    window.once('closed', () => {
      if (this.window === window) this.close()
    })
    void window.loadURL(this.route)
    this.window = window
    const controller = new AbortController()
    this.stream = controller
    void this.pump(window, controller.signal)
  }

  /** Forwards each stream line to the window, reconnecting while the overlay stays open. */
  private async pump(window: BrowserWindow, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const reader = (await this.open(signal)).getReader()
        const lines = new LineSplitter()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of lines.push(value)) {
            if (window.isDestroyed()) return
            let message: unknown
            try { message = JSON.parse(line) } catch { continue }
            window.webContents.send('sprint:guide', message)
          }
        }
      } catch (error) {
        if (signal.aborted) return
        console.error('[sprint] guide stream dropped:', error)
      }
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS))
    }
  }
}
