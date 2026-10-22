import type { RefObject } from 'react'
import { Menu, PanelLeft } from 'lucide-react'
import { platform } from '../platform'
import { footerNav, primaryNav, type NavItem } from './nav'
import { AccountRow } from './AccountRow'
import type { Account, AppView } from '../bridge'

/** Lucide's default stroke is heavier than Fluent's line icons; 1.6 matches the mockup. */
const NAV_ICON_STROKE = 1.6

/**
 * Fluent NavigationView pane on Mica: 248px, or 48px icon-only in compact mode
 * (the hamburger toggles the persisted `sidebarCollapsed` setting). The
 * selected item gets the subtle fill plus a 3×16px brand indicator. The footer
 * holds the account row, then Settings (with a dot when an update is
 * available) and Help.
 *
 * On macOS the same markup is a full-height 224px source-list sidebar
 * (styles.mac.css): the toggle sits right of the traffic lights and hides the
 * sidebar entirely, as in Finder or Mail; the toolbar then offers it back.
 */
export function Sidebar({
  view,
  collapsed,
  onToggleCollapsed,
  toggleRef,
  onSelect,
  account,
  onOpenAccount,
  updateAvailable,
}: {
  view: AppView
  collapsed: boolean
  onToggleCollapsed: () => void
  toggleRef: RefObject<HTMLButtonElement | null>
  onSelect: (view: AppView) => void
  account: Account | null
  onOpenAccount: () => void
  updateAvailable: boolean
}) {
  const mac = platform === 'mac'
  const toggleLabel = mac ? 'Hide sidebar' : collapsed ? 'Expand navigation' : 'Collapse navigation'
  const toggle = (
    <button
      ref={toggleRef}
      type="button"
      className="navview-toggle"
      onClick={onToggleCollapsed}
      aria-label={toggleLabel}
      aria-expanded={!collapsed}
      title={toggleLabel}
    >
      {mac ? <PanelLeft size={16} strokeWidth={NAV_ICON_STROKE} /> : <Menu size={16} strokeWidth={NAV_ICON_STROKE} />}
    </button>
  )
  // On macOS the toggle sits in the sidebar's 52px top band, right of the traffic lights.
  return (
    <nav className={collapsed ? 'navview collapsed' : 'navview'} aria-label="Main navigation">
      {mac ? <div className="navview-band">{toggle}</div> : toggle}
      {primaryNav.map((item) => renderItem(item, view, collapsed, onSelect, false))}
      <div className="navview-spacer" />
      <AccountRow account={account} collapsed={collapsed} onOpen={onOpenAccount} />
      {footerNav.map((item) => renderItem(item, view, collapsed, onSelect, item.view === 'Settings' && updateAvailable))}
    </nav>
  )
}

function renderItem(item: NavItem, activeView: AppView, collapsed: boolean, onSelect: (view: AppView) => void, badge: boolean) {
  const isActive = item.view === activeView
  const Icon = item.icon
  const label = badge ? `${item.label} — update available` : item.label
  return (
    <button
      type="button"
      key={item.view}
      className={isActive ? 'nav-item active' : 'nav-item'}
      aria-current={isActive ? 'page' : undefined}
      aria-label={badge ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={() => onSelect(item.view)}
    >
      <Icon size={16} strokeWidth={NAV_ICON_STROKE} />
      <span className="nav-item-label">{item.label}</span>
      {badge ? <span className="nav-item-badge" aria-hidden="true" /> : null}
    </button>
  )
}
