import type { SprintState } from '../bridge'
import { Status } from './Status'
import { TELEMETRY_STATUS_TONE, describeTelemetry } from './telemetry'

// The toolbar's telemetry indicator: a tone dot + the link description (status is never
// colour alone), on a capsule that opens Help & diagnostics, which shows the detail. Its tooltip
// carries the label and detail, since a narrow toolbar shrinks the capsule to its dot
// (styles.css). The same description is reused, not re-derived, by Help.
export function TelemetryBadge({ telemetry, onOpen }: { telemetry: SprintState['telemetry']; onOpen: () => void }) {
  const description = describeTelemetry(telemetry)
  const tone = TELEMETRY_STATUS_TONE[description.tone]
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
