import type { SprintState } from '../bridge'
import { TELEMETRY_STATUS_TONE, describeTelemetry } from './telemetry'

/**
 * The game link as a row at the foot of the sidebar, above Settings: a tone dot where a nav item
 * has its icon, then the link description ("Le Mans Ultimate · 60 Hz"). It opens Help &
 * diagnostics, which shows the detail. On the collapsed rail only the dot stays; the tooltip and
 * accessible name keep the words (status is never colour alone). `telemetry` is null until the
 * host's first state arrives.
 */
export function TelemetryRow({
  telemetry,
  collapsed,
  onOpen,
}: {
  telemetry: SprintState['telemetry'] | null
  collapsed: boolean
  onOpen: () => void
}) {
  const description = telemetry ? describeTelemetry(telemetry) : null
  const label = description?.label ?? 'Loading…'
  const tone = description ? TELEMETRY_STATUS_TONE[description.tone] : 'neutral'
  const tooltip = description?.detail ? `${label} — ${description.detail}` : label

  return (
    <div className="navview-telemetry">
      <button
        type="button"
        className="nav-item nav-telemetry"
        onClick={onOpen}
        disabled={description === null}
        // The visible status leads the name (label in name); the rest says what the button does.
        aria-label={`${label}, open Help & diagnostics`}
        title={collapsed ? tooltip : (description?.detail ?? undefined)}
      >
        <span className={`status tone-${tone} nav-telemetry-dot`} aria-hidden="true">
          <span className="status-dot" />
        </span>
        <span className="nav-item-label">{label}</span>
      </button>
    </div>
  )
}
