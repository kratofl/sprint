import { isRecord } from './frames.js'

/**
 * Whether the monitor overlay should be open, from the polled `/api/state`: the driver asked
 * for it, it has something to draw, and there is a lap to draw it from.
 */
export function readGuideOverlayWanted(state: unknown): boolean {
  if (!isRecord(state) || !isRecord(state.settings) || !isRecord(state.guide)) return false
  const settings = state.settings.drivingGuide
  if (!isRecord(settings)) return false
  return settings.monitorOverlay === true
    && (settings.showLine === true || settings.showBoards === true)
    && state.guide.status === 'Ready'
}

/** Splits a byte stream into lines. Holds a partial last line until the rest of it arrives. */
export class LineSplitter {
  private readonly decoder = new TextDecoder()
  private rest = ''

  push(chunk: Uint8Array): string[] {
    const lines = (this.rest + this.decoder.decode(chunk, { stream: true })).split('\n')
    this.rest = lines.pop() ?? ''
    return lines.filter((line) => line.length > 0)
  }
}

/** The renderer mounts the overlay instead of the app shell when this is present. */
export function guideRoute(baseUrl: string): string {
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}guide=overlay`
}
