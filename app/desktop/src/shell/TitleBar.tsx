import { ArrowLeft, Search } from 'lucide-react'
import sprintMark from '../assets/sprint-mark.svg'
import type { RuntimeState } from './runtime'
import { Status } from './Status'
import { TelemetryBadge } from './TelemetryBadge'

/**
 * The 48px Fluent title bar on Mica: back, app mark + name, a centred search
 * box that opens the command palette, and the telemetry status. The OS caption
 * buttons are Electron's native `titleBarOverlay` on the right; `.titlebar-trail`
 * reserves their width from the `titlebar-area-*` env() values.
 */
export function TitleBar({
  canGoBack,
  onBack,
  runtime,
  onOpenPalette,
}: {
  canGoBack: boolean
  onBack: () => void
  runtime: RuntimeState
  onOpenPalette: () => void
}) {
  return (
    <header className="titlebar">
      <div className="titlebar-lead">
        <button type="button" className="titlebar-back" onClick={onBack} disabled={!canGoBack} aria-label="Back" title="Back (Alt+Left)">
          <ArrowLeft size={14} strokeWidth={1.7} />
        </button>
        <img className="titlebar-mark" src={sprintMark} alt="" aria-hidden="true" />
        <span className="titlebar-name">Sprint</span>
      </div>
      <button type="button" className="titlebar-search" onClick={onOpenPalette} aria-label="Search commands and pages" aria-keyshortcuts="Control+K">
        <span className="titlebar-search-placeholder">Search commands and pages</span>
        <kbd>Ctrl+K</kbd>
        <Search size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <div className="titlebar-trail">
        {runtime.kind === 'ready' ? (
          <TelemetryBadge telemetry={runtime.sprint.telemetry} />
        ) : (
          <Status tone="neutral" quiet className="telemetry-badge">
            Loading…
          </Status>
        )}
      </div>
    </header>
  )
}
