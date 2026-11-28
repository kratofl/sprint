import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Download, PanelLeft, Search } from 'lucide-react'
import type { UpdateStatus } from '../bridge'
import { platform } from '../platform'
import { ProgressRing } from './ProgressRing'
import { displayVersion } from './updates'
import { shortcutAria, shortcutLabel } from './shortcuts'

type TitleBarProps = {
  onOpenPalette: () => void
  /** The page's name (shell/nav.ts `viewLabel`). */
  title: string
  /** macOS, while the sidebar is hidden: the toolbar offers it back. Null otherwise. */
  onShowSidebar: (() => void) | null
  /** The element the current page's actions render into (PageHeader portals them). */
  onActionsSlot: (slot: HTMLElement | null) => void
  /**
   * Hands up `measure`, which reads the room (px) the toolbar can give those actions
   * right now. Sent again, as a new object, whenever the toolbar resizes.
   */
  onActionsRoom: (room: { measure: () => number }) => void
  /** Where the self-update stands: an update on offer, or on its way, shows left of search. */
  update: UpdateStatus
  onInstallUpdate: () => void
}

/**
 * The window's toolbar, right of the sidebar, in two zones (styles.css lays them out as one grid).
 * Leading: on macOS while the sidebar is hidden, the button that brings it back; then the page's
 * name. There is no back button: a deeper page carries its own way up, and
 * Alt+Left / ⌘[ goes up a level (App.tsx). Trailing: the page's actions (PageHeader portals them
 * into the slot), the update button while there is an update (`UpdateIndicator`), then a search
 * field that opens the palette. The game link lives in the status bar (StatusBar.tsx), not here.
 *
 * Windows and Linux: 48px, and it is the window's title bar. The OS caption buttons are
 * Electron's native `titleBarOverlay` on the right; `.titlebar-trail` reserves their width
 * from the `titlebar-area-*` env() values.
 *
 * macOS: 52px (styles.mac.css). The traffic lights are the OS's, over the sidebar's top band (or
 * over the toolbar's left inset while the sidebar is hidden).
 */
export function TitleBar({
  onOpenPalette,
  title,
  onShowSidebar,
  onActionsSlot,
  onActionsRoom,
  update,
  onInstallUpdate,
}: TitleBarProps) {
  const toolbarRef = useRef<HTMLElement>(null)
  const leadRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLButtonElement>(null)
  const updateRef = useRef<HTMLElement>(null)

  // The actions' room is what the grid leaves after the leading zone, the search field and the
  // gaps. Read on demand (PageHeader asks before paint, after the new page title is in), so a
  // decision never uses a stale width.
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current
    const lead = leadRef.current
    const trail = trailRef.current
    const search = searchRef.current
    if (!toolbar || !lead || !trail || !search) return
    const measure = (): number => {
      const bar = getComputedStyle(toolbar)
      const inner = toolbar.clientWidth - parseFloat(bar.paddingLeft) - parseFloat(bar.paddingRight)
      const trailGap = parseFloat(getComputedStyle(trail).columnGap)
      const gaps = parseFloat(bar.columnGap) + trailGap
      // The update button, while there is one, takes its width and one more gap.
      const update = updateRef.current ? updateRef.current.offsetWidth + trailGap : 0
      return Math.floor(inner - lead.offsetWidth - search.offsetWidth - update - gaps)
    }
    onActionsRoom({ measure })
    const observer = new ResizeObserver(() => onActionsRoom({ measure }))
    observer.observe(toolbar)
    return () => observer.disconnect()
    // The update button coming, growing into "Installing…" or going changes the room too.
  }, [onActionsRoom, update.kind])

  return (
    <header ref={toolbarRef} className="titlebar">
      <div ref={leadRef} className="titlebar-lead">
        {onShowSidebar ? (
          <button type="button" className="titlebar-sidebar-toggle" onClick={onShowSidebar} aria-label="Show sidebar" title="Show sidebar">
            <PanelLeft size={16} strokeWidth={1.7} />
          </button>
        ) : null}
        {/* The page's own <h1> (visually hidden) stays the accessible title. */}
        <span className="titlebar-title" aria-hidden="true">
          {title}
        </span>
      </div>
      <div ref={trailRef} className="titlebar-trail">
        <div ref={onActionsSlot} className="titlebar-actions" />
        <UpdateIndicator ref={updateRef} status={update} onInstall={onInstallUpdate} />
        <SearchButton ref={searchRef} onOpenPalette={onOpenPalette} />
      </div>
    </header>
  )
}

function SearchButton({ onOpenPalette, ref }: { onOpenPalette: () => void; ref?: RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      ref={ref}
      type="button"
      className="titlebar-search"
      onClick={onOpenPalette}
      aria-label="Search commands and pages"
      aria-keyshortcuts={shortcutAria(platform, { kind: 'palette' })}
    >
      <span className="titlebar-search-placeholder">Search</span>
      <kbd>{shortcutLabel(platform, { kind: 'palette' })}</kbd>
      <Search size={13} strokeWidth={1.8} aria-hidden="true" />
    </button>
  )
}

/**
 * The self-update in the toolbar, shown only while there is one: a brand download button while a
 * version is on offer (a click installs it: download, quit, install, start again), a ring filling
 * with the download, then "Installing…" until Sprint quits into the installer.
 */
function UpdateIndicator({ status, onInstall, ref }: { status: UpdateStatus; onInstall: () => void; ref: RefObject<HTMLElement | null> }) {
  switch (status.kind) {
    case 'available': {
      const label = `Sprint ${displayVersion(status.version)} is out — restart to update`
      return (
        <button ref={(element) => { ref.current = element }} type="button" className="icon-button titlebar-update" onClick={onInstall} aria-label={label} title={label}>
          <Download size={16} strokeWidth={2} />
        </button>
      )
    }
    case 'downloading':
      return <ProgressRing ref={(element) => { ref.current = element }} percent={status.percent} label={`Downloading Sprint ${displayVersion(status.version)}`} />
    case 'installing':
      return (
        <span ref={(element) => { ref.current = element }} className="titlebar-update-text" role="status">
          Installing…
        </span>
      )
    default:
      return null
  }
}
