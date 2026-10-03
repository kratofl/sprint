import type { SprintState } from '../bridge'
import type { StatusTone } from './Status'

/**
 * Presentation-ready telemetry link description, derived once from the host's
 * link state so views never re-interpret raw status. Every view that shows the
 * link (toolbar badge, Home, Help) renders from this.
 *
 * - `live`: frames are arriving.
 * - `attention`: a link exists but is not healthy yet or any more (connecting, stale).
 * - `idle`: nothing to connect to — the normal state with no game running.
 * - `fault`: the source cannot work as configured.
 */
export type TelemetryTone = 'live' | 'attention' | 'idle' | 'fault'

export type TelemetryDescription = {
  tone: TelemetryTone
  label: string
  /** The source's own reason, when it gave one. Shown verbatim, never parsed. */
  detail: string | null
}

export const describeTelemetry = (telemetry: SprintState['telemetry']): TelemetryDescription => {
  const { link, hz } = telemetry
  const source = link.sourceName || 'Telemetry'
  switch (link.state) {
    case 'Connected':
      return {
        tone: 'live',
        label: `${source} · ${Math.round(hz)} Hz`,
        // A live link can still be delivering rejected frames; say so rather than hide it.
        detail: link.lastFrameValid ? null : link.invalidReason ?? 'Latest frame was rejected',
      }
    case 'Stale':
      return { tone: 'attention', label: `${source} · no fresh data`, detail: link.detail }
    case 'Connecting':
      return { tone: 'attention', label: `Connecting to ${source}`, detail: link.detail }
    case 'WaitingForGame':
      return { tone: 'idle', label: `Waiting for ${source}`, detail: link.detail }
    case 'Disconnected':
      return { tone: 'idle', label: 'No telemetry source', detail: link.detail }
    case 'Unsupported':
      return { tone: 'fault', label: `${source} is not supported`, detail: link.detail }
    case 'PermissionDenied':
      return { tone: 'fault', label: `No access to ${source}`, detail: link.detail }
    case 'Faulted':
      return { tone: 'fault', label: `${source} failed`, detail: link.detail }
  }
}

/** The status-dot colour for a link tone; screens' own hardware links use the same vocabulary. */
export const TELEMETRY_STATUS_TONE: Record<TelemetryTone, StatusTone> = {
  live: 'success',
  attention: 'warning',
  idle: 'neutral',
  fault: 'danger',
}
