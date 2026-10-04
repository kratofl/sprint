import { BrowserWindow, type NativeImage, type Rectangle } from 'electron'
import { LatestFrameSender, type PixelFrame, type ScreenOutput } from './frames.js'

/**
 * One offscreen browser per active dashboard output. The same dashboard DOM that
 * the editor and preview use is painted here and pushed to the native host as raw
 * BGRA, so a hardware panel shows exactly what the UI shows rather than a native
 * imitation of it.
 *
 * Offscreen windows are independent of the main window, so output continues while
 * the app is hidden or minimized.
 */
export class OffscreenOutputs {
  private readonly outputs = new Map<string, Output>()

  constructor(
    private readonly baseUrl: string,
    private readonly send: (deviceId: string, frame: PixelFrame, signal: AbortSignal) => Promise<void>,
    private readonly failed: (deviceId: string, error: unknown) => void,
  ) {}

  /** Adds, resizes and removes windows so the live set matches `desired`. */
  reconcile(desired: readonly ScreenOutput[]): void {
    const seen = new Set<string>()
    for (const output of desired) {
      seen.add(output.deviceId)
      const existing = this.outputs.get(output.deviceId)
      if (!existing) {
        this.outputs.set(output.deviceId, this.open(output))
        continue
      }
      existing.apply(output)
    }
    for (const [deviceId, output] of this.outputs) {
      if (seen.has(deviceId)) continue
      output.close()
      this.outputs.delete(deviceId)
    }
  }

  closeAll(): void {
    for (const output of this.outputs.values()) output.close()
    this.outputs.clear()
  }

  private open(output: ScreenOutput): Output {
    return new Output(
      output,
      this.baseUrl,
      (frame, signal) => this.send(output.deviceId, frame, signal),
      (error) => this.failed(output.deviceId, error),
    )
  }
}

class Output {
  private readonly window: BrowserWindow
  private readonly sender: LatestFrameSender
  private sequence = 0
  private width: number
  private height: number
  private refreshHz: number

  constructor(
    output: ScreenOutput,
    baseUrl: string,
    send: (frame: PixelFrame, signal: AbortSignal) => Promise<void>,
    failed: (error: unknown) => void,
  ) {
    this.width = output.width
    this.height = output.height
    this.refreshHz = output.refreshHz
    this.sender = new LatestFrameSender(send, failed)
    this.window = new BrowserWindow({
      show: false,
      width: output.width,
      height: output.height,
      useContentSize: true,
      webPreferences: {
        offscreen: true,
        // Output must keep painting while the app is minimized or hidden.
        backgroundThrottling: false,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    this.window.webContents.setFrameRate(this.refreshHz)
    this.window.webContents.on('paint', (_event: Electron.Event, _dirty: Rectangle, image: NativeImage) => {
      this.offer(image)
    })
    void this.window.loadURL(routeFor(baseUrl, output.deviceId))
  }

  /** Applies a changed output description in place; only a size change needs a resize. */
  apply(output: ScreenOutput): void {
    if (output.refreshHz !== this.refreshHz) {
      this.refreshHz = output.refreshHz
      this.window.webContents.setFrameRate(output.refreshHz)
    }
    if (output.width === this.width && output.height === this.height) return
    this.width = output.width
    this.height = output.height
    this.window.setContentSize(output.width, output.height)
  }

  close(): void {
    this.sender.stop()
    if (!this.window.isDestroyed()) this.window.destroy()
  }

  private offer(image: NativeImage): void {
    const size = image.getSize()
    if (size.width !== this.width || size.height !== this.height) return
    const bitmap = image.toBitmap()
    const expected = this.width * this.height * 4
    if (bitmap.byteLength !== expected) return
    // toBitmap() hands back a buffer Electron may reuse on the next paint, so the
    // frame has to own its pixels before it is queued.
    const bytes = new Uint8Array(expected)
    bytes.set(bitmap)
    this.sequence += 1
    this.sender.offer({ width: this.width, height: this.height, sequence: this.sequence, bytes })
  }
}

/** The renderer mounts the dashboard instead of the app shell when this is present. */
export function routeFor(baseUrl: string, deviceId: string): string {
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}dash=${encodeURIComponent(deviceId)}`
}
