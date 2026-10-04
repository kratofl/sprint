export interface PixelFrame {
  readonly width: number
  readonly height: number
  readonly sequence: number
  readonly bytes: Uint8Array<ArrayBuffer>
}

/** Serial delivery with one replaceable pending frame. A slow USB path cannot queue history. */
export class LatestFrameSender {
  private pending: PixelFrame | undefined
  private sending = false
  private stopped = false
  private readonly cancellation = new AbortController()

  constructor(
    private readonly send: (frame: PixelFrame, signal: AbortSignal) => Promise<void>,
    private readonly failed: (error: unknown) => void,
  ) {}

  offer(frame: PixelFrame): void {
    if (this.stopped) return
    this.pending = frame
    if (!this.sending) void this.drain()
  }

  stop(): void {
    this.stopped = true
    this.pending = undefined
    this.cancellation.abort()
  }

  private async drain(): Promise<void> {
    this.sending = true
    try {
      while (!this.stopped && this.pending) {
        const frame = this.pending
        this.pending = undefined
        try {
          await this.send(frame, this.cancellation.signal)
        } catch (error) {
          if (!this.stopped) this.failed(error)
        }
      }
    } finally {
      this.sending = false
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface ScreenOutput {
  readonly deviceId: string
  readonly width: number
  readonly height: number
  readonly refreshHz: number
  readonly layout: Record<string, unknown>
  readonly pageId: string | undefined
  readonly idle: boolean
  readonly targets: unknown
}

export function readScreenOutputs(value: unknown): ScreenOutput[] {
  if (!isRecord(value) || !Array.isArray(value.screens)) return []
  const result: ScreenOutput[] = []
  for (const entry of value.screens) {
    if (!isRecord(entry) || typeof entry.deviceId !== 'string' || !isRecord(entry.layout)) continue
    if (typeof entry.width !== 'number' || !Number.isInteger(entry.width) || entry.width < 1 || entry.width > 4096) continue
    if (typeof entry.height !== 'number' || !Number.isInteger(entry.height) || entry.height < 1 || entry.height > 4096) continue
    if (typeof entry.refreshHz !== 'number' || !Number.isFinite(entry.refreshHz)) continue
    result.push({
      deviceId: entry.deviceId, width: entry.width, height: entry.height,
      refreshHz: Math.max(1, Math.min(120, Math.round(entry.refreshHz))),
      layout: entry.layout, pageId: typeof entry.pageId === 'string' ? entry.pageId : undefined,
      idle: entry.idle === true, targets: entry.targets,
    })
  }
  return result
}
