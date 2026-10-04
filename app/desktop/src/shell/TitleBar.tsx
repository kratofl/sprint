import { useLayoutEffect, useRef, type RefObject } from 'react'
import { ArrowLeft, ChevronLeft, PanelLeft, Search } from 'lucide-react'
import sprintMark from '../assets/sprint-mark.svg'
import { platform } from '../platform'
import type { RuntimeState } from './runtime'
import { shortcutAria, shortcutLabel } from './shortcuts'
import { Status } from './Status'
import { TelemetryBadge } from './TelemetryBadge'

type TitleBarProps = {
  canGoBack: boolean
  onBack: () => void
  runtime: RuntimeState
  onOpenPalette: () => void
  /** The current page's navigation label; only the macOS toolbar shows it. */
  title: string
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  /** The macOS "Show sidebar" button, focused after the sidebar is hidden from the keyboard. */
  showSidebarRef: RefObject<HTMLButtonElement | null>
  /** macOS: the telemetry indicator opens Help & diagnostics. */
  onOpenDiagnostics: () => void
  /** macOS: the element the current page's actions render into (PageHeader portals them). */
  onActionsSlot: (slot: HTMLElement | null) => void
  /**
   * macOS: hands up `measure`, which reads the room (px) the toolbar can give those actions
   * right now. Sent again, as a new object, whenever the toolbar resizes.
   */
  onActionsRoom: (room: { measure: () => number }) => void
}

/**
 * The window's top bar, drawn per platform.
 *
 * Windows: the 48px Fluent title bar on Mica — back, app mark + name, a centred search
 * box that opens the command palette, and the telemetry status. The OS caption buttons
 * are Electron's native `titleBarOverlay` on the right; `.titlebar-trail` reserves their
 * width from the `titlebar-area-*` env() values.
 *
 * macOS: the 52px toolbar right of the sidebar, in the HIG's three zones (styles.mac.css lays
 * them out as one grid). Leading: (sidebar toggle while the sidebar is hidden), back, the page
 * title. Centre: the telemetry indicator. Trailing: the page's actions (PageHeader portals them
 * into the slot), then a search field that opens the palette. The traffic lights are the OS's,
 * over the sidebar's top band (or over the toolbar's left inset while the sidebar is hidden).
 */
export function TitleBar(props: TitleBarProps) {
  return platform === 'mac' ? <MacToolbar {...props} /> : <WindowsTitleBar {...props} />
}

function WindowsTitleBar({ canGoBack, onBack, runtime, onOpenPalette }: TitleBarProps) {
  return (
    <header className="titlebar">
      <div className="titlebar-lead">
        <BackButton canGoBack={canGoBack} onBack={onBack} />
        <img className="titlebar-mark" src={sprintMark} alt="" aria-hidden="true" />
        <span className="titlebar-name">Sprint</span>
      </div>
      <SearchButton onOpenPalette={onOpenPalette} />
      <div className="titlebar-trail">
        {runtime.kind === 'ready' ? <TelemetryBadge telemetry={runtime.sprint.telemetry} /> : <TelemetryLoading />}
      </div>
    </header>
  )
}

function MacToolbar({
  canGoBack,
  onBack,
  runtime,
  onOpenPalette,
  title,
  sidebarCollapsed,
  onToggleSidebar,
  showSidebarRef,
  onOpenDiagnostics,
  onActionsSlot,
  onActionsRoom,
}: TitleBarProps) {
  const toolbarRef = useRef<HTMLElement>(null)
  const leadRef = useRef<HTMLDivElement>(null)
  const centreRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLButtonElement>(null)

  // The actions' room is what the grid leaves after the leading zone, the search field, the
  // gaps and the centre's minimum (the telemetry indicator collapsed to its dot), so the
  // indicator shrinks first and the actions leave only when even the dot would not fit.
  // Read on demand (PageHeader asks before paint, after the new page title is in), so a
  // decision never uses a stale width.
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current
    const lead = leadRef.current
    const centre = centreRef.current
    const trail = trailRef.current
    const search = searchRef.current
    if (!toolbar || !lead || !centre || !trail || !search) return
    const measure = (): number => {
      const bar = getComputedStyle(toolbar)
      const inner = toolbar.clientWidth - parseFloat(bar.paddingLeft) - parseFloat(bar.paddingRight)
      const gaps = 2 * parseFloat(bar.columnGap) + parseFloat(getComputedStyle(trail).columnGap)
      const centreMin = parseFloat(getComputedStyle(centre).minWidth) || 0
      return Math.floor(inner - lead.offsetWidth - search.offsetWidth - gaps - centreMin)
    }
    onActionsRoom({ measure })
    const observer = new ResizeObserver(() => onActionsRoom({ measure }))
    observer.observe(toolbar)
    return () => observer.disconnect()
  }, [onActionsRoom])

  return (
    <header ref={toolbarRef} className="titlebar">
      <div ref={leadRef} className="titlebar-lead">
        {sidebarCollapsed ? (
          <button
            ref={showSidebarRef}
            type="button"
            className="titlebar-sidebar-toggle"
            onClick={onToggleSidebar}
            aria-label="Show sidebar"
            aria-expanded={false}
            title="Show sidebar"
          >
            <PanelLeft size={16} strokeWidth={1.7} />
          </button>
        ) : null}
        <BackButton canGoBack={canGoBack} onBack={onBack} />
        {/* The page's own <h1> (visually hidden on macOS) stays the accessible title. */}
        <span className="titlebar-title" aria-hidden="true">
          {title}
        </span>
      </div>
      <div ref={centreRef} className="titlebar-centre">
        {runtime.kind === 'ready' ? (
          <TelemetryBadge telemetry={runtime.sprint.telemetry} onOpen={onOpenDiagnostics} />
        ) : (
          <TelemetryLoading />
        )}
      </div>
      <div ref={trailRef} className="titlebar-trail">
        <div ref={onActionsSlot} className="titlebar-actions" />
        <SearchButton ref={searchRef} onOpenPalette={onOpenPalette} />
      </div>
    </header>
  )
}

function BackButton({ canGoBack, onBack }: { canGoBack: boolean; onBack: () => void }) {
  const mac = platform === 'mac'
  return (
    <button
      type="button"
      className="titlebar-back"
      onClick={onBack}
      disabled={!canGoBack}
      aria-label="Back"
      aria-keyshortcuts={shortcutAria(platform, { kind: 'back' })}
      title={`Back (${shortcutLabel(platform, { kind: 'back' })})`}
    >
      {mac ? <ChevronLeft size={18} strokeWidth={1.8} /> : <ArrowLeft size={14} strokeWidth={1.7} />}
    </button>
  )
}

function SearchButton({ onOpenPalette, ref }: { onOpenPalette: () => void; ref?: RefObject<HTMLButtonElement | null> }) {
  const mac = platform === 'mac'
  return (
    <button
      ref={ref}
      type="button"
      className="titlebar-search"
      onClick={onOpenPalette}
      aria-label="Search commands and pages"
      aria-keyshortcuts={shortcutAria(platform, { kind: 'palette' })}
    >
      <span className="titlebar-search-placeholder">{mac ? 'Search' : 'Search commands and pages'}</span>
      <kbd>{shortcutLabel(platform, { kind: 'palette' })}</kbd>
      <Search size={13} strokeWidth={1.8} aria-hidden="true" />
    </button>
  )
}

function TelemetryLoading() {
  return (
    <Status tone="neutral" quiet className="telemetry-badge">
      Loading…
    </Status>
  )
}
