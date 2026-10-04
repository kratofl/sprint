import { MonitorOff } from 'lucide-react'
import { DashRenderer } from '@sprint/dashboard'
import type { DashLayout } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { deviceHasScreen, logicalSize, resolvePurpose, resolveDevicePreview } from './DevicesDomain'
import type { Device, ScreenOutput } from './DevicesDomain'

/**
 * The live dash mirror shown on a device's detail page (old Avalonia client's
 * `DeviceScreenPreview`/`DeviceMirrorDisplay`) and, smaller, on its gallery card.
 *
 * Per the settled preview design (see memory: "device preview frame = native panel shape with
 * dash rendered UPRIGHT"), the outer frame is the device's own panel aspect ratio — post-rotation,
 * via `logicalSize` — and `DashRenderer` always paints upright inside it; rotation is a hardware
 * pixel-pipeline concern the renderer never sees. The frame fits within `maxWidth`/`maxHeight`
 * like the deleted client's `DeviceMirrorDisplay`, never stretching past the device's real aspect.
 */
export function DevicePreview({
  device,
  screen,
  dashLayouts,
  frame,
  maxWidth,
  maxHeight,
}: {
  device: Device
  screen: ScreenOutput | undefined
  dashLayouts: readonly DashLayout[]
  frame: TelemetryFrame | null
  maxWidth: number
  maxHeight: number
}) {
  if (!deviceHasScreen(device)) {
    return <PreviewPlaceholder maxWidth={maxWidth} maxHeight={maxHeight} label="Controller only" />
  }

  if (resolvePurpose(device.purpose).id !== 'dash') {
    return <PreviewPlaceholder maxWidth={maxWidth} maxHeight={maxHeight} label="No output to preview" />
  }

  const size = logicalSize(device)
  const source = size.width > 0 && size.height > 0 ? resolveDevicePreview(device, screen, dashLayouts) : null
  if (!source) {
    return <PreviewPlaceholder maxWidth={maxWidth} maxHeight={maxHeight} label="No output to preview" />
  }

  const scale = Math.min(maxWidth / size.width, maxHeight / size.height)
  const width = Math.max(1, Math.round(size.width * scale))
  const height = Math.max(1, Math.round(size.height * scale))

  return (
    <div className="devices-preview-frame" style={{ width: width + 8, height: height + 8 }}>
      <DashRenderer
        layout={source.layout}
        frame={frame}
        width={width}
        height={height}
        pageId={source.pageId}
        idle={source.idle}
        className="devices-preview-canvas"
      />
    </div>
  )
}

function PreviewPlaceholder({ maxWidth, maxHeight, label }: { maxWidth: number; maxHeight: number; label: string }) {
  return (
    <div className="devices-preview-frame devices-preview-empty" style={{ width: maxWidth, height: maxHeight }}>
      <MonitorOff size={maxHeight > 80 ? 22 : 14} strokeWidth={1.5} />
      {maxHeight > 80 && <span className="muted">{label}</span>}
    </div>
  )
}
