import { useLayoutEffect, useRef, type RefObject } from 'react'
import { PanelLeft, Search } from 'lucide-react'
import { platform } from '../platform'
import { shortcutAria, shortcutLabel } from './shortcuts'

type TitleBarProps = {
  onOpenPalette: () => void
  /** The current page's navigation label, shown as the page title. */
  title: string
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  /** The "Show sidebar" button, focused after the sidebar is hidden from the keyboard. */
  showSidebarRef: RefObject<HTMLButtonElement | null>
  /** The element the current page's actions render into (PageHeader portals them). */
  onActionsSlot: (slot: HTMLElement | null) => void
  /**
   * Hands up `measure`, which reads the room (px) the toolbar can give those actions
   * right now. Sent again, as a new object, whenever the toolbar resizes.
   */
  onActionsRoom: (room: { measure: () => number }) => void
}

/**
 * The window's toolbar, right of the sidebar, in two zones (styles.css lays them out as
 * one grid). Leading: (macOS: sidebar toggle while the sidebar is hidden), the page title. There
 * is no back button: a deeper page carries its own way up, and Alt+Left / ⌘[ goes up a level (App.tsx).
 * Trailing: the page's actions (PageHeader portals them into the slot), then a search field that
 * opens the palette. The game link lives at the foot of the sidebar (TelemetryRow.tsx), not here.
 *
 * Windows and Linux: 48px, and it is the window's title bar. The OS caption buttons are
 * Electron's native `titleBarOverlay` on the right; `.titlebar-trail` reserves their width
 * from the `titlebar-area-*` env() values.
 *
 * macOS: 52px (styles.mac.css). The traffic lights are the OS's, over the sidebar's top band
 * (or over the toolbar's left inset while the sidebar is hidden).
 */
export function TitleBar({
  onOpenPalette,
  title,
  sidebarCollapsed,
  onToggleSidebar,
  showSidebarRef,
  onActionsSlot,
  onActionsRoom,
}: TitleBarProps) {
  const toolbarRef = useRef<HTMLElement>(null)
  const leadRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLButtonElement>(null)

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
      const gaps = parseFloat(bar.columnGap) + parseFloat(getComputedStyle(trail).columnGap)
      return Math.floor(inner - lead.offsetWidth - search.offsetWidth - gaps)
    }
    onActionsRoom({ measure })
    const observer = new ResizeObserver(() => onActionsRoom({ measure }))
    observer.observe(toolbar)
    return () => observer.disconnect()
  }, [onActionsRoom])

  return (
    <header ref={toolbarRef} className="titlebar">
      <div ref={leadRef} className="titlebar-lead">
        {/* Only the Mac hides the sidebar; the brand look keeps it as a rail with its own toggle. */}
        {sidebarCollapsed && platform === 'mac' ? (
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
        {/* The page's own <h1> (visually hidden) stays the accessible title. */}
        <span className="titlebar-title" aria-hidden="true">
          {title}
        </span>
      </div>
      <div ref={trailRef} className="titlebar-trail">
        <div ref={onActionsSlot} className="titlebar-actions" />
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
