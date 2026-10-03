import { Status } from '../shell/Status'
import {
  describeDeviceStatus,
  formatDurationMs,
  formatFramesPerSecond,
  type Device,
  type ScreenOutput,
  type ScreenStatusTone,
} from './DevicesDomain'

// Which InfoBar a status earns on the detail pane. Healthy and in-progress states
// (Connected, Connecting) need no bar; neutral ones (Not found, Disabled, Unsupported)
// are informational, the rest keep their own severity.
const INFOBAR_SEVERITY: Record<ScreenStatusTone, 'info' | 'warning' | 'error' | null> = {
  neutral: 'info',
  info: null,
  success: null,
  warning: 'warning',
  danger: 'error',
}

/** Status as dot + word (list rows, Device card). Only call for `deviceHasScreen(device)`. */
export function DeviceStatusLabel({ device, screen }: { device: Device; screen: ScreenOutput | undefined }) {
  const view = describeDeviceStatus(device, screen)
  return (
    <Status tone={view.tone} title={view.detail}>
      {view.label}
    </Status>
  )
}

/**
 * The status explanation under the status in the Device card — only for states without an
 * InfoBar (Connected, Connecting); otherwise `DeviceStatusInfoBar` already says it.
 */
export function DeviceStatusDetail({ device, screen }: { device: Device; screen: ScreenOutput | undefined }) {
  const view = describeDeviceStatus(device, screen)
  if (INFOBAR_SEVERITY[view.tone] !== null) return null
  return <span className="field-hint">{view.detail}</span>
}

/** InfoBar above the detail cards when the screen is not working (not found, USB access, setup needed, …). */
export function DeviceStatusInfoBar({ device, screen }: { device: Device; screen: ScreenOutput | undefined }) {
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

/** Real USB delivery performance for the device's active output. */
export function ScreenPerformanceMetrics({ screen }: { screen: ScreenOutput | undefined }) {
  const performance = screen?.hardware?.performance
  return (
    <section className="card devices-performance">
      <h2 className="card-title">Screen performance</h2>
      {performance ? (
        <>
          <div className="devices-performance-grid">
            <PerformanceMetric label="Screen output" title="Frames successfully delivered to the physical screen over USB." value={formatFramesPerSecond(performance)} />
            <PerformanceMetric label="Source" title="Desktop capture or dash painting for the physical screen." value={formatDurationMs(performance.sourceTimeMs)} />
            <PerformanceMetric label="Pixel transform" title="RGB565 conversion, orientation, margin, offset, or native-buffer copy." value={formatDurationMs(performance.pixelTransformTimeMs)} />
            <PerformanceMetric label="USB transfer" title="Time spent delivering the completed native frame to the screen." value={formatDurationMs(performance.usbTransferTimeMs)} />
            <PerformanceMetric label="Total" title="Source, pixel transform, and USB time for the last delivered frame." value={formatDurationMs(performance.totalFrameTimeMs)} />
          </div>
          {screen?.delivery && (
            <span className="muted">
              Last frame delivered to the renderer: #{screen.delivery.sequence} ({screen.delivery.bytes.toLocaleString()} bytes)
            </span>
          )}
        </>
      ) : (
        <span className="muted">No delivered frames yet.</span>
      )}
    </section>
  )
}

function PerformanceMetric({ label, title, value }: { label: string; title: string; value: string }) {
  return (
    <div className="devices-performance-metric" title={title}>
      <span className="ui-label">{label}</span>
      <span className="tabular devices-performance-value">{value}</span>
    </div>
  )
}
