import { Status } from '../shell/Status'
import { describeDeviceStatus, deviceHasScreen, type Device, type ScreenOutput, type ScreenStatusTone } from './DevicesDomain'

// Which InfoBar a status earns on the device page. Healthy and in-progress states (Connected,
// Connecting) need none; neutral ones (Not found, Unsupported) are informational, the rest keep
// their own severity. A device turned off gets none either: the header already says so.
const INFOBAR_SEVERITY: Record<ScreenStatusTone, 'info' | 'warning' | 'error' | null> = {
  neutral: 'info',
  info: null,
  success: null,
  warning: 'warning',
  danger: 'error',
}

/** Status as dot + word (tiles, rows, the device header). Only call for `deviceHasScreen(device)`. */
export function DeviceStatusLabel({ device, screen }: { device: Device; screen: ScreenOutput | undefined }) {
  const view = describeDeviceStatus(device, screen)
  return (
    <Status tone={view.tone} title={view.detail}>
      {view.label}
    </Status>
  )
}

/** InfoBar under the device header when its screen should work and does not (not found, USB access, setup needed, …). */
export function DeviceStatusInfoBar({ device, screen }: { device: Device; screen: ScreenOutput | undefined }) {
  if (device.disabled || !deviceHasScreen(device)) return null
  const view = describeDeviceStatus(device, screen)
  const severity = INFOBAR_SEVERITY[view.tone]
  if (severity === null) return null
  return (
    <div className={`infobar ${severity}`} role={severity === 'info' ? 'status' : 'alert'}>
      <span className="infobar-icon" aria-hidden="true">
        {severity === 'info' ? 'i' : '!'}
      </span>
      <strong className="infobar-title">{view.label}</strong>
      <span className="infobar-message">{view.detail}</span>
    </div>
  )
}
