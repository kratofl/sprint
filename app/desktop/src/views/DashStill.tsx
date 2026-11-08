import { memo } from 'react'
import '@sprint/dashboard/styles.css'
import { DashRenderer, previewFrame } from '@sprint/dashboard'
import type { DashLayout } from '@sprint/dashboard'
import { fitScreenSize, layoutScreenProfile, sameDashContent } from './DashesDomain'

// The editor's "Mid-lap" preview state: a healthy racing frame, the same every time.
const STILL_FRAME = previewFrame('mid_lap')

type DashStillProps = {
  layout: DashLayout
  /** The box the picture fits into, keeping the dash's own aspect ratio. */
  maxWidth: number
  maxHeight: number
  className?: string
}

/**
 * A still picture of a dash's first page with sample values, for the Dashes overview and the
 * designer's Settings heading. It never sees live telemetry, and it draws again only when the
 * dash itself changes: state polls hand over fresh layout objects, so the props compare by content.
 */
export const DashStill = memo(function DashStill({ layout, maxWidth, maxHeight, className }: DashStillProps) {
  const size = fitScreenSize(layoutScreenProfile(layout), maxWidth, maxHeight)
  return (
    <span className={className ? `dash-still ${className}` : 'dash-still'} aria-hidden="true">
      <DashRenderer layout={layout} frame={STILL_FRAME} width={size.width} height={size.height} pageId={layout.pages[0]?.id} />
    </span>
  )
}, sameStill)

function sameStill(previous: DashStillProps, next: DashStillProps): boolean {
  return (
    previous.maxWidth === next.maxWidth &&
    previous.maxHeight === next.maxHeight &&
    previous.className === next.className &&
    sameDashContent(previous.layout, next.layout)
  )
}
