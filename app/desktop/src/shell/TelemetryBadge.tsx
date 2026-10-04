import type { SprintState } from '../bridge'
import { Status } from './Status'
import { TELEMETRY_STATUS_TONE, describeTelemetry } from './telemetry'

// Quiet title-bar status: a tone dot + the link description (status is never
// colour alone). The same description is reused, not re-derived, by Home/Help.
//
// With `onOpen` (the macOS toolbar) it is an indicator button, as Mail's: a capsule that opens
// Help & diagnostics, which shows the detail; its tooltip carries the label and detail, since a
// narrow toolbar shrinks the capsule to its dot (styles.mac.css).
export function TelemetryBadge({ telemetry, onOpen }: { telemetry: SprintState['telemetry']; onOpen?: () => void }) {
  const description = describeTelemetry(telemetry)
  const tone = TELEMETRY_STATUS_TONE[description.tone]
  if (onOpen) {
    return (
      <button
        type="button"
        className="telemetry-indicator"
        onClick={onOpen}
        // The visible status leads the name (label in name); the rest says what the button does.
        aria-label={`${description.label}, open Help & diagnostics`}
        title={description.detail ? `${description.label} — ${description.detail}` : description.label}
      >
        <Status tone={tone} quiet className="telemetry-badge">
          {description.label}
        </Status>
      </button>
    )
  }
  return (
    <Status tone={tone} quiet className="telemetry-badge" title={description.detail ?? undefined}>
      {description.label}
    </Status>
  )
}
