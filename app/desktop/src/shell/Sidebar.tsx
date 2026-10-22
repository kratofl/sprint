import type { RefObject } from 'react'
import { PanelLeft } from 'lucide-react'
import sprintMark from '../assets/sprint-mark.svg'
import { platform } from '../platform'
import { footerNav, primaryNav, type NavItem } from './nav'
import { AccountRow } from './AccountRow'
import type { Account, AppView } from '../bridge'

/** Lucide's default stroke is heavier than the brand's line icons; 1.6 matches the mockups. */
const NAV_ICON_STROKE = 1.6

/**
 * The full-height 224px sidebar. Its top band, level with the toolbar, holds the
 * Sprint mark and name, then the toggle, which collapses the sidebar to a 56px
 * rail of icons (the persisted `sidebarCollapsed` setting): labels leave, and each
 * item keeps its name as tooltip and accessible name. The selected item gets the
 * strong fill and the brand icon. The footer holds Settings (with a dot when an
 * update is available) and Help, then the account row under a hairline.
 *
 * On macOS (styles.mac.css) the band has no mark: the traffic lights sit in its
 * first 80px, with the toggle on the right, and collapsing hides the sidebar
 * entirely, as in Finder or Mail; the toolbar then offers it back.
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
  return (
    <nav className={collapsed ? 'navview collapsed' : 'navview'} aria-label="Main navigation">
      <div className="navview-band">
        {platform === 'mac' ? null : (
          <span className="navview-brand">
            <img src={sprintMark} alt="" aria-hidden="true" />
            Sprint
          </span>
        )}
        <button
          ref={toggleRef}
          type="button"
          className="navview-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <PanelLeft size={16} strokeWidth={NAV_ICON_STROKE} />
        </button>
      </div>
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
      // A collapsed rail hides the visible label, so the name moves here.
      aria-label={badge || collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={() => onSelect(item.view)}
    >
      <Icon size={16} strokeWidth={NAV_ICON_STROKE} />
      <span className="nav-item-label">{item.label}</span>
      {badge ? <span className="nav-item-badge" aria-hidden="true" /> : null}
    </button>
  )
}
