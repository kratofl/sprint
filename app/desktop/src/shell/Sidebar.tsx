import { Menu } from 'lucide-react'
import { footerNav, primaryNav, type NavItem } from './nav'
import { AccountRow } from './AccountRow'
import type { AppView } from '../bridge'

/** Lucide's default stroke is heavier than Fluent's line icons; 1.6 matches the mockup. */
const NAV_ICON_STROKE = 1.6

/**
 * Fluent NavigationView pane on Mica: 248px, or 48px icon-only in compact mode
 * (the hamburger toggles the persisted `sidebarCollapsed` setting). The
 * selected item gets the subtle fill plus a 3×16px brand indicator. The footer
 * holds the account row, then Settings (with a dot when an update is
 * available) and Help.
 */
export function Sidebar({
  view,
  collapsed,
  onToggleCollapsed,
  onSelect,
  webAppUrl,
  driverName,
  updateAvailable,
}: {
  view: AppView
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelect: (view: AppView) => void
  webAppUrl: string | null
  driverName: string | null
  updateAvailable: boolean
}) {
  return (
    <nav className={collapsed ? 'navview collapsed' : 'navview'} aria-label="Main navigation">
      <button
        type="button"
        className="navview-toggle"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        <Menu size={16} strokeWidth={NAV_ICON_STROKE} />
      </button>
      {primaryNav.map((item) => renderItem(item, view, collapsed, onSelect, false))}
      <div className="navview-spacer" />
      <AccountRow webAppUrl={webAppUrl} driverName={driverName} collapsed={collapsed} />
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
