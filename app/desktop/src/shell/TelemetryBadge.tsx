import type { SprintState } from '../bridge'
import { Status } from './Status'
import { TELEMETRY_STATUS_TONE, describeTelemetry } from './telemetry'

// Quiet title-bar status: a tone dot + the link description (status is never
// colour alone). The same description is reused, not re-derived, by Home/Help.
export function TelemetryBadge({ telemetry }: { telemetry: SprintState['telemetry'] }) {
  const description = describeTelemetry(telemetry)
  return (
    <Status tone={TELEMETRY_STATUS_TONE[description.tone]} quiet className="telemetry-badge" title={description.detail ?? undefined}>
      {description.label}
    </Status>
  )
}
