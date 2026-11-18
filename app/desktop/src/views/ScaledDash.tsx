import { DashCanvas } from '@sprint/dashboard'
import type { DashAlertBanner, DashLayout } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { fitScreenSize } from './DashesDomain'

/**
 * A dash drawn at its screen's own size and shown smaller, fitted into `maxWidth` × `maxHeight`.
 * The renderer decides some things by the screen's size (a strip too short to read is drawn full
 * screen), so a preview drawn small would not show what the wheel shows.
 */
export function ScaledDash({
  layout,
  size,
  maxWidth,
  maxHeight,
  frame,
  pageId,
  banner,
}: {
  layout: DashLayout
  /** The screen's logical size, as the wheel draws it. */
  size: { width: number; height: number }
  maxWidth: number
  maxHeight: number
  frame?: TelemetryFrame | null
  pageId?: string
  banner?: DashAlertBanner | null
}) {
  const shown = fitScreenSize(size, maxWidth, maxHeight)
  const scale = size.width > 0 ? shown.width / size.width : 1
  return (
    <span className="scaled-dash" style={{ display: 'block', width: shown.width, height: shown.height, overflow: 'hidden' }}>
      <span style={{ display: 'block', width: size.width, height: size.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <DashCanvas layout={layout} frame={frame} width={size.width} height={size.height} pageId={pageId} alertBanner={banner} />
      </span>
    </span>
  )
}
